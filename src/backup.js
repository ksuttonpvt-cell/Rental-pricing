// Backups of the data folder (prices, quote requests, staff logins).
// A copy is made every night at 12:30 AM and kept 14 days, in data/backups/<date-time>/.
// Restoring first saves the current data as its own backup, then swaps the files in.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const FILES = ["site.json", "requests.json", "users.json"];
const KEEP_DAYS = 14;
const pad = n => String(n).padStart(2, "0");
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const NAME = /^\d{4}-\d{2}-\d{2}_\d{6}(-[a-z][a-z-]*)?$/;

function createBackups({ dataDir, log = console.log }) {
  const dir = path.join(dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });

  function make(kind = "manual") {
    const name = `${stamp(new Date())}${kind === "nightly" ? "" : "-" + kind}`;
    const dest = path.join(dir, name);
    fs.mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const f of FILES) {
      const src = path.join(dataDir, f);
      if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(dest, f)); n++; }
    }
    log(`Backup made (${kind}): ${name}, ${n} file${n === 1 ? "" : "s"}.`);
    return name;
  }

  function list() {
    return fs.readdirSync(dir).filter(n => NAME.test(n)).sort().reverse().map(name => {
      const p = path.join(dir, name);
      const files = fs.readdirSync(p).filter(f => FILES.includes(f));
      const size = files.reduce((s, f) => s + fs.statSync(path.join(p, f)).size, 0);
      const [d, t] = name.split("_");
      const at = new Date(`${d}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`).toISOString();
      const kind = name.length > 17 ? name.slice(18) : "nightly";
      return { name, at, kind, files, size };
    });
  }

  function prune() {
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    for (const b of list()) {
      if (new Date(b.at).getTime() < cutoff) {
        fs.rmSync(path.join(dir, b.name), { recursive: true, force: true });
        log(`Old backup removed: ${b.name}`);
      }
    }
  }

  function filePath(name, file) {
    if (!NAME.test(String(name)) || !FILES.includes(String(file))) return null;
    const p = path.join(dir, name, file);
    return fs.existsSync(p) ? p : null;
  }

  // Returns the parsed files so the server can load them without restarting.
  function restore(name) {
    if (!NAME.test(String(name)) || !fs.existsSync(path.join(dir, name))) throw new Error("That backup doesn't exist.");
    const incoming = {};
    for (const f of FILES) {
      const p = path.join(dir, name, f);
      if (fs.existsSync(p)) incoming[f] = JSON.parse(fs.readFileSync(p, "utf8")); // fails before anything changes if a file is damaged
    }
    if (!incoming["site.json"]) throw new Error("That backup has no prices file, so it can't be restored.");
    make("before-restore");
    for (const [f, value] of Object.entries(incoming)) {
      const dest = path.join(dataDir, f), tmp = dest + ".restore.tmp";
      fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
      fs.renameSync(tmp, dest);
    }
    log(`Backup restored: ${name}`, "warn");
    return incoming;
  }

  // Nightly at 12:30 AM (this PC's time).
  function schedule() {
    const next = new Date(); next.setHours(0, 30, 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    setTimeout(() => {
      try { make("nightly"); prune(); } catch (e) { log(`Nightly backup failed: ${e.message}`, "error"); }
      schedule();
    }, next - Date.now()).unref();
  }

  return { dir, make, list, prune, restore, filePath, schedule };
}

module.exports = { createBackups };
