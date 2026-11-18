#!/usr/bin/env node
/*
 * Rental Rates website server. No outside packages needed (Node.js 18+).
 *   node server.js                 start the website
 *   node server.js add-user NAME   create or reset a staff login (asks for a password)
 */
"use strict";
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const Rates = require("./public/shared.js");
const { createLogbook } = require("./src/logbook");
const { createUpdater, RESTART_CODE } = require("./src/updater");
const { createBackups } = require("./src/backup");

// Settings can live in a .env file next to this one (see .env.example).
const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE) && process.loadEnvFile) { try { process.loadEnvFile(ENV_FILE); } catch (e) { console.error("Could not read .env:", e.message); } }

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const PUBLIC_DIR = path.join(__dirname, "public");
// Set TRUST_PROXY=1 when running behind Cloudflare Tunnel or another proxy.
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;

const FILES = {
  site: path.join(DATA_DIR, "site.json"),
  users: path.join(DATA_DIR, "users.json"),
  requests: path.join(DATA_DIR, "requests.json"),
};

/* ---------- storage ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
let writing = Promise.resolve();
function writeJson(file, value) {
  if (file === FILES.users) setTimeout(() => { try { usersMtime = fs.statSync(FILES.users).mtimeMs; } catch {} }, 200);
  // queue writes and swap files atomically so a crash never leaves half a file
  writing = writing.then(async () => {
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
    // Windows can briefly lock a file (antivirus, backup tools), so retry the swap a few times.
    for (let i = 0; ; i++) {
      try { await fsp.rename(tmp, file); break; }
      catch (err) {
        if (i >= 9 || !["EPERM", "EBUSY", "EACCES"].includes(err.code)) throw err;
        await new Promise(r => setTimeout(r, 100 * (i + 1)));
      }
    }
  }).catch(err => { console.error("Could not save", file, err); throw err; });
  return writing;
}
if (!fs.existsSync(FILES.site)) {
  fs.writeFileSync(FILES.site, fs.readFileSync(path.join(__dirname, "default-site.json")));
}
const SUPERVISED = process.env.RENTALS_SUPERVISED === "1";
const STARTED_AT = new Date().toISOString();
// Recent log lines for the staff Server tab (the supervisor also saves them to data/logs).
const logbook = createLogbook({ max: 2000 });
if (process.argv[2] !== "add-user") logbook.captureConsole("site");
const backups = createBackups({ dataDir: DATA_DIR, log: (m, level) => level === "error" ? console.error(m) : level === "warn" ? console.warn(m) : console.log(m) });
const updater = createUpdater({ cwd: __dirname, enabled: SUPERVISED && process.env.AUTO_UPDATE !== "0" });
if (!SUPERVISED) updater.state.reason = updater.state.reason || "Started without start-rentals.bat, so it can't restart itself after an update.";

let site = readJson(FILES.site, null);
// If the prices have never been saved (still a starting copy), switch to the newest starting prices.
// Anything a staff member saved is never replaced.
{
  const fresh = readJson(path.join(__dirname, "default-site.json"), null);
  if (site && fresh && (site.version || 1) <= 1 && site.updatedAt !== fresh.updatedAt) {
    site = fresh;
    fs.writeFileSync(FILES.site, JSON.stringify(site, null, 2));
    console.log("Prices had never been saved, so the newest starting prices were loaded.");
  }
}
let users = readJson(FILES.users, []);
let requests = readJson(FILES.requests, []);

// Logins made with add-staff-login.bat while the site is running are picked up on the next sign-in.
let usersMtime = 0;
try { usersMtime = fs.statSync(FILES.users).mtimeMs; } catch {}
function syncUsers() {
  try {
    const t = fs.statSync(FILES.users).mtimeMs;
    if (t !== usersMtime) { usersMtime = t; users = readJson(FILES.users, users); console.log("Staff logins file changed on disk, reloaded it."); }
  } catch { /* no file yet */ }
}

/* ---------- passwords ---------- */
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}
function checkPassword(user, password) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.hash, "hex"));
}
const DUMMY = hashPassword("not-a-real-password");

/* ---------- CLI: add-user ---------- */
if (process.argv[2] === "add-user") {
  const username = (process.argv[3] || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
    console.error("Usage: node server.js add-user NAME   (letters, numbers, . _ - only)");
    process.exit(1);
  }
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = s => { if (s.includes("Password")) process.stdout.write(s); };
  rl.question("Password (10+ characters): ", pw => {
    rl.close(); process.stdout.write("\n");
    if (pw.length < 10) { console.error("Password must be at least 10 characters."); process.exit(1); }
    const existing = users.find(u => u.username === username);
    const h = hashPassword(pw);
    if (existing) Object.assign(existing, h);
    else users.push({ username, ...h, admin: true, createdAt: new Date().toISOString() });
    writeJson(FILES.users, users).then(() => { console.log(`${existing ? "Updated" : "Created"} staff login "${username}".`); process.exit(0); });
  });
  return;
}

/* ---------- sessions & rate limits ---------- */
const sessions = new Map(); // token -> { username, expires }
function newSession(username) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { username, expires: Date.now() + SESSION_HOURS * 3600e3 });
  return token;
}
function getCookie(req, name) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function currentUser(req) {
  const t = getCookie(req, "sid");
  const s = t && sessions.get(t);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(t); return null; }
  if (!users.some(u => u.username === s.username)) { sessions.delete(t); return null; }
  return s.username;
}
// Older logins (made before staff roles existed) count as admins.
const isAdmin = username => { const u = users.find(x => x.username === username); return !!u && u.admin !== false; };

/* ---------- live numbers for the Server tab ---------- */
const perMinute = new Map(); // minute -> { n, ms, errors }
function track(status, ms) {
  const k = Math.floor(Date.now() / 60000);
  const b = perMinute.get(k) || { n: 0, ms: 0, errors: 0 };
  b.n++; b.ms += ms; if (status >= 500) b.errors++;
  perMinute.set(k, b);
  if (perMinute.size > 70) for (const key of perMinute.keys()) if (key < k - 60) perMinute.delete(key);
}
function traffic() {
  const now = Math.floor(Date.now() / 60000), out = [];
  for (let k = now - 59; k <= now; k++) { const b = perMinute.get(k) || { n: 0, ms: 0, errors: 0 }; out.push({ at: new Date(k * 60000).toISOString(), n: b.n, ms: b.n ? Math.round(b.ms / b.n) : 0, errors: b.errors }); }
  return out;
}

function isHttps(req) { return TRUST_PROXY ? (req.headers["x-forwarded-proto"] || "").includes("https") : !!req.socket.encrypted; }
function sessionCookie(req, token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;
}
function clientIp(req) {
  if (TRUST_PROXY) return String(req.headers["cf-connecting-ip"] || (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket.remoteAddress).trim();
  return req.socket.remoteAddress;
}
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  b.push(now); buckets.set(key, b);
  return b.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (s.expires < now) sessions.delete(k);
  for (const [k, b] of buckets) if (!b.some(t => now - t < 3600e3)) buckets.delete(k);
}, 600e3).unref();

/* ---------- helpers ---------- */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
}
function readBody(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    if (!(req.headers["content-type"] || "").includes("application/json")) return reject(Object.assign(new Error("Expected JSON"), { status: 415 }));
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(Object.assign(new Error("Bad JSON"), { status: 400 })); } });
    req.on("error", reject);
  });
}
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : 0; };
const id = v => String(v ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || crypto.randomBytes(5).toString("hex");

/* Keep only known fields so the stored file stays clean. */
function cleanSite(input, version) {
  const s = input.settings || {};
  const settings = {
    businessName: str(s.businessName, 100), tagline: str(s.tagline, 120), phone: str(s.phone, 40),
    email: str(s.email, 120), address: str(s.address, 300), hours: str(s.hours, 400),
    mapUrl: /^https:\/\//.test(str(s.mapUrl, 500)) ? str(s.mapUrl, 500) : "",
    weeklyDiscount: num(s.weeklyDiscount, 0, 100), fuelPerGallon: num(s.fuelPerGallon, 0, 1000),
    terms: str(s.terms, 600), contact: str(s.contact, 300),
    visitorSiteOn: s.visitorSiteOn !== false, requestsOn: s.requestsOn !== false,
    offlineMessage: str(s.offlineMessage, 300),
  };
  // every price id must be unique across the main page and all partner pages
  const seen = new Set();
  const uniq = v => { let x = id(v); while (seen.has(x)) x = crypto.randomBytes(5).toString("hex"); seen.add(x); return x; };
  const cleanSections = list => (Array.isArray(list) ? list : []).slice(0, 30).map(sec => ({
    id: uniq(sec.id), title: str(sec.title, 100), kind: sec.kind === "special" ? "special" : "regular", note: str(sec.note, 300),
    items: (Array.isArray(sec.items) ? sec.items : []).slice(0, 100).map(it => ({
      id: uniq(it.id), name: str(it.name, 100), detail: str(it.detail, 200),
      daily: num(it.daily, 0, 100000),
      weekly: it.weekly === "" || it.weekly == null ? "" : num(it.weekly, 0, 1000000),
      noWeekly: !!it.noWeekly, tag: str(it.tag, 40),
    })).filter(it => it.name),
  }));
  const sections = cleanSections(input.sections);
  const reserved = new Set(["staff", "api", "vendor"]);
  const slugs = new Set();
  const partners = (Array.isArray(input.partners) ? input.partners : []).slice(0, 50).map(p => ({
    label: str(p.label, 60), slug: str(p.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, ""),
    headline: str(p.headline, 100), message: str(p.message, 300),
    alsoMainSpecials: !!p.alsoMainSpecials, alsoRegular: !!p.alsoRegular,
    sections: cleanSections(p.sections),
  })).filter(p => p.label && p.slug && !reserved.has(p.slug) && !slugs.has(p.slug) && slugs.add(p.slug));
  return { version, updatedAt: new Date().toISOString(), settings, sections, partners };
}

/* ---------- static files ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
async function serveFile(res, file, status = 200) {
  try {
    const body = await fsp.readFile(file);
    const ext = path.extname(file);
    send(res, status, body, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300" });
  } catch { send(res, 404, "Not found", { "Content-Type": "text/plain" }); }
}

/* ---------- routes ---------- */
async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const m = req.method;

  if (p.startsWith("/api/")) {
    // Writes must come from our own pages (blocks cross-site form posts).
    if (m !== "GET") {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: "bad_origin" });
    }
    const user = currentUser(req);
    const needUser = () => { if (!user) { json(res, 401, { error: "login_required" }); return true; } return false; };

    if (p === "/api/site" && m === "GET") return json(res, 200, site);

    if (p === "/api/site" && m === "PUT") {
      if (needUser()) return;
      const body = await readBody(req, 500_000);
      if (body.version !== site.version) return json(res, 409, { error: "conflict", message: "Prices changed since you opened them." });
      const before = site.settings || {};
      site = cleanSite(body, (site.version || 0) + 1);
      if (!isAdmin(user)) for (const k of ["visitorSiteOn", "requestsOn", "offlineMessage"]) site.settings[k] = k === "offlineMessage" ? (before[k] || "") : before[k] !== false;
      await writeJson(FILES.site, site);
      return json(res, 200, site);
    }

    if (p === "/api/login" && m === "POST") {
      if (limited("login:" + clientIp(req), 10, 15 * 60e3)) return json(res, 429, { error: "rate_limited" });
      syncUsers();
      const body = await readBody(req, 2000);
      const u = users.find(x => x.username === String(body.username || "").trim().toLowerCase());
      const ok = u ? checkPassword(u, String(body.password || "")) : (checkPassword(DUMMY, "x"), false);
      if (!ok) return json(res, 401, { error: "bad_login" });
      const token = newSession(u.username);
      return json(res, 200, { username: u.username, admin: isAdmin(u.username) }, { "Set-Cookie": sessionCookie(req, token, SESSION_HOURS * 3600) });
    }
    if (p === "/api/logout" && m === "POST") {
      const t = getCookie(req, "sid"); if (t) sessions.delete(t);
      return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
    }
    if (p === "/api/me" && m === "GET") {
      if (needUser()) return;
      return json(res, 200, { username: user, admin: isAdmin(user) });
    }

    if (p === "/api/requests" && m === "POST") {
      if (site.settings.visitorSiteOn === false || site.settings.requestsOn === false) return json(res, 403, { error: "requests_off" });
      if (limited("req:" + clientIp(req), 8, 3600e3)) return json(res, 429, { error: "rate_limited" });
      const b = await readBody(req, 20_000);
      if (b.company) return json(res, 200, { ok: true }); // spam trap field
      const name = str(b.name, 80), phone = str(b.phone, 40), email = str(b.email, 120);
      if (!name || (!phone && !email)) return json(res, 400, { error: "missing_contact" });
      const source = str(b.source, 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
      const view = Rates.pageView(site, source);
      const options = (Array.isArray(b.options) ? b.options : []).slice(0, 10).map(o => {
        const f = Rates.findItem(view, String(o.itemId));
        if (!f) return null;
        const dates = o.mode === "dates" && /^\d{4}-\d{2}-\d{2}$/.test(o.start) && /^\d{4}-\d{2}-\d{2}$/.test(o.end);
        const days = dates ? Rates.daysBetween(o.start, o.end) : Rates.cleanDays(o.days);
        return {
          itemId: f.item.id, itemName: f.item.name, section: f.section.title, model: str(o.model, 60),
          mode: dates ? "dates" : "days", start: dates ? o.start : "", end: dates ? o.end : "", days,
          total: Rates.priceFor(f.item, days, Rates.settingsOf(view)).total,
        };
      }).filter(Boolean);
      if (!options.length) return json(res, 400, { error: "no_options" });
      requests.unshift({
        id: crypto.randomBytes(6).toString("hex"), createdAt: new Date().toISOString(), status: "new",
        name, phone, email, message: str(b.message, 1000), source: Rates.partnerOf(site, source) ? source : "",
        combined: !!b.combined && options.length > 1, options,
      });
      requests = requests.slice(0, 2000);
      await writeJson(FILES.requests, requests);
      return json(res, 200, { ok: true });
    }
    if (p === "/api/requests" && m === "GET") {
      if (needUser()) return;
      return json(res, 200, { requests });
    }
    const rm = p.match(/^\/api\/requests\/([a-f0-9]{1,40})$/);
    if (rm && (m === "PATCH" || m === "DELETE")) {
      if (needUser()) return;
      const r = requests.find(x => x.id === rm[1]);
      if (!r) return json(res, 404, { error: "not_found" });
      if (m === "DELETE") requests = requests.filter(x => x !== r);
      else { const b = await readBody(req, 1000); r.status = b.status === "done" ? "done" : "new"; }
      await writeJson(FILES.requests, requests);
      return json(res, 200, { ok: true });
    }

    const needAdmin = () => { if (needUser()) return true; if (!isAdmin(user)) { json(res, 403, { error: "admin_only", message: "Only admins can do that." }); return true; } return false; };
    if (p === "/api/users" && m === "GET") {
      if (needAdmin()) return;
      return json(res, 200, { users: users.map(u => ({ username: u.username, createdAt: u.createdAt, admin: u.admin !== false })) });
    }
    if (p === "/api/users" && m === "POST") {
      if (needAdmin()) return;
      const b = await readBody(req, 2000);
      const username = String(b.username || "").trim().toLowerCase(), password = String(b.password || "");
      if (!/^[a-z0-9._-]{2,40}$/.test(username)) return json(res, 400, { error: "bad_username", message: "Use 2–40 letters, numbers, dots, dashes or underscores." });
      if (password.length < 10) return json(res, 400, { error: "weak_password", message: "Password must be at least 10 characters." });
      if (users.some(u => u.username === username)) return json(res, 400, { error: "exists", message: "That username is taken." });
      users.push({ username, ...hashPassword(password), admin: !!b.admin, createdAt: new Date().toISOString() });
      await writeJson(FILES.users, users);
      return json(res, 200, { ok: true });
    }
    const um = p.match(/^\/api\/users\/([a-z0-9._-]{2,40})$/);
    if (um && m === "PATCH") {
      if (needAdmin()) return;
      if (um[1] === user) return json(res, 400, { error: "self", message: "You can't change your own admin access." });
      const u = users.find(x => x.username === um[1]);
      if (!u) return json(res, 404, { error: "not_found" });
      const b = await readBody(req, 1000);
      u.admin = !!b.admin;
      await writeJson(FILES.users, users);
      console.log(`${user} ${u.admin ? "made" : "removed"} admin access for ${u.username}.`);
      return json(res, 200, { ok: true });
    }
    if (um && m === "DELETE") {
      if (needAdmin()) return;
      if (um[1] === user) return json(res, 400, { error: "self", message: "You can't remove your own account." });
      users = users.filter(u => u.username !== um[1]);
      await writeJson(FILES.users, users);
      for (const [k, s] of sessions) if (s.username === um[1]) sessions.delete(k);
      return json(res, 200, { ok: true });
    }
    if (p === "/api/password" && m === "POST") {
      if (needUser()) return;
      const b = await readBody(req, 2000);
      const u = users.find(x => x.username === user);
      if (!checkPassword(u, String(b.current || ""))) return json(res, 400, { error: "bad_password", message: "Current password is wrong." });
      if (String(b.next || "").length < 10) return json(res, 400, { error: "weak_password", message: "New password must be at least 10 characters." });
      Object.assign(u, hashPassword(String(b.next)));
      await writeJson(FILES.users, users);
      return json(res, 200, { ok: true });
    }
    /* ----- Server tab (admins only) ----- */
    if (p.startsWith("/api/server/")) {
      if (needAdmin()) return;
      const what = p.slice(12);
      if (what === "status" && m === "GET") {
        const mem = process.memoryUsage();
        const t = traffic();
        const lastHour = t.reduce((a, x) => ({ n: a.n + x.n, ms: a.ms + x.ms * x.n, errors: a.errors + x.errors }), { n: 0, ms: 0, errors: 0 });
        return json(res, 200, {
          startedAt: STARTED_AT, supervised: SUPERVISED, node: process.version, platform: process.platform,
          memoryMb: Math.round(mem.rss / 1048576), dataDir: DATA_DIR, port: PORT,
          app: (() => { try { return require("./package.json").version; } catch { return null; } })(),
          updates: { ...updater.state }, logCounts: logbook.counts(),
          traffic: t, lastHour: { requests: lastHour.n, avgMs: lastHour.n ? Math.round(lastHour.ms / lastHour.n) : 0, errors: lastHour.errors },
          sessions: sessions.size, newRequests: requests.filter(r => r.status !== "done").length,
          switches: { visitorSiteOn: site.settings.visitorSiteOn !== false, requestsOn: site.settings.requestsOn !== false },
        });
      }
      if (what === "logs" && m === "GET") {
        const q = url.searchParams;
        return json(res, 200, { lines: logbook.recent({ after: Number(q.get("after")) || 0, level: q.get("level") || "", q: q.get("q") || "", limit: q.get("limit") || 500 }) });
      }
      if (what === "updates" && m === "GET") return json(res, 200, { state: updater.state, history: await updater.history(15) });
      if (what === "check-updates" && m === "POST") {
        console.log(`${user} pressed Check for updates.`);
        const result = await updater.check();
        return json(res, 200, { result, state: updater.state });
      }
      if (what === "restart" && m === "POST") {
        if (!SUPERVISED) return json(res, 400, { error: "not_supervised", message: "The site was started without start-rentals.bat, so it can't restart itself. Restart it by hand." });
        console.warn(`${user} pressed Restart the site.`);
        json(res, 200, { ok: true });
        setTimeout(() => process.exit(RESTART_CODE), 300);
        return;
      }
      if (what === "backups" && m === "GET") return json(res, 200, { backups: backups.list() });
      if (what === "backups" && m === "POST") {
        const name = backups.make("manual");
        console.log(`${user} made a backup (${name}).`);
        return json(res, 200, { ok: true, name });
      }
      const bm = what.match(/^backups\/([0-9_a-z-]+)\/(site\.json|requests\.json|users\.json)$/);
      if (bm && m === "GET") {
        const file = backups.filePath(bm[1], bm[2]);
        if (!file) return json(res, 404, { error: "not_found" });
        return send(res, 200, fs.readFileSync(file), { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${bm[1]}-${bm[2]}"`, "Cache-Control": "no-store" });
      }
      const rm2 = what.match(/^backups\/([0-9_a-z-]+)\/restore$/);
      if (rm2 && m === "POST") {
        try {
          const data = backups.restore(rm2[1]);
          if (data["site.json"]) site = data["site.json"];
          if (data["users.json"]) users = data["users.json"];
          if (data["requests.json"]) requests = data["requests.json"];
          console.warn(`${user} restored backup ${rm2[1]}.`);
          return json(res, 200, { ok: true });
        } catch (e) { return json(res, 400, { error: "restore_failed", message: e.message }); }
      }
      return json(res, 404, { error: "not_found" });
    }
    return json(res, 404, { error: "not_found" });
  }

  if (p === "/healthz") return send(res, 200, "ok", { "Content-Type": "text/plain", "Cache-Control": "no-store" });
  if (m !== "GET" && m !== "HEAD") return send(res, 405, "Method not allowed", { "Content-Type": "text/plain" });
  if (p === "/staff" || p === "/staff/") return serveFile(res, path.join(PUBLIC_DIR, "staff.html"));
  if (p === "/robots.txt") return send(res, 200, "User-agent: *\nDisallow: /staff\nDisallow: /api/\n", { "Content-Type": "text/plain" });

  // real files in /public
  const rel = decodeURIComponent(p).replace(/^\/+/, "");
  if (rel && rel.includes(".")) {
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 400, "Bad path");
    return serveFile(res, file);
  }
  // "/" and partner links like "/body-shop" all open the visitor page
  const slug = rel.replace(/\/+$/, "").toLowerCase();
  if (!slug || (site.partners || []).some(x => x.slug === slug)) return serveFile(res, path.join(PUBLIC_DIR, "index.html"));
  return serveFile(res, path.join(PUBLIC_DIR, "index.html"), 404);
}

const server = http.createServer((req, res) => {
  const t0 = process.hrtime.bigint();
  res.on("finish", () => { if (req.url !== "/healthz") track(res.statusCode, Number(process.hrtime.bigint() - t0) / 1e6); });
  handle(req, res).catch(err => {
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : "server_error" });
    if (!err.status) console.error(err);
  });
});
server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already being used by another program.`);
    console.error(`Either the rental site is already running (for example from run-at-startup.ps1),`);
    console.error(`or another site uses this port. Pick a different PORT in start-site.bat and run-at-startup.ps1.\n`);
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, HOST, () => {
  console.log(`Rental site running on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`  Visitor side: /        Staff side: /staff`);
  if (!users.length) console.log(`  No staff logins yet. Create one with: node server.js add-user YOURNAME`);
  updater.start();
  backups.schedule();
});
