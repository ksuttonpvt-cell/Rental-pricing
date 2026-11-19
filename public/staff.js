(function () {
  const R = window.Rates;
  const $ = id => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 9);
  let site = null, me = null, requests = [];

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/api/login") { showLogin(); throw Object.assign(new Error("Please log in again."), { status: 401 }); }
    if (!res.ok) throw Object.assign(new Error(data.message || data.error || "Something went wrong."), { status: res.status, data });
    return data;
  }
  const say = (el, msg, ok) => { el.className = ok ? "note-ok" : "note-err"; el.textContent = msg; };

  /* Login */
  function showLogin() { $("login-view").hidden = false; $("app-view").hidden = true; $("logout").hidden = true; $("who").textContent = ""; }
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      me = await api("/api/login", { method: "POST", body: { username: $("l-user").value.trim(), password: $("l-pass").value } });
      $("l-pass").value = "";
      start();
    } catch (err) { say($("l-out"), err.status === 429 ? "Too many tries. Wait a few minutes." : "Wrong username or password."); }
  });
  $("logout").addEventListener("click", async () => { try { await api("/api/logout", { method: "POST" }); } catch {} showLogin(); });

  async function start() {
    $("login-view").hidden = true; $("app-view").hidden = false; $("logout").hidden = false;
    $("who").textContent = `Logged in as ${me.username}${me.admin ? " (admin)" : ""}`;
    document.querySelectorAll("[data-admin]").forEach(el => el.hidden = !me.admin);
    await loadSite();
    loadRequests();
  }
  async function loadSite() {
    site = await api("/api/site");
    $("brand").textContent = (site.settings && site.settings.businessName ? site.settings.businessName + " · " : "") + "Staff";
    builder.setSite(R.staffView(site));
    renderPriceEditor();
    fillBiz();
    renderPartners();
  }
  async function saveSite(next) {
    try {
      site = await api("/api/site", { method: "PUT", body: next });
      builder.setSite(R.staffView(site));
      $("brand").textContent = (site.settings.businessName ? site.settings.businessName + " · " : "") + "Staff";
      return true;
    } catch (err) {
      if (err.status === 409) { alertInline("Someone else saved changes first. The latest version has been loaded; please make your change again."); await loadSite(); }
      throw err;
    }
  }
  function alertInline(msg) {
    const n = document.createElement("div");
    n.className = "partner-banner"; n.style.margin = "0 0 16px"; n.textContent = msg;
    $("app-view").insertBefore(n, $("app-view").children[1]);
    setTimeout(() => n.remove(), 8000);
  }

  /* Tabs */
  document.querySelectorAll("[data-tab]").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x === t));
    document.querySelectorAll("[data-panel]").forEach(p => p.hidden = p.dataset.panel !== t.dataset.tab);
    if (t.dataset.tab === "requests") loadRequests();
    if (t.dataset.tab === "accounts" && me.admin) loadUsers();
    if (t.dataset.tab === "server") openServerTab();
    if (t.dataset.tab === "design") openDesign();
  }));

  /* Quotes */
  const builder = window.QuoteBuilder($("opts"), updateEmail);
  function updateEmail(rows, count) {
    $("combined-wrap").hidden = (count || 0) < 2;
    if (!rows) rows = builder.rows();
    const combined = rows.length > 1 && $("q-combined").checked;
    const sum = R.round2(rows.reduce((s, r) => s + r.p.total, 0));
    if (!rows.length) { $("total-box").hidden = true; $("q-summary").innerHTML = ""; $("q-email").value = ""; return; }
    if (rows.length === 1 || combined) {
      $("total-box").hidden = false;
      $("q-total-label").textContent = combined ? "Combined total" : "Estimated total";
      $("q-total").textContent = R.fmt(combined ? sum : rows[0].p.total);
      const note = R.totalNote(R.settingsOf(site));
      $("q-sub").textContent = combined ? `${rows.length} rentals · ${note}` : `${R.lenName(rows[0].days)} · ${R.optionLabel(rows[0])} · ${note}`;
    } else $("total-box").hidden = true;
    $("q-summary").innerHTML = rows.map(r => `<li><span><b>Option ${r.n}:</b> ${R.esc(R.optionLabel(r))}, ${R.esc(R.lenName(r.days))}</span><span class="amt">${R.fmt(r.p.total)}</span></li>`
        + (rows.length === 1 && r.p.feeLines.length ? [["Rental", r.p.rental], ...r.p.feeLines].map(([l, a]) => `<li class="fee"><span>${R.esc(l)}</span><span>${R.fmt(a)}</span></li>`).join("") : "")).join("")
      + (combined ? `<li class="combined"><span>Combined total</span><span class="amt">${R.fmt(sum)}</span></li>` : "");
    const text = R.buildEmail(site, rows, { name: $("q-name").value.trim(), combined, compare: $("q-compare").checked });
    $("q-email").value = text;
    const subject = rows.length === 1 ? `Rental estimate: ${R.optionLabel(rows[0])}, ${R.plural(rows[0].days, "day")}` : `Rental estimates: ${rows.length} options`;
    $("mail-link").href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  }
  $("add-opt").addEventListener("click", () => builder.add());
  ["q-name", "q-compare", "q-combined"].forEach(id => $(id).addEventListener("input", () => updateEmail(null, builder.rows().length)));
  $("q-combined").addEventListener("change", () => updateEmail(null, builder.rows().length));
  $("copy-btn").addEventListener("click", () => {
    const ta = $("q-email");
    const done = m => { $("copied").textContent = m; $("copied").hidden = false; setTimeout(() => $("copied").hidden = true, 2500); };
    const fallback = () => { ta.focus(); ta.select(); done("Text selected. Press Ctrl+C or ⌘C to copy."); };
    try { navigator.clipboard.writeText(ta.value).then(() => done("Copied"), fallback); } catch { fallback(); }
  });

  /* Requests */
  async function loadRequests() {
    try { requests = (await api("/api/requests")).requests || []; } catch { return; }
    const n = requests.filter(r => r.status !== "done").length;
    $("req-badge").hidden = !n; $("req-badge").textContent = n;
    renderRequests();
  }
  function renderRequests() {
    const showDone = $("show-done").checked;
    const list = requests.filter(r => showDone || r.status !== "done");
    const partners = site.partners || [];
    $("req-list").innerHTML = list.length ? list.map(r => {
      const src = r.source ? R.sourceLabel(site, r.source) : "Main visitor link";
      return `<article class="req ${r.status !== "done" ? "new" : ""}" data-id="${R.esc(r.id)}">
        <div class="req-head"><h3>${R.esc(r.name)}</h3><span class="muted">${new Date(r.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · ${R.esc(src)}</span></div>
        <p>${[r.phone, r.email].filter(Boolean).map(R.esc).join(" · ")}</p>
        <ul class="money">${(r.options || []).map((o, i) => `<li>Option ${i + 1}: ${R.esc(o.model ? o.model + " · " : "")}${R.esc(o.itemName)}, ${R.esc(R.lenName(o.days))}${o.mode === "dates" && o.start ? ` (${R.esc(R.niceDate(o.start))} to ${R.esc(R.niceDate(o.end))})` : ""}: <b>${R.fmt(o.total)}</b></li>`).join("")}
          ${r.combined ? `<li>Renting all together: <b>${R.fmt((r.options || []).reduce((s, o) => s + o.total, 0))}</b></li>` : ""}</ul>
        ${r.message ? `<p class="muted">“${R.esc(r.message)}”</p>` : ""}
        <div class="actions">
          <button class="btn small" data-act="quote">Open in quote builder</button>
          <button class="btn small" data-act="${r.status === "done" ? "reopen" : "done"}">${r.status === "done" ? "Mark as new" : "Mark as finished"}</button>
          <button class="btn small danger" data-act="delete">Delete</button>
        </div>
      </article>`;
    }).join("") : `<div class="empty">${showDone ? "No requests yet." : "No new requests."}</div>`;
  }
  $("show-done").addEventListener("change", renderRequests);
  $("reload-req").addEventListener("click", loadRequests);
  $("req-list").addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const card = b.closest("[data-id]"); const r = requests.find(x => x.id === card.dataset.id);
    if (b.dataset.act === "quote") {
      builder.reset();
      // replace the blank option with the request's options
      const rows = r.options || [];
      rows.forEach((o, i) => { if (i === 0) builder.quote(o.itemId); else builder.add(o.itemId); });
      const cards = $("opts").querySelectorAll("[data-opt]");
      rows.forEach((o, i) => {
        const c = cards[i]; if (!c) return;
        const set = (k, v) => { const el = c.querySelector(`[data-k="${k}"]`); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } };
        set("model", o.model || "");
        if (o.mode === "dates" && o.start) { c.querySelector('[data-mode="dates"]').click(); }
      });
      // re-query after possible re-render for dates/days
      $("opts").querySelectorAll("[data-opt]").forEach((c, i) => {
        const o = rows[i]; if (!o) return;
        const set = (k, v) => { const el = c.querySelector(`[data-k="${k}"]`); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } };
        if (o.mode === "dates") { set("start", o.start); set("end", o.end); } else set("days", o.days);
      });
      $("q-name").value = r.name; $("q-combined").checked = !!r.combined;
      updateEmail(null, rows.length);
      document.querySelector('[data-tab="quotes"]').click();
      return;
    }
    if (b.dataset.act === "delete") {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to delete"; return; }
      await api(`/api/requests/${encodeURIComponent(r.id)}`, { method: "DELETE" });
    } else {
      await api(`/api/requests/${encodeURIComponent(r.id)}`, { method: "PATCH", body: { status: b.dataset.act === "done" ? "done" : "new" } });
    }
    loadRequests();
  });

  /* Sections editor: used for the main price list and for each partner page's own prices */
  function SectionsEditor(mount, opts) {
    let draft = [];
    const P = opts.prefix;
    function draw() {
      mount.innerHTML = `${draft.length ? "" : `<div class="empty">${R.esc(opts.emptyText || "No prices yet.")}</div>`}
      ${draft.map((sec, si) => `<div class="ed-section">
        <div class="top">
          <div class="field"><label for="${P}-t-${si}">Section title</label><input id="${P}-t-${si}" data-sec="${si}" data-k="title" value="${R.esc(sec.title)}"></div>
          <div class="field"><label for="${P}-k-${si}">Style</label><select id="${P}-k-${si}" data-sec="${si}" data-k="kind">
            <option value="regular" ${sec.kind !== "special" ? "selected" : ""}>Regular price list</option>
            <option value="special" ${sec.kind === "special" ? "selected" : ""}>Specials (highlighted)</option></select></div>
          <button class="btn small danger" data-del-sec="${si}" type="button">Remove section</button>
        </div>
        <div class="field"><label for="${P}-n-${si}">Section note <span class="hint">(optional)</span></label><input id="${P}-n-${si}" data-sec="${si}" data-k="note" value="${R.esc(sec.note)}"></div>
        ${(sec.items || []).map((it, ii) => `<div class="ed-item">
          <div class="field wide"><label for="${P}-in-${si}-${ii}">Name</label><input id="${P}-in-${si}-${ii}" data-sec="${si}" data-item="${ii}" data-k="name" value="${R.esc(it.name)}"></div>
          <div class="field wide"><label for="${P}-id-${si}-${ii}">Details</label><input id="${P}-id-${si}-${ii}" data-sec="${si}" data-item="${ii}" data-k="detail" value="${R.esc(it.detail)}" placeholder="Models or who it's for"></div>
          <div class="field"><label for="${P}-ip-${si}-${ii}">Daily $</label><input id="${P}-ip-${si}-${ii}" type="number" min="0" step="0.01" data-sec="${si}" data-item="${ii}" data-k="daily" value="${R.esc(it.daily)}"></div>
          <div class="field"><label for="${P}-iw-${si}-${ii}">7-day $ <span class="hint">blank = auto</span></label><input id="${P}-iw-${si}-${ii}" type="number" min="0" step="0.01" data-sec="${si}" data-item="${ii}" data-k="weekly" value="${R.esc(it.weekly ?? "")}" ${it.noWeekly ? "disabled" : ""}></div>
          <button class="btn small danger" type="button" data-del-item="${si}-${ii}">Remove</button>
          <div class="opt actions">
            <span class="ed-photo">${R.itemPhoto(it) ? `<img src="${R.esc(R.itemPhoto(it))}" alt="">` : `<span class="muted">No photo</span>`}</span>
            <label class="btn small" style="cursor:pointer">Change photo<input type="file" accept="image/png,image/jpeg,image/webp" data-photo-for="${si}-${ii}" hidden></label>
            ${R.itemPhoto(it) ? `<button class="btn small ghost" type="button" data-photo-clear="${si}-${ii}">No photo</button>` : ""}
            ${it.photo !== undefined ? `<button class="btn small ghost" type="button" data-photo-default="${si}-${ii}">Use standard photo</button>` : ""}
            <label class="check" style="margin:0"><input type="checkbox" data-sec="${si}" data-item="${ii}" data-k="noWeekly" ${it.noWeekly ? "checked" : ""}> Daily price only (no weekly discount)</label>
            ${sec.kind === "special" ? `<div class="field" style="margin:0;min-width:160px"><label for="${P}-it-${si}-${ii}">Badge</label><input id="${P}-it-${si}-${ii}" data-sec="${si}" data-item="${ii}" data-k="tag" value="${R.esc(it.tag || "")}" placeholder="Special"></div>` : ""}
          </div>
        </div>`).join("")}
        <div><button class="btn small" type="button" data-add-item="${si}">+ Add price</button></div>
      </div>`).join("")}
      <div class="actions">
        <button class="btn" type="button" data-add-sec="special">+ Add specials section</button>
        <button class="btn" type="button" data-add-sec="regular">+ Add regular price section</button>
      </div>
      ${opts.save ? `<div class="sticky-save">
        <span data-msg role="status"></span>
        <button class="btn ghost" type="button" data-undo>Undo changes</button>
        <button class="btn primary" type="button" data-save>${R.esc(opts.saveLabel || "Save prices")}</button>
      </div>` : ""}`;
    }
    function change(el) {
      const sec = draft[+el.dataset.sec];
      const target = el.dataset.item !== undefined ? sec.items[+el.dataset.item] : sec;
      const k = el.dataset.k;
      if (el.type === "checkbox") target[k] = el.checked;
      else if (k === "daily") target[k] = el.value === "" ? 0 : Number(el.value);
      else if (k === "weekly") target[k] = el.value === "" ? "" : Number(el.value);
      else target[k] = el.value;
      if (k === "kind" || k === "noWeekly") draw();
    }
    mount.addEventListener("input", e => { if (e.target.dataset.sec !== undefined && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") change(e.target); });
    mount.addEventListener("change", e => { if (e.target.dataset.sec !== undefined && (e.target.type === "checkbox" || e.target.tagName === "SELECT")) change(e.target); });
    mount.addEventListener("change", async e => {
      const f = e.target.dataset.photoFor && e.target.files[0]; if (!f) return;
      const [si, ii] = e.target.dataset.photoFor.split("-").map(Number);
      if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 1_500_000) { alertInline("Pick a PNG, JPG or WebP photo under 1.5 MB."); return; }
      const dataUrl = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
      try { const { file } = await api("/api/logos", { method: "POST", body: { dataUrl } }); draft[si].items[ii].photo = file; draw(); }
      catch (err) { alertInline(err.message); }
    });
    mount.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b || !mount.contains(b)) return;
      if (b.dataset.photoClear) { const [si, ii] = b.dataset.photoClear.split("-").map(Number); draft[si].items[ii].photo = ""; return draw(); }
      if (b.dataset.photoDefault) { const [si, ii] = b.dataset.photoDefault.split("-").map(Number); delete draft[si].items[ii].photo; return draw(); }
      const blank = kind => ({ id: uid(), name: "", detail: "", daily: 0, weekly: "", noWeekly: false, tag: kind === "special" ? "Special" : "" });
      if (b.dataset.addItem !== undefined) { const s = draft[+b.dataset.addItem]; s.items.push(blank(s.kind)); draw(); }
      else if (b.dataset.delItem) { const [si, ii] = b.dataset.delItem.split("-").map(Number); draft[si].items.splice(ii, 1); draw(); }
      else if (b.dataset.delSec !== undefined) {
        if (b.dataset.armed) { draft.splice(+b.dataset.delSec, 1); draw(); }
        else { b.dataset.armed = "1"; b.textContent = "Click again to remove"; }
      }
      else if (b.dataset.addSec) {
        const kind = b.dataset.addSec;
        draft.push({ id: uid(), title: kind === "special" ? (opts.specialTitle || "Specials") : "Regular pricing", kind, note: "", items: [blank(kind)] });
        draw();
      }
      else if (b.dataset.undo !== undefined) self.reset();
      else if (b.dataset.save !== undefined) {
        const msg = mount.querySelector("[data-msg]");
        b.disabled = true; msg.className = ""; msg.textContent = "Saving…";
        try { await opts.save(self.value()); self.reset(); const m2 = mount.querySelector("[data-msg]"); say(m2, "Saved. The visitor site is updated.", true); }
        catch (err) { say(msg, err.message); b.disabled = false; }
      }
    });
    const self = {
      reset() { draft = JSON.parse(JSON.stringify(opts.getSections() || [])); draw(); },
      value() { return draft.map(s => Object.assign({}, s, { items: (s.items || []).filter(it => String(it.name).trim()) })); }
    };
    return self;
  }

  const mainEditor = SectionsEditor($("price-editor"), {
    prefix: "m",
    getSections: () => site.sections,
    save: sections => saveSite(Object.assign({}, site, { sections })),
    emptyText: "No prices yet. Add a specials section or a regular price list."
  });
  function renderPriceEditor() { mainEditor.reset(); }

  /* Business info */
  function fillBiz() {
    const st = R.settingsOf(site);
    document.querySelectorAll("#biz-form [data-s]").forEach(el => el.value = st[el.dataset.s] ?? "");
  }
  $("biz-form").addEventListener("submit", async e => {
    e.preventDefault();
    const settings = Object.assign({}, site.settings);
    document.querySelectorAll("#biz-form [data-s]").forEach(el => {
      settings[el.dataset.s] = el.type === "number" ? (el.value === "" ? 0 : Number(el.value)) : el.value.trim();
    });
    try { await saveSite(Object.assign({}, site, { settings })); say($("biz-out"), "Saved.", true); renderPriceEditor(); renderPartners(); }
    catch (err) { say($("biz-out"), err.message); }
  });

  /* QR codes */
  function qrMatrix(text) {
    const q = window.qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount();
    return { n, dark: (r, c) => q.isDark(r, c) };
  }
  function qrSvg(text) {
    const { n, dark } = qrMatrix(text), m = 4, size = n + m * 2;
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${R.esc(text)}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  function qrPng(text, px = 1200) {
    const { n, dark } = qrMatrix(text), m = 4, size = n + m * 2, cell = Math.floor(px / size);
    const cv = document.createElement("canvas"); cv.width = cv.height = cell * size;
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) g.fillRect((c + m) * cell, (r + m) * cell, cell, cell);
    return cv.toDataURL("image/png");
  }
  function downloadQr(url, name) {
    const a = document.createElement("a");
    a.href = qrPng(url); a.download = `qr-${name || "rental-rates"}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function printSign(url, p) {
    const st = R.settingsOf(site);
    const view = R.pageView(site, p ? p.slug : "");
    const specials = view.sections.filter(s => s.kind === "special").flatMap(s => s.items).slice(0, 4);
    const title = p ? (p.headline || `${p.label} rental rates`) : "Rental Rates";
    const logo = p && p.logo ? `<img class="logo" src="${location.origin}/logos/${R.esc(p.logo)}" alt="">` : "";
    const w = window.open("", "_blank");
    if (!w) { alertInline("Your browser blocked the print window. Allow pop-ups for this site and try again."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${R.esc(title)}</title>
      <style>
        @page { size: letter; margin: 0.6in; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; text-align: center; margin: 0; }
        .biz { font-size: 20px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #0e6b74; margin-top: 10px; }
        h1 { font-size: 44px; margin: 10px 0 6px; line-height: 1.05; }
        .msg { font-size: 18px; color: #333; margin: 0 auto 18px; max-width: 6in; }
        .qr { width: 4in; height: 4in; margin: 10px auto; }
        .qr svg { width: 100%; height: 100%; }
        .scan { font-size: 22px; font-weight: 700; margin: 6px 0 2px; }
        .url { font-size: 18px; font-family: monospace; margin-bottom: 22px; }
        .specials { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin: 0 auto 18px; }
        .sp { border: 3px solid #f2b707; border-radius: 12px; padding: 10px 16px; min-width: 2in; }
        .sp b { display: block; font-size: 16px; }
        .sp span { font-size: 28px; font-weight: 800; }
        .contact { font-size: 16px; color: #333; white-space: pre-line; }
        .logo { display: block; max-height: 1.1in; max-width: 3.5in; margin: 0 auto 6px; object-fit: contain; }
      </style></head><body>
      ${logo}
      <div class="biz">${R.esc(st.businessName || "")}</div>
      <h1>${R.esc(title)}</h1>
      ${p && p.message ? `<p class="msg">${R.esc(p.message)}</p>` : ""}
      ${specials.length ? `<div class="specials">${specials.map(it => `<div class="sp"><b>${R.esc(it.name)}</b><span>${R.fmt(R.rates(it, st).daily)}</span>/day</div>`).join("")}</div>` : ""}
      <div class="qr">${qrSvg(url)}</div>
      <div class="scan">Scan for prices and a free estimate</div>
      <div class="url">${R.esc(url.replace(/^https?:\/\//, ""))}</div>
      <div class="contact">${R.esc([st.phone, st.address, ...R.hoursLines(st.hours)].filter(Boolean).join("\n"))}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  /* Partner pages: categories (e.g. Body shop) and their locations (e.g. ABC Collision) */
  const RESERVED = ["staff", "api", "vendor", "logos", "healthz"];
  const slugify = v => String(v || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const pageUrl = slug => `${location.origin}/${slug || ""}`;
  const allSlugs = () => (site.partners || []).flatMap(c => [c.slug, ...(c.locations || []).map(l => l.slug)]);
  let editing = null;   // { type: "cat" | "loc", cat: slug, loc: slug, isNew }
  let draft = null;     // copy of the category or location being edited
  let pageEditor = null;

  const priceSummary = sections => {
    const items = (sections || []).flatMap(s => s.items || []);
    if (!items.length) return "";
    const st = R.settingsOf(site);
    return items.slice(0, 2).map(i => `${i.name} ${R.fmt(R.rates(i, st).daily)}/day`).join(" · ") + (items.length > 2 ? ` · +${items.length - 2} more` : "");
  };
  const linkActions = (slug, name) => `
    <button class="btn small" type="button" data-act="copy" data-url="${R.esc(pageUrl(slug))}">Copy link</button>
    <button class="btn small" type="button" data-act="png" data-url="${R.esc(pageUrl(slug))}" data-name="${R.esc(slug || "main")}">Download QR code</button>
    <button class="btn small" type="button" data-act="print" data-slug="${R.esc(slug)}">Print sign</button>`;

  function catEditorHtml(c) {
    return `<div class="pc-edit">
      <div class="ed-settings">
        <div class="field"><label for="ce-label">Category name</label><input id="ce-label" value="${R.esc(c.label)}" maxlength="60" placeholder="e.g. Body shop"></div>
        <div class="field"><label for="ce-slug">Link ending <span class="hint">(letters, numbers, dashes)</span></label><input id="ce-slug" value="${R.esc(c.slug)}" maxlength="40" placeholder="body-shop"></div>
        <div class="field"><label for="ce-message">Welcome message <span class="hint">(locations use it too unless they have their own)</span></label><textarea id="ce-message" rows="2" maxlength="300">${R.esc(c.message || "")}</textarea></div>
      </div>
      <h4 class="ed-h">Page wording and photo</h4>
      <p class="muted ed-note">This is what visitors read at the top of the page. Locations in this category use it too, with their own name as the headline.</p>
      <div class="ed-settings">
        <div class="field"><label for="ce-badge">Small label above the headline</label><input id="ce-badge" value="${R.esc(c.content.badge)}" maxlength="60" placeholder="e.g. For hotels"></div>
        <div class="field"><label for="ce-headline">Headline</label><input id="ce-headline" value="${R.esc(c.content.headline)}" maxlength="120"></div>
        <div class="field" style="grid-column:1/-1"><label for="ce-sub">Line under the headline</label><input id="ce-sub" value="${R.esc(c.content.sub)}" maxlength="200"></div>
      </div>
      <div class="logo-row">
        <div class="logo-box photo">${R.photoUrl(c.content.photo) ? `<img src="${R.esc(R.photoUrl(c.content.photo))}" alt="Page photo">` : `<span class="muted">No photo</span>`}</div>
        <div class="field" style="margin:0">
          <label for="ce-photo">Page photo <span class="hint">(PNG, JPG or WebP, up to 1.5 MB; wide photos look best)</span></label>
          <input id="ce-photo" type="file" accept="image/png,image/jpeg,image/webp">
          ${c.content.photo ? `<button class="btn small ghost danger" type="button" data-act="photo-remove" style="justify-self:start">Remove photo</button>` : ""}
          <span id="ce-photo-msg" role="status"></span>
        </div>
      </div>
      <div class="ed-settings">
        <div class="field" style="grid-column:1/-1"><label for="ce-benefits">Benefits <span class="hint">(one per line, shown with check marks)</span></label><textarea id="ce-benefits" rows="6">${R.esc(c.content.benefits.join("\n"))}</textarea></div>
        <div class="field"><label for="ce-stepsTitle">Steps title</label><input id="ce-stepsTitle" value="${R.esc(c.content.stepsTitle)}" maxlength="80" placeholder="How it works"></div>
        <div class="field"><label for="ce-steps">Steps <span class="hint">(one per line, numbered)</span></label><textarea id="ce-steps" rows="4">${R.esc(c.content.steps.join("\n"))}</textarea></div>
        <div class="field"><label for="ce-whyTitle">Extra list title <span class="hint">(optional)</span></label><input id="ce-whyTitle" value="${R.esc(c.content.whyTitle)}" maxlength="80" placeholder="Why refer us?"></div>
        <div class="field"><label for="ce-why">Extra list <span class="hint">(one per line)</span></label><textarea id="ce-why" rows="4">${R.esc(c.content.why.join("\n"))}</textarea></div>
        <div class="field"><label for="ce-pricingTitle">Pricing heading</label><input id="ce-pricingTitle" value="${R.esc(c.content.pricingTitle)}" maxlength="80" placeholder="e.g. Leisure Rental Pricing"></div>
      </div>
      <h4 class="ed-h">Category prices</h4>
      <p class="muted ed-note">Shown on the category page, and on every location in this category that doesn't have its own prices. If there are none, visitors see your regular pricing.</p>
      <div class="editor" id="pe-sections"></div>
      <label class="check"><input type="checkbox" id="ce-main" ${c.alsoMainSpecials ? "checked" : ""}> Also show the main page specials</label>
      <label class="check"><input type="checkbox" id="ce-regular" ${c.alsoRegular ? "checked" : ""}> Also show regular prices</label>
      <div class="sticky-save">
        <span id="pe-msg" role="status"></span>
        ${editing.isNew ? "" : `<button class="btn ghost danger" type="button" data-act="delete-cat">Delete category</button>`}
        <button class="btn ghost" type="button" data-act="cancel">Cancel</button>
        <button class="btn primary" type="button" data-act="save-cat">Save category</button>
      </div>
    </div>`;
  }
  function locEditorHtml(l, cat) {
    return `<div class="pc-edit">
      <div class="ed-settings">
        <div class="field"><label for="le-name">Business name</label><input id="le-name" value="${R.esc(l.name)}" maxlength="80" placeholder="e.g. ABC Collision"></div>
        <div class="field"><label for="le-slug">Link ending <span class="hint">(letters, numbers, dashes)</span></label><input id="le-slug" value="${R.esc(l.slug)}" maxlength="40" placeholder="abc-collision"></div>
        <div class="field"><label for="le-headline">Page headline</label><input id="le-headline" value="${R.esc(l.headline || "")}" maxlength="100" placeholder="${R.esc((l.name || "Business") + " customer rental rates")}"></div>
        <div class="field"><label for="le-message">Welcome message <span class="hint">(blank = the category's)</span></label><textarea id="le-message" rows="2" maxlength="300" placeholder="${R.esc(cat.message || "")}">${R.esc(l.message || "")}</textarea></div>
      </div>
      <div class="logo-row">
        <div class="logo-box">${l.logo ? `<img src="/logos/${R.esc(l.logo)}" alt="${R.esc(l.name)} logo">` : `<span class="muted">No logo</span>`}</div>
        <div class="field" style="margin:0">
          <label for="le-logo">Logo <span class="hint">(PNG, JPG or WebP, up to 1.5 MB)</span></label>
          <input id="le-logo" type="file" accept="image/png,image/jpeg,image/webp">
          ${l.logo ? `<button class="btn small ghost danger" type="button" data-act="logo-remove" style="justify-self:start">Remove logo</button>` : ""}
          <span id="le-logo-msg" role="status"></span>
        </div>
      </div>
      <h4 class="ed-h">Prices</h4>
      <label class="check"><input type="radio" name="le-prices" value="cat" ${l.useOwnPrices ? "" : "checked"}> Use the ${R.esc(cat.label)} category prices${priceSummary(cat.sections) ? ` <span class="muted">(${R.esc(priceSummary(cat.sections))})</span>` : ""}</label>
      <label class="check"><input type="radio" name="le-prices" value="own" ${l.useOwnPrices ? "checked" : ""}> Give this location its own prices</label>
      ${l.useOwnPrices ? `<div class="editor" id="pe-sections"></div>` : ""}
      <div class="sticky-save">
        <span id="pe-msg" role="status"></span>
        ${editing.isNew ? "" : `<button class="btn ghost danger" type="button" data-act="delete-loc">Delete location</button>`}
        <button class="btn ghost" type="button" data-act="cancel">Cancel</button>
        <button class="btn primary" type="button" data-act="save-loc">Save location</button>
      </div>
    </div>`;
  }

  function renderPartners() {
    const cats = (site.partners || []).slice();
    if (editing && editing.type === "cat" && editing.isNew) cats.push(draft);
    const isEd = (type, cat, loc) => editing && editing.type === type && editing.cat === cat && (type === "cat" || editing.loc === loc);
    const html = [`<article class="partner-card">
      <div class="pc-top"><div class="qr">${qrSvg(pageUrl(""))}</div>
        <div class="pc-info"><h3>Main visitor page</h3><a class="link-url" href="${R.esc(pageUrl(""))}" target="_blank" rel="noopener">${R.esc(pageUrl(""))}</a>
          <p class="muted">Your regular prices and specials.</p><div class="actions">${linkActions("", "Main")}</div></div></div>
    </article>`];
    cats.forEach(c => {
      const catKey = editing && editing.type === "cat" && editing.isNew && c === draft ? "\u0000new" : c.slug;
      const editingCat = isEd("cat", catKey);
      const shown = editingCat ? draft : c;
      const locs = (c.locations || []).slice();
      if (editing && editing.type === "loc" && editing.isNew && editing.cat === c.slug) locs.push(draft);
      const own = priceSummary(c.sections);
      html.push(`<article class="partner-card" data-cat="${R.esc(catKey)}">
        <div class="pc-top"><div class="qr">${c.slug ? qrSvg(pageUrl(c.slug)) : ""}</div>
          <div class="pc-info">
            <span class="eyebrow" style="margin:0">Category</span>
            <h3>${R.esc(shown.label || "New category")}</h3>
            ${c.slug ? `<a class="link-url" href="${R.esc(pageUrl(c.slug))}" target="_blank" rel="noopener">${R.esc(pageUrl(c.slug))}</a>` : ""}
            <p class="muted">${own ? R.esc(own) : "No prices of its own, so it shows regular pricing"} · ${R.plural((c.locations || []).length, "location")}</p>
            <div class="actions">
              ${c.slug ? `<button class="btn small ${editingCat ? "" : "primary"}" type="button" data-act="edit-cat">${editingCat ? "Close editor" : "Edit category"}</button>${linkActions(c.slug, c.label)}` : ""}
            </div>
          </div></div>
        ${editingCat ? catEditorHtml(draft) : ""}
        ${c.slug ? `<div class="loc-list">
          ${locs.map(l => {
            const locKey = editing && editing.type === "loc" && editing.isNew && l === draft ? "\u0000new" : l.slug;
            const editingLoc = isEd("loc", c.slug, locKey);
            const L = editingLoc ? draft : l;
            const prices = l.useOwnPrices ? `Own prices: ${priceSummary(l.sections) || "none yet"}` : `Uses ${c.label} prices`;
            return `<div class="loc" data-loc="${R.esc(locKey)}">
              <div class="loc-top">
                ${l.slug ? `<div class="qr small">${qrSvg(pageUrl(l.slug))}</div>` : `<div class="qr small"></div>`}
                ${L.logo ? `<img class="loc-logo" src="/logos/${R.esc(L.logo)}" alt="">` : ""}
                <div class="pc-info">
                  <h4>${R.esc(L.name || "New location")}</h4>
                  ${l.slug ? `<a class="link-url" href="${R.esc(pageUrl(l.slug))}" target="_blank" rel="noopener">${R.esc(pageUrl(l.slug))}</a>` : ""}
                  <p class="muted">${R.esc(prices)}</p>
                  ${l.slug ? `<div class="actions"><button class="btn small ${editingLoc ? "" : "primary"}" type="button" data-act="edit-loc">${editingLoc ? "Close editor" : "Edit"}</button>${linkActions(l.slug, l.name)}</div>` : ""}
                </div>
              </div>
              ${editingLoc ? locEditorHtml(draft, c) : ""}
            </div>`;
          }).join("")}
          <div><button class="btn small" type="button" data-act="add-loc">+ Add ${R.esc(c.label.toLowerCase())} location</button></div>
        </div>` : ""}
      </article>`);
    });
    $("partners").innerHTML = html.join("");

    const mount = $("pe-sections");
    if (mount) {
      pageEditor = SectionsEditor(mount, {
        prefix: "pe", getSections: () => draft.sections || [],
        specialTitle: `${draft.label || draft.name || "Partner"} specials`,
        emptyText: "No prices here yet. Add a specials section below."
      });
      pageEditor.reset();
    } else pageEditor = null;
  }

  function startEdit(type, cat, loc, isNew, value) {
    editing = { type, cat, loc, isNew };
    draft = JSON.parse(JSON.stringify(value));
    if (type === "cat") draft.content = R.categoryContent(draft);
    renderPartners();
    const first = $(type === "cat" ? "ce-label" : "le-name");
    if (first && isNew) first.focus();
  }
  function stopEdit() { editing = null; draft = null; renderPartners(); }
  const blankSpecials = (title) => [{ id: uid(), title, kind: "special", note: "", items: [{ id: uid(), name: "", detail: "", daily: 0, weekly: "", noWeekly: false, tag: "Special" }] }];
  // Pull typed values from the open editor into the draft (so re-drawing keeps them).
  function readEditor() {
    if (!editing) return;
    const v = id => { const el = $(id); return el ? el.value.trim() : undefined; };
    if (pageEditor) draft.sections = pageEditor.value();
    if (editing.type === "cat") {
      const lines = id => v(id).split("\n").map(x => x.trim()).filter(Boolean);
      Object.assign(draft, { label: v("ce-label"), slug: slugify(v("ce-slug")), headline: v("ce-headline"), message: v("ce-message"),
        alsoMainSpecials: $("ce-main").checked, alsoRegular: $("ce-regular").checked });
      draft.content = Object.assign({}, draft.content, {
        badge: v("ce-badge"), headline: v("ce-headline"), sub: v("ce-sub"),
        benefits: lines("ce-benefits"), stepsTitle: v("ce-stepsTitle"), steps: lines("ce-steps"),
        whyTitle: v("ce-whyTitle"), why: lines("ce-why"), pricingTitle: v("ce-pricingTitle"),
      });
    } else {
      Object.assign(draft, { name: v("le-name"), slug: slugify(v("le-slug")), headline: v("le-headline"), message: v("le-message") });
    }
  }
  function slugProblem(slug, own) {
    if (!slug) return "Enter a link ending, like abc-collision.";
    if (RESERVED.includes(slug)) return "That link ending is used by the site. Pick another.";
    if (allSlugs().filter(s => s !== own).includes(slug)) return "Another page already uses that link ending.";
    return "";
  }

  $("add-partner").addEventListener("click", () => {
    startEdit("cat", "\u0000new", null, true, { label: "", slug: "", headline: "", message: "", alsoMainSpecials: false, alsoRegular: false, sections: blankSpecials("Specials"), locations: [] });
  });
  $("partners").addEventListener("input", e => {
    if (e.target.id === "ce-slug" || e.target.id === "le-slug") {
      e.target.dataset.touched = "1";
      const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (v !== e.target.value) e.target.value = v;
    }
    // New pages: fill the link ending from the name until it's typed by hand.
    const pairs = { "ce-label": "ce-slug", "le-name": "le-slug" };
    if (pairs[e.target.id] && editing && editing.isNew) {
      const sl = $(pairs[e.target.id]);
      if (sl && !sl.dataset.touched) sl.value = slugify(e.target.value);
    }
  });
  $("partners").addEventListener("change", async e => {
    if (e.target.name === "le-prices") {
      readEditor();
      draft.useOwnPrices = e.target.value === "own";
      if (draft.useOwnPrices && !(draft.sections || []).length) {
        const cat = site.partners.find(c => c.slug === editing.cat);
        // Start from a copy of the category's prices so it's quick to tweak.
        draft.sections = (cat.sections || []).length
          ? JSON.parse(JSON.stringify(cat.sections)).map(s => Object.assign(s, { id: uid(), title: s.kind === "special" ? `${draft.name || "Location"} specials` : s.title, items: s.items.map(i => Object.assign(i, { id: uid() })) }))
          : blankSpecials(`${draft.name || "Location"} specials`);
      }
      renderPartners();
    }
    if (e.target.id === "ce-photo") {
      const f = e.target.files[0]; if (!f) return;
      const msg = $("ce-photo-msg");
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return say(msg, "Pick a PNG, JPG or WebP image.");
      if (f.size > 1_500_000) return say(msg, "That image is over 1.5 MB. Use a smaller one.");
      msg.className = ""; msg.textContent = "Uploading…";
      const dataUrl = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
      try {
        const { file } = await api("/api/logos", { method: "POST", body: { dataUrl } });
        readEditor(); draft.content.photo = file; renderPartners();
        say($("ce-photo-msg"), "Photo added. Click Save category to keep it.", true);
      } catch (err) { say(msg, err.message); }
    }
    if (e.target.id === "le-logo") {
      const f = e.target.files[0]; if (!f) return;
      const msg = $("le-logo-msg");
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return say(msg, "Pick a PNG, JPG or WebP image.");
      if (f.size > 1_500_000) return say(msg, "That image is over 1.5 MB. Use a smaller one.");
      msg.className = ""; msg.textContent = "Uploading…";
      const dataUrl = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
      try {
        const { file } = await api("/api/logos", { method: "POST", body: { dataUrl } });
        readEditor(); draft.logo = file; renderPartners();
        say($("le-logo-msg"), "Logo added. Click Save location to keep it.", true);
      } catch (err) { say(msg, err.message); }
    }
  });
  $("partners").addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    const catEl = b.closest("[data-cat]"), locEl = b.closest("[data-loc]");
    const catSlug = catEl && catEl.dataset.cat, locSlug = locEl && locEl.dataset.loc;
    const cat = (site.partners || []).find(c => c.slug === catSlug);

    if (act === "copy") {
      try { await navigator.clipboard.writeText(b.dataset.url); b.textContent = "Copied"; } catch { b.textContent = "Copy failed"; }
      setTimeout(() => b.textContent = "Copy link", 1500); return;
    }
    if (act === "png") return downloadQr(b.dataset.url, b.dataset.name);
    if (act === "print") return printSign(pageUrl(b.dataset.slug), b.dataset.slug ? R.partnerOf(site, b.dataset.slug) : null);
    if (act === "cancel") return stopEdit();
    if (act === "edit-cat") return isOpen("cat", catSlug) ? stopEdit() : startEdit("cat", catSlug, null, false, cat);
    if (act === "edit-loc") return isOpen("loc", catSlug, locSlug) ? stopEdit() : startEdit("loc", catSlug, locSlug, false, cat.locations.find(l => l.slug === locSlug));
    if (act === "add-loc") return startEdit("loc", catSlug, "\u0000new", true, { name: "", slug: "", headline: "", message: "", logo: "", useOwnPrices: false, sections: [] });
    if (act === "photo-remove") { readEditor(); draft.content.photo = ""; return renderPartners(); }
    if (act === "logo-remove") { readEditor(); draft.logo = ""; return renderPartners(); }

    const msg = $("pe-msg");
    async function commit(partners, done) {
      b.disabled = true; msg.className = ""; msg.textContent = "Saving…";
      try { await saveSite(Object.assign({}, site, { partners })); stopEdit(); if (done) alertInline(done); }
      catch (err) { b.disabled = false; say(msg, err.message); }
    }
    if (act === "delete-cat" || act === "delete-loc") {
      if (!b.dataset.armed) {
        b.dataset.armed = "1";
        b.textContent = act === "delete-cat" && (cat.locations || []).length ? `Click again: deletes ${R.plural(cat.locations.length, "location")} too` : "Click again to delete";
        return;
      }
      if (act === "delete-cat") return commit(site.partners.filter(c => c.slug !== editing.cat));
      return commit(site.partners.map(c => c.slug !== editing.cat ? c : Object.assign({}, c, { locations: c.locations.filter(l => l.slug !== editing.loc) })));
    }
    if (act === "save-cat") {
      readEditor();
      if (!draft.label) return say(msg, "Enter a category name.");
      const problem = slugProblem(draft.slug, editing.isNew ? null : editing.cat);
      if (problem) return say(msg, problem);
      const next = Object.assign({}, draft, { locations: draft.locations || [] });
      const partners = editing.isNew ? [...(site.partners || []), next] : site.partners.map(c => c.slug === editing.cat ? next : c);
      return commit(partners, `Saved “${next.label}”. Its page is live at ${pageUrl(next.slug)}`);
    }
    if (act === "save-loc") {
      readEditor();
      if (!draft.name) return say(msg, "Enter the business name.");
      const problem = slugProblem(draft.slug, editing.isNew ? null : editing.loc);
      if (problem) return say(msg, problem);
      if (!draft.useOwnPrices) draft.sections = [];
      const next = Object.assign({}, draft);
      const partners = site.partners.map(c => c.slug !== editing.cat ? c : Object.assign({}, c, {
        locations: editing.isNew ? [...(c.locations || []), next] : c.locations.map(l => l.slug === editing.loc ? next : l)
      }));
      return commit(partners, `Saved “${next.name}”. Its page is live at ${pageUrl(next.slug)}`);
    }
  });
  function isOpen(type, cat, loc) { return editing && editing.type === type && editing.cat === cat && (type === "cat" || editing.loc === loc); }

  /* Accounts */
  async function loadUsers() {
    const { users } = await api("/api/users");
    $("users-table").innerHTML = `<thead><tr><th>Username</th><th>Admin</th><th>Added</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td>${R.esc(u.username)}${u.username === me.username ? " (you)" : ""}</td>
      <td>${u.username === me.username ? "Yes" : `<label class="check" style="margin:0"><input type="checkbox" data-admin-user="${R.esc(u.username)}" ${u.admin ? "checked" : ""}> Admin</label>`}</td>
      <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ""}</td><td>${u.username === me.username ? "" : `<button class="btn small danger" data-user="${R.esc(u.username)}">Remove</button>`}</td></tr>`).join("")}</tbody>`;
  }
  $("users-table").addEventListener("change", async e => {
    const c = e.target.closest("[data-admin-user]"); if (!c) return;
    try { await api(`/api/users/${encodeURIComponent(c.dataset.adminUser)}`, { method: "PATCH", body: { admin: c.checked } }); say($("u-out"), `${c.dataset.adminUser} is ${c.checked ? "now an admin" : "no longer an admin"}.`, true); }
    catch (err) { c.checked = !c.checked; say($("u-out"), err.message); }
  });
  $("users-table").addEventListener("click", async e => {
    const b = e.target.closest("[data-user]"); if (!b) return;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to remove"; return; }
    await api(`/api/users/${encodeURIComponent(b.dataset.user)}`, { method: "DELETE" }); loadUsers();
  });
  $("add-user").addEventListener("submit", async e => {
    e.preventDefault();
    try { await api("/api/users", { method: "POST", body: { username: $("u-name").value.trim(), password: $("u-pass").value, admin: $("u-admin").checked } }); $("add-user").reset(); say($("u-out"), "Added.", true); loadUsers(); }
    catch (err) { say($("u-out"), err.message); }
  });
  $("pw-form").addEventListener("submit", async e => {
    e.preventDefault();
    try { await api("/api/password", { method: "POST", body: { current: $("pw-old").value, next: $("pw-new").value } }); $("pw-form").reset(); say($("pw-out"), "Password changed.", true); }
    catch (err) { say($("pw-out"), err.message); }
  });

  /* Server tab (admins) */
  const ago = iso => { const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`; };
  const when = iso => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";
  let srvTimer = null, logAfter = 0, logLevel = "", logQ = "";
  function fillSwitches() {
    const st = R.settingsOf(site);
    $("sw-site").checked = st.visitorSiteOn !== false;
    $("sw-req").checked = st.requestsOn !== false;
    $("sw-shuttle").checked = st.shuttleOn !== false;
    $("sw-msg").value = st.offlineMessage || "";
    switchNotes();
  }
  function switchNotes() {
    $("sw-site-note").textContent = $("sw-site").checked ? "On: anyone can see prices and get estimates." : "Off: visitors see your message and phone number instead.";
    $("sw-shuttle-note").textContent = $("sw-shuttle").checked ? "On: visitors and quote emails show the free shuttle ride link." : "Off: the shuttle ride link is hidden everywhere.";
    $("sw-req-note").textContent = $("sw-req").checked ? "On: visitors can send quote requests." : "Off: the request form is hidden; visitors are asked to call.";
  }
  ["sw-site", "sw-req", "sw-shuttle"].forEach(id => $(id).addEventListener("change", switchNotes));
  $("sw-save").addEventListener("click", async () => {
    const settings = Object.assign({}, site.settings, { visitorSiteOn: $("sw-site").checked, requestsOn: $("sw-req").checked, shuttleOn: $("sw-shuttle").checked, offlineMessage: $("sw-msg").value.trim() });
    try { await saveSite(Object.assign({}, site, { settings })); fillSwitches(); say($("sw-out"), "Saved. The visitor site is updated.", true); loadServer(); }
    catch (err) { say($("sw-out"), err.message); }
  });

  async function loadServer() {
    let s;
    try { s = await api("/api/server/status"); } catch { return; }
    const u = s.updates;
    $("srv-when").textContent = `Updated ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
    const errs = s.logCounts.error;
    $("srv-badge").hidden = !errs; $("srv-badge").textContent = errs;
    const fact = (label, value, note, cls = "") => `<div class="${cls}">${R.esc(label)}<b>${value}</b>${note ? R.esc(note) : ""}</div>`;
    $("srv-facts").innerHTML = [
      fact("Visitor site", s.switches.visitorSiteOn ? "On" : "Off", `Quote requests ${s.switches.requestsOn ? "on" : "off"} · Shuttle ${s.switches.shuttleOn ? "on" : "off"}`, s.switches.visitorSiteOn ? "good" : "bad"),
      fact("Running for", ago(s.startedAt), `Since ${when(s.startedAt)}`),
      fact("Version", R.esc(s.app ? "v" + s.app : "?") + (u.version ? ` <span class="muted" style="font-size:13px">${R.esc(u.version)}</span>` : ""), u.versionDate ? `Built ${when(u.versionDate)}` : ""),
      fact("Visits, last hour", s.lastHour.requests.toLocaleString(), `Average answer ${s.lastHour.avgMs} ms`),
      fact("Problems, last hour", `${errs} error${errs === 1 ? "" : "s"}`, `${s.logCounts.warn} warning${s.logCounts.warn === 1 ? "" : "s"}`, errs ? "bad" : "good"),
      fact("New quote requests", s.newRequests, `${s.sessions} staff logged in`),
      fact("Memory", `${s.memoryMb} MB`, `Node ${s.node}`),
      fact("Auto-restart", s.supervised ? "On" : "Off", s.supervised ? "Started by start-rentals.bat" : "Started without start-rentals.bat", s.supervised ? "good" : "bad"),
    ].join("");
    const max = Math.max(1, ...s.traffic.map(t => t.n));
    $("srv-bars").innerHTML = s.traffic.map(t => `<span class="${t.errors ? "err" : ""}" style="height:${Math.round(t.n / max * 100)}%" title="${new Date(t.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}: ${t.n} visits"></span>`).join("");
    $("srv-restart").disabled = !s.supervised;
    $("upd-state").textContent = !u.enabled ? `Automatic updates are off. ${u.reason || ""}`
      : u.lastError ? `Last check had a problem: ${u.lastError}`
      : `Checks GitHub every few minutes and installs new versions by itself. Last checked ${u.lastCheck ? ago(u.lastCheck) + " ago" : "not yet"}.`;
    $("upd-check").disabled = !u.enabled;
  }
  async function loadUpdates() {
    try {
      const { history } = await api("/api/server/updates");
      $("upd-hist").innerHTML = history.length ? history.map(h => `<li><code>${R.esc(h.hash)}</code><span class="muted">${R.esc(when(h.date))}</span><span>${R.esc(h.subject)}</span></li>`).join("") : `<li class="muted">No update history (not installed with git).</li>`;
    } catch {}
  }
  $("upd-check").addEventListener("click", async () => {
    $("upd-out").className = ""; $("upd-out").textContent = "Checking…";
    try {
      const { result, state } = await api("/api/server/check-updates", { method: "POST" });
      if (result === "updated") say($("upd-out"), "New version installed. The site is restarting; this page will reconnect in a few seconds.", true);
      else if (result === "up-to-date") say($("upd-out"), "Already up to date.", true);
      else say($("upd-out"), state.lastError || "Couldn't check right now.");
      loadServer(); loadUpdates();
    } catch (err) { say($("upd-out"), err.message); }
  });
  $("srv-restart").addEventListener("click", async e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to restart"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Restart the site"; }, 5000); return; }
    delete b.dataset.armed; b.textContent = "Restart the site";
    try { await api("/api/server/restart", { method: "POST" }); say($("srv-out"), "Restarting… this page reconnects in a few seconds.", true); setTimeout(loadServer, 4000); }
    catch (err) { say($("srv-out"), err.message); }
  });

  async function loadBackups() {
    try {
      const { backups } = await api("/api/server/backups");
      const kindName = k => ({ nightly: "Nightly", manual: "Back up now", "before-restore": "Before a restore" }[k] || k);
      $("bk-table").innerHTML = `<thead><tr><th>Made</th><th>Kind</th><th>Download</th><th></th></tr></thead><tbody>${backups.length ? backups.map(b => `<tr>
        <td>${R.esc(when(b.at))}</td><td>${R.esc(kindName(b.kind))}</td>
        <td>${b.files.map(f => `<a href="/api/server/backups/${encodeURIComponent(b.name)}/${encodeURIComponent(f)}">${R.esc({ "site.json": "Prices", "requests.json": "Requests", "users.json": "Logins" }[f] || f)}</a>`).join(" · ")}</td>
        <td><button class="btn small" type="button" data-restore="${R.esc(b.name)}">Restore</button></td></tr>`).join("") : `<tr><td colspan="4" class="muted">No backups yet. The first nightly one is made at 12:30 AM.</td></tr>`}</tbody>`;
    } catch {}
  }
  $("bk-make").addEventListener("click", async () => {
    try { await api("/api/server/backups", { method: "POST" }); say($("bk-out"), "Backup made.", true); loadBackups(); }
    catch (err) { say($("bk-out"), err.message); }
  });
  $("bk-table").addEventListener("click", async e => {
    const b = e.target.closest("[data-restore]"); if (!b) return;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to restore"; return; }
    try { await api(`/api/server/backups/${encodeURIComponent(b.dataset.restore)}/restore`, { method: "POST" }); say($("bk-out"), "Restored. Reloading…", true); setTimeout(() => location.reload(), 1200); }
    catch (err) { say($("bk-out"), err.message); }
  });

  async function loadLog(reset) {
    if (reset) { logAfter = 0; $("log-box").innerHTML = ""; }
    let lines;
    try { ({ lines } = await api(`/api/server/logs?after=${logAfter}&level=${logLevel}&q=${encodeURIComponent(logQ)}`)); } catch { return; }
    const box = $("log-box"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    if (lines.length) {
      logAfter = lines[lines.length - 1].seq;
      box.insertAdjacentHTML("beforeend", lines.map(l => `<div class="${l.level}"><time>${new Date(l.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time> ${R.esc(l.text)}</div>`).join(""));
      while (box.children.length > 1500) box.firstElementChild.remove();
      if (atBottom || reset) box.scrollTop = box.scrollHeight;
    } else if (reset) box.innerHTML = `<div class="muted">Nothing to show.</div>`;
  }
  $("log-levels").addEventListener("click", e => {
    const b = e.target.closest("[data-level]"); if (!b) return;
    logLevel = b.dataset.level;
    $("log-levels").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    loadLog(true);
  });
  let logT; $("log-q").addEventListener("input", e => { clearTimeout(logT); logT = setTimeout(() => { logQ = e.target.value; loadLog(true); }, 300); });

  function openServerTab() {
    fillSwitches(); loadServer(); loadUpdates(); loadBackups(); loadLog(true);
    clearInterval(srvTimer);
    srvTimer = setInterval(() => {
      if ($("app-view").hidden || document.querySelector('[data-panel="server"]').hidden) { clearInterval(srvTimer); return; }
      loadServer(); loadLog(false);
    }, 5000);
  }

  /* Design editor: changes a copy of the site and shows it in a live preview frame. */
  let dSite = null, dSlug = "", dUploads = [], dTimer = null, dDirty = false;
  const dEdited = new Set(); // pages changed in the editor ("" = main page); only these are saved
  const clone = v => JSON.parse(JSON.stringify(v));
  function dTarget() {
    if (!dSlug) {
      dSite.settings.design = Object.assign({}, R.DEFAULT_DESIGN, dSite.settings.design || {});
      const st = dSite.settings;
      return { design: st.design, words: st.design, getPhoto: () => R.settingsOf(dSite).heroPhoto, setPhoto: v => { st.heroPhoto = v; } };
    }
    const cat = dSite.partners.find(c => c.slug === dSlug);
    cat.design = Object.assign({}, R.DEFAULT_DESIGN, cat.design || {});
    cat.content = R.categoryContent(cat);
    return { design: cat.design, words: cat.content, getPhoto: () => cat.content.photo, setPhoto: v => { cat.content.photo = v; } };
  }
  function pickHtml(selected, kind) {
    const items = [{ id: "", label: "None" }, ...R.PHOTO_LIBRARY, ...dUploads.map(f => ({ id: f, label: "Uploaded photo" }))];
    return items.map(p => `<button type="button" class="pick" data-${kind}="${R.esc(p.id)}" aria-pressed="${p.id === (selected || "")}" title="${R.esc(p.label)}">${p.id ? `<img src="${R.esc(R.photoUrl(p.id))}" alt="" loading="lazy">` : `<span>None</span>`}<span class="pick-label">${R.esc(p.label)}</span></button>`).join("");
  }
  function drawDesign() {
    const t = dTarget(), d = t.design;
    $("d-page-note").textContent = dSlug ? "Locations in this category use this design too." : "Your main visitor page.";
    $("d-badge").value = t.words.badge || ""; $("d-headline").value = t.words.headline || ""; $("d-sub").value = t.words.sub || "";
    $("d-badge").placeholder = dSlug ? "" : (R.settingsOf(dSite).tagline || "Car, SUV & truck rentals");
    $("d-headline").placeholder = dSlug ? "" : "Rental Rates";
    $("d-sub").placeholder = dSlug ? "" : "See every price and special, then build your own estimate...";
    $("d-photo").innerHTML = pickHtml(t.getPhoto(), "photo");
    $("d-bg").innerHTML = pickHtml(d.bg, "bg");
    $("d-side").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.side === d.photoSide));
    $("d-fade").value = d.bgFade; $("d-fade-val").textContent = d.bgFade + "%"; $("d-fade").disabled = !d.bg;
    $("d-accent").innerHTML = R.ACCENTS.map(a => `<button type="button" class="swatch" data-accent="${a.id}" aria-pressed="${(d.accent || "") === a.id}" title="${R.esc(a.label)}" style="--sw:${a.color}"><span></span>${R.esc(a.label)}</button>`).join("")
      + `<label class="swatch custom" title="Pick any color"><input type="color" id="d-accent-custom" value="${R.esc(d.accent || "#0e6b74")}"> Custom</label>`;
    $("d-rowphotos").checked = d.rowPhotos !== false;
    $("d-open").href = "/" + dSlug;
  }
  function pushPreview(reloadFrame) {
    try { localStorage.setItem("designDraft", JSON.stringify(dSite)); }
    catch { say($("d-msg"), "This browser blocked the preview. Save to see changes."); return; }
    $("d-msg").className = dDirty ? "note-err" : ""; $("d-msg").textContent = dDirty ? "Unsaved changes" : "";
    const frame = $("d-frame");
    if (reloadFrame || !frame.contentWindow || !String(frame.getAttribute("src") || "").includes("preview=1")) { frame.src = `/${dSlug}?preview=1`; return; }
    // Reload the preview where it was scrolled to.
    try { sessionStorage.setItem("previewScroll", String(frame.contentWindow.scrollY || 0)); frame.contentWindow.location.reload(); }
    catch { frame.src = `/${dSlug}?preview=1`; }
  }
  const edited = () => { dDirty = true; dEdited.add(dSlug); };
  const pushSoon = () => { clearTimeout(dTimer); dTimer = setTimeout(() => pushPreview(false), 300); };
  async function openDesign() {
    if (!dSite) {
      dSite = clone(site);
      // Bring back a design that wasn't saved (for example if the login ran out), if the site hasn't changed since.
      try {
        const saved = JSON.parse(localStorage.getItem("designDraft") || "null");
        if (saved && saved.version === site.version && JSON.stringify(saved.settings.design || null) + JSON.stringify((saved.partners || []).map(p => [p.design, p.content])) !== JSON.stringify(site.settings.design || null) + JSON.stringify((site.partners || []).map(p => [p.design, p.content]))) {
          dSite = saved; dDirty = true;
          // Work out which pages the brought-back design changed.
          const pageOf = (st, slug) => slug ? JSON.stringify((st.partners || []).filter(p => p.slug === slug).map(p => [p.design, p.content])) : JSON.stringify([st.settings.design || null, st.settings.heroPhoto || null]);
          ["", ...(site.partners || []).map(p => p.slug)].forEach(sl => { if (pageOf(saved, sl) !== pageOf(site, sl)) dEdited.add(sl); });
          setTimeout(() => say($("d-msg"), "Your unsaved design was brought back. Click Save design to keep it."), 50);
        }
      } catch {}
    }
    try { dUploads = (await api("/api/logos")).files || []; } catch { dUploads = []; }
    $("d-page").innerHTML = `<option value="">Main visitor page</option>` + (dSite.partners || []).map(c => `<option value="${R.esc(c.slug)}">${R.esc(c.label)} page</option>`).join("");
    $("d-page").value = dSlug;
    drawDesign(); pushPreview(true);
  }
  $("d-page").addEventListener("change", () => { dSlug = $("d-page").value; drawDesign(); pushPreview(true); });
  ["d-badge", "d-headline", "d-sub"].forEach(id => $(id).addEventListener("input", () => { dTarget().words[id.slice(2)] = $(id).value; edited(); pushSoon(); }));
  $("d-fade").addEventListener("input", () => { dTarget().design.bgFade = Number($("d-fade").value); $("d-fade-val").textContent = $("d-fade").value + "%"; edited(); pushSoon(); });
  $("d-rowphotos").addEventListener("change", () => { dTarget().design.rowPhotos = $("d-rowphotos").checked; edited(); pushPreview(false); });
  document.querySelector('[data-panel="design"]').addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const t = dTarget();
    if (b.dataset.photo !== undefined) { t.setPhoto(b.dataset.photo); edited(); drawDesign(); pushPreview(false); }
    else if (b.dataset.bg !== undefined) { t.design.bg = b.dataset.bg; edited(); drawDesign(); pushPreview(false); }
    else if (b.dataset.side) { t.design.photoSide = b.dataset.side; edited(); drawDesign(); pushPreview(false); }
    else if (b.dataset.accent !== undefined) { t.design.accent = b.dataset.accent; edited(); drawDesign(); pushPreview(false); }
    else if (b.dataset.size) {
      $("d-size").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      $("d-frame-wrap").classList.toggle("phone", b.dataset.size === "phone");
    }
  });
  document.querySelector('[data-panel="design"]').addEventListener("input", e => {
    if (e.target.id === "d-accent-custom") { dTarget().design.accent = e.target.value; edited(); $("d-accent").querySelectorAll(".swatch[data-accent]").forEach(x => x.setAttribute("aria-pressed", "false")); pushSoon(); }
  });
  $("d-upload").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 1_500_000) return say($("d-msg"), "Pick a PNG, JPG or WebP photo under 1.5 MB.");
    const dataUrl = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
    try { const { file } = await api("/api/logos", { method: "POST", body: { dataUrl } }); dUploads.unshift(file); drawDesign(); say($("d-msg"), "Photo uploaded. Pick it above.", true); }
    catch (err) { say($("d-msg"), err.message); }
    e.target.value = "";
  });
  $("d-undo").addEventListener("click", () => { dSite = clone(site); dDirty = false; dEdited.clear(); drawDesign(); pushPreview(false); });
  $("d-save").addEventListener("click", async () => {
    $("d-save").disabled = true; $("d-msg").className = ""; $("d-msg").textContent = "Saving…";
    try {
      // Save only the pages changed here, on top of the newest version of the site, so nothing
      // anyone else saved in the meantime (prices, other pages) is overwritten.
      const latest = await api("/api/site");
      const next = clone(latest);
      for (const sl of dEdited) {
        if (!sl) { next.settings.design = clone(dSite.settings.design); next.settings.heroPhoto = dSite.settings.heroPhoto; continue; }
        const from = (dSite.partners || []).find(p => p.slug === sl), to = (next.partners || []).find(p => p.slug === sl);
        if (from && to) { to.design = clone(from.design); to.content = clone(from.content); }
      }
      await saveSite(next);
      dSite = clone(site); dDirty = false; dEdited.clear(); drawDesign(); pushPreview(false);
      say($("d-msg"), "Saved. Visitors see the new design now.", true);
      renderPartners(); renderPriceEditor();
    } catch (err) { say($("d-msg"), err.message); }
    finally { $("d-save").disabled = false; }
  });

  /* Boot */
  api("/api/me").then(u => { me = u; start(); }).catch(() => showLogin());
})();
