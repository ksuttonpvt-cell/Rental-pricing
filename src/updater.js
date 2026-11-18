// Automatic updates: every few minutes, check GitHub for new changes on `main`.
// When there are some, download them (git pull) and restart. The supervisor
// (start-rentals.bat) starts the new version right away.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const RESTART_CODE = 75;

// git is run directly (no shell), so nothing in its arguments is treated as shell syntax.
const git = (cwd, ...args) => new Promise((resolve, reject) =>
  execFile("git", args, { cwd, windowsHide: true, timeout: 2 * 60000 }, (err, out, errOut) => {
    if (err) { err.message = `git ${args[0]} failed: ${String(errOut || err.message).trim()}`; reject(err); }
    else resolve(String(out).trim());
  }));

function createUpdater({
  cwd = path.join(__dirname, ".."),
  branch = process.env.UPDATE_BRANCH || "main",
  enabled = process.env.AUTO_UPDATE !== "0",
  minutes = Number(process.env.UPDATE_CHECK_MINUTES) || 5,
  restart = () => process.exit(RESTART_CODE),
  log = (...a) => console.log("[updates]", ...a),
} = {}) {
  const isGit = fs.existsSync(path.join(cwd, ".git"));
  const state = {
    enabled: enabled && isGit,
    reason: !isGit ? "Not installed with git, so updates must be done by hand." : !enabled ? "Turned off (AUTO_UPDATE=0)." : null,
    version: null, versionDate: null, subject: null, lastCheck: null, lastError: null, checking: false,
  };
  let failedTarget = null; let timer = null;

  async function readVersion() {
    if (!isGit) return;
    try {
      const [hash, date, ...s] = (await git(cwd, "log", "-1", "--format=%h|%cI|%s")).split("|");
      Object.assign(state, { version: hash, versionDate: date, subject: s.join("|") });
    } catch { /* ignore */ }
  }

  // Returns 'up-to-date', 'updated' (and restarts), 'skipped', 'busy' or 'error'.
  async function check() {
    if (!state.enabled) return "skipped";
    if (state.checking) return "busy";
    state.checking = true;
    try {
      await git(cwd, "fetch", "--quiet", "origin", branch);
      const local = await git(cwd, "rev-parse", "HEAD");
      const remote = await git(cwd, "rev-parse", `origin/${branch}`);
      state.lastCheck = new Date().toISOString();
      if (local === remote) { state.lastError = null; return "up-to-date"; }
      if (remote === failedTarget) return "error"; // don't retry the same broken update every few minutes
      try { await git(cwd, "merge-base", "--is-ancestor", "HEAD", `origin/${branch}`); } catch {
        failedTarget = remote;
        state.lastError = "This copy has its own changes, so it can't update automatically. Run \"git status\" in the app folder.";
        log(state.lastError); return "error";
      }
      log(`New version found (${remote.slice(0, 7)}). Downloading...`);
      try { await git(cwd, "pull", "--ff-only", "--quiet", "origin", branch); } catch (e) {
        failedTarget = remote; state.lastError = e.message; log(e.message); return "error";
      }
      state.lastError = null;
      log("Update installed. Restarting...");
      setTimeout(restart, 500);
      return "updated";
    } catch (e) {
      state.lastError = e.message; log("Update check failed:", e.message); return "error";
    } finally {
      state.checking = false;
      await readVersion();
    }
  }

  function start() {
    readVersion();
    if (!state.enabled) { log(state.reason); return; }
    log(`Checking for updates every ${minutes} min.`);
    setTimeout(check, Math.min(30000, minutes * 60000)).unref();
    timer = setInterval(check, minutes * 60000); timer.unref();
  }
  function stop() { clearInterval(timer); }
  async function history(n = 15) {
    if (!isGit) return [];
    try {
      const out = await git(cwd, "log", `-${n}`, "--no-merges", "--format=%h|%cI|%s");
      return out.split("\n").filter(Boolean).map(l => { const [hash, date, ...s] = l.split("|"); return { hash, date, subject: s.join("|") }; });
    } catch { return []; }
  }
  return { state, check, start, stop, readVersion, history };
}

module.exports = { createUpdater, RESTART_CODE };
