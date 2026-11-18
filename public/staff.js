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
      $("q-sub").textContent = combined ? `${rows.length} rentals · before taxes and fees` : `${R.lenName(rows[0].days)} · ${R.optionLabel(rows[0])} · before taxes and fees`;
    } else $("total-box").hidden = true;
    $("q-summary").innerHTML = rows.map(r => `<li><span><b>Option ${r.n}:</b> ${R.esc(R.optionLabel(r))}, ${R.esc(R.lenName(r.days))}</span><span class="amt">${R.fmt(r.p.total)}</span></li>`).join("")
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
      const src = r.source ? (partners.find(p => p.slug === r.source)?.label || r.source) : "Main visitor link";
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
    mount.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b || !mount.contains(b)) return;
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
      </style></head><body>
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

  /* Partner pages */
  let openSlug = null;      // slug of the page being edited ("" while a new page is unsaved)
  let pageEditor = null;
  const pageUrl = p => `${location.origin}/${p ? p.slug : ""}`;
  function renderPartners() {
    const list = site.partners || [];
    const main = { label: "Main visitor page", slug: "" };
    const card = (p, isMain) => {
      const url = isMain ? location.origin + "/" : pageUrl(p);
      const own = (p.sections || []).reduce((n, s) => n + (s.items || []).length, 0);
      const desc = isMain ? "Your regular prices and specials."
        : own ? `Shows only its ${R.plural(own, "own price")}${p.alsoMainSpecials ? " + main specials" : ""}${p.alsoRegular ? " + regular prices" : ""}`
              : `No prices of its own yet, so it shows regular pricing${p.alsoMainSpecials ? " + main specials" : ""}`;
      const editing = !isMain && openSlug === p.slug;
      return `<article class="partner-card" data-slug="${R.esc(p.slug)}" ${isMain ? 'data-main="1"' : ""}>
        <div class="pc-top">
          <div class="qr">${qrSvg(url)}</div>
          <div class="pc-info">
            <h3>${R.esc(p.label || "New partner page")}</h3>
            <a class="link-url" href="${R.esc(url)}" target="_blank" rel="noopener">${R.esc(url)}</a>
            <p class="muted">${R.esc(desc)}</p>
            <div class="actions">
              ${isMain ? "" : `<button class="btn small ${editing ? "" : "primary"}" type="button" data-act="edit">${editing ? "Close editor" : "Edit page"}</button>`}
              <button class="btn small" type="button" data-act="copy" data-url="${R.esc(url)}">Copy link</button>
              <button class="btn small" type="button" data-act="png" data-url="${R.esc(url)}">Download QR code</button>
              <button class="btn small" type="button" data-act="print" data-url="${R.esc(url)}">Print sign</button>
            </div>
          </div>
        </div>
        ${editing ? `<div class="pc-edit">
          <div class="ed-settings">
            <div class="field"><label for="pe-label">Partner name</label><input id="pe-label" value="${R.esc(p.label)}" maxlength="60" placeholder="e.g. Body shop"></div>
            <div class="field"><label for="pe-slug">Link ending <span class="hint">(letters, numbers, dashes)</span></label><input id="pe-slug" value="${R.esc(p.slug)}" maxlength="40" placeholder="body-shop"></div>
            <div class="field"><label for="pe-headline">Page headline</label><input id="pe-headline" value="${R.esc(p.headline || "")}" maxlength="100" placeholder="${R.esc((p.label || "Partner") + " rental rates")}"></div>
            <div class="field"><label for="pe-message">Welcome message</label><textarea id="pe-message" rows="2" maxlength="300">${R.esc(p.message || "")}</textarea></div>
          </div>
          <p class="muted" style="margin:0;font-size:14px">Visitors on this page see only the prices below. If it has none yet, they see your regular pricing.</p>
          <label class="check"><input type="checkbox" id="pe-main" ${p.alsoMainSpecials ? "checked" : ""}> Also show the main page specials</label>
          <label class="check"><input type="checkbox" id="pe-regular" ${p.alsoRegular ? "checked" : ""}> Also show regular prices</label>
          <h4 style="margin:12px 0 0;font-size:17px">Special prices for this page only</h4>
          <div class="editor" id="pe-sections"></div>
          <div class="sticky-save">
            <span id="pe-msg" role="status"></span>
            ${p.slug && list.some(x => x.slug === p.slug) ? `<button class="btn ghost danger" type="button" data-act="delete">Delete page</button>` : ""}
            <button class="btn ghost" type="button" data-act="cancel">Cancel</button>
            <button class="btn primary" type="button" data-act="save">Save page</button>
          </div>
        </div>` : ""}
      </article>`;
    };
    const editingNew = openSlug === "" ? [newPartnerDraft] : [];
    $("partners").innerHTML = card(main, true) + list.map(p => card(p, false)).join("") + editingNew.map(p => card(p, false)).join("");
    const mount = $("pe-sections");
    if (mount) {
      const editingPartner = openSlug === "" ? newPartnerDraft : list.find(x => x.slug === openSlug);
      pageEditor = SectionsEditor(mount, {
        prefix: "pe", getSections: () => editingPartner.sections || [],
        specialTitle: `${editingPartner.label || "Partner"} specials`,
        emptyText: "No special prices for this page yet. Add a specials section below."
      });
      pageEditor.reset();
    } else pageEditor = null;
  }
  let newPartnerDraft = null;
  $("add-partner").addEventListener("click", () => {
    newPartnerDraft = {
      label: "", slug: "", headline: "", message: "", alsoMainSpecials: false, alsoRegular: false,
      sections: [{ id: uid(), title: "Specials", kind: "special", note: "", items: [{ id: uid(), name: "", detail: "", daily: 0, weekly: "", noWeekly: false, tag: "Special" }] }]
    };
    openSlug = "";
    renderPartners();
    $("pe-label").focus();
  });
  $("partners").addEventListener("input", e => {
    if (e.target.id === "pe-slug") {
      const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (v !== e.target.value) e.target.value = v;
    }
  });
  $("partners").addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const cardEl = b.closest("[data-slug]");
    const slug = cardEl.dataset.slug;
    const p = cardEl.dataset.main ? null : ((site.partners || []).find(x => x.slug === slug) || (openSlug === "" ? newPartnerDraft : null));
    const act = b.dataset.act;
    if (act === "copy") {
      try { await navigator.clipboard.writeText(b.dataset.url); b.textContent = "Copied"; } catch { b.textContent = "Copy failed"; }
      setTimeout(() => b.textContent = "Copy link", 1500);
    } else if (act === "png") downloadQr(b.dataset.url, p ? p.slug : "main");
    else if (act === "print") printSign(b.dataset.url, p);
    else if (act === "edit") { openSlug = openSlug === slug ? null : slug; newPartnerDraft = null; renderPartners(); }
    else if (act === "cancel") { openSlug = null; newPartnerDraft = null; renderPartners(); }
    else if (act === "delete") {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to delete this page"; return; }
      try { await saveSite(Object.assign({}, site, { partners: site.partners.filter(x => x.slug !== slug) })); openSlug = null; renderPartners(); }
      catch (err) { say($("pe-msg"), err.message); }
    } else if (act === "save") {
      const reserved = ["staff", "api", "vendor"];
      const next = {
        label: $("pe-label").value.trim(),
        slug: $("pe-slug").value.trim().replace(/^-+|-+$/g, ""),
        headline: $("pe-headline").value.trim(),
        message: $("pe-message").value.trim(),
        alsoMainSpecials: $("pe-main").checked,
        alsoRegular: $("pe-regular").checked,
        sections: pageEditor ? pageEditor.value() : []
      };
      if (!next.label) return say($("pe-msg"), "Enter a partner name.");
      if (!next.slug) return say($("pe-msg"), "Enter a link ending, like body-shop.");
      if (reserved.includes(next.slug)) return say($("pe-msg"), "That link ending is used by the site. Pick another.");
      const others = (site.partners || []).filter(x => x.slug !== (openSlug || "\u0000"));
      if (others.some(x => x.slug === next.slug)) return say($("pe-msg"), "Another page already uses that link ending.");
      const partners = openSlug === "" ? [...(site.partners || []), next] : (site.partners || []).map(x => x.slug === openSlug ? next : x);
      b.disabled = true; $("pe-msg").className = ""; $("pe-msg").textContent = "Saving…";
      try {
        await saveSite(Object.assign({}, site, { partners }));
        openSlug = null; newPartnerDraft = null; renderPartners();
        alertInline(`Saved “${next.label}”. Its page is live at ${location.origin}/${next.slug}`);
      } catch (err) { b.disabled = false; say($("pe-msg"), err.message); }
    }
  });
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
    $("sw-msg").value = st.offlineMessage || "";
    switchNotes();
  }
  function switchNotes() {
    $("sw-site-note").textContent = $("sw-site").checked ? "On: anyone can see prices and get estimates." : "Off: visitors see your message and phone number instead.";
    $("sw-req-note").textContent = $("sw-req").checked ? "On: visitors can send quote requests." : "Off: the request form is hidden; visitors are asked to call.";
  }
  ["sw-site", "sw-req"].forEach(id => $(id).addEventListener("change", switchNotes));
  $("sw-save").addEventListener("click", async () => {
    const settings = Object.assign({}, site.settings, { visitorSiteOn: $("sw-site").checked, requestsOn: $("sw-req").checked, offlineMessage: $("sw-msg").value.trim() });
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
      fact("Visitor site", s.switches.visitorSiteOn ? "On" : "Off", s.switches.requestsOn ? "Quote requests on" : "Quote requests off", s.switches.visitorSiteOn ? "good" : "bad"),
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

  /* Boot */
  api("/api/me").then(u => { me = u; start(); }).catch(() => showLogin());
})();
