(function () {
  const R = window.Rates;
  const $ = id => document.getElementById(id);
  let site = null;
  const slug = location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();

  const builder = window.QuoteBuilder($("opts"), (rows, count) => {
    $("combined-wrap").hidden = count < 2;
    const combined = rows.length > 1 && $("q-combined").checked;
    const sum = R.round2(rows.reduce((s, r) => s + r.p.total, 0));
    if (!rows.length) { $("total-box").hidden = true; $("q-summary").innerHTML = ""; return; }
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
  });
  $("add-opt").addEventListener("click", () => builder.add());
  $("q-combined").addEventListener("change", () => builder.setSite(R.pageView(site, slug)));

  let photoFor = it => R.itemPhoto(it);
  /* Page look from the design editor: accent color, photo side, background photo, price-row photos. */
  function applyLook(d) {
    const root = document.documentElement.style;
    if (/^#[0-9a-f]{6}$/i.test(d.accent || "")) {
      const n = parseInt(d.accent.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      root.setProperty("--accent", d.accent);
      root.setProperty("--accent-ink", lum > 0.6 ? "#111" : "#fff");
      root.setProperty("--accent-soft", `color-mix(in srgb, ${d.accent} 14%, var(--bg))`);
    }
    $("hero").classList.toggle("side-left", d.photoSide === "left");
    const bg = R.photoUrl(d.bg);
    $("page-bg").hidden = !bg;
    if (bg) {
      $("page-bg").style.backgroundImage = `url("${bg}")`;
      $("page-bg-fade").style.opacity = String(Math.min(1, Math.max(0, (Number(d.bgFade) || 0) / 100)));
    }
    photoFor = it => d.rowPhotos === false ? "" : R.itemPhoto(it);
  }

  /* "Who's renting?" tiles on the main page: one per partner category, with its starting price. */
  const ICONS = {
    shop: '<path d="M14 7l3-3 3 3-3 3M17 4v7M4 20l8-8"/>',
    hotel: '<path d="M3 20h18M5 20V8l7-4 7 4v12M9 20v-5h6v5"/>',
    travel: '<path d="M2 16l20-8-6 12-3-5-5-2"/>',
    service: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    other: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>',
  };
  const iconFor = c => /body|repair|collision|shop/i.test(c.slug + c.label) ? "shop" : /hotel|guest|stay/i.test(c.slug + c.label) ? "hotel" : /travel|agen|business/i.test(c.slug + c.label) ? "travel" : /service|loaner/i.test(c.slug + c.label) ? "service" : "other";
  function renderWho(st) {
    const cats = (site.partners || []).filter(c => c.slug && c.label);
    if (!cats.length) { $("who").hidden = true; return; }
    $("who-grid").innerHTML = cats.map(c => {
      const items = R.allItems(R.pageView(site, c.slug)).map(x => R.rates(x.item, st).daily).filter(n => n > 0);
      const from = items.length ? Math.min(...items) : 0;
      const sub = R.categoryContent(c).sub || c.message || "";
      return `<a class="who-tile" href="/${R.esc(c.slug)}">
        <span class="who-ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[iconFor(c)]}</svg></span>
        <b>${R.esc(c.label)}</b>
        ${sub ? `<span class="who-sub">${R.esc(sub)}</span>` : ""}
        ${from ? `<span class="who-from money">From ${R.fmt(from)}/day</span>` : ""}
      </a>`;
    }).join("");
    $("who").hidden = false;
  }

  function telHref(p) { return "tel:" + String(p).replace(/[^\d+]/g, ""); }

  function render() {
    const st = R.settingsOf(site);
    const view = R.pageView(site, slug);
    const partner = R.partnerOf(site, slug);
    const name = st.businessName || "Rentals";
    const content = R.pageContent(site, slug);
    const design = R.designOf(site, slug);
    const pageTitle = content ? content.headline : (design.headline || "Rental Rates");
    document.title = st.businessName ? `${pageTitle} – ${st.businessName}` : pageTitle;
    $("hero-title").textContent = pageTitle;
    if (st.visitorSiteOn === false) {
      $("brand").textContent = name;
      $("foot-name").textContent = `© ${new Date().getFullYear()} ${name}`;
      if (st.phone) { $("top-phone").hidden = false; $("top-phone").textContent = st.phone; $("top-phone").href = telHref(st.phone); }
      $("hero").hidden = true; $("mbar").hidden = true;
      document.querySelector("main").innerHTML = `<section class="panel offline">
        <h2>${R.esc(name)}</h2>
        <p class="lede" style="margin:0 auto 14px">${R.esc(st.offlineMessage || "Our rental prices page is being updated. Please call us for a quote.")}</p>
        ${st.phone ? `<p><a class="btn primary" href="${R.esc(telHref(st.phone))}">Call ${R.esc(st.phone)}</a></p>` : ""}
        ${st.address ? `<p class="muted" style="white-space:pre-line">${R.esc(st.address)}</p>` : ""}
        ${st.hours ? `<p class="muted" style="white-space:pre-line">${R.esc(R.hoursLines(st.hours).join("\n"))}</p>` : ""}
      </section>`;
      return;
    }
    applyLook(design);
    if (!content) {
      if (design.sub) $("hero-lede").textContent = design.sub;
    }
    // The page's photo is the banner behind the headline and price box.
    const heroPhoto = R.photoUrl(content ? content.photo : st.heroPhoto);
    if (heroPhoto) $("hero-bg").style.backgroundImage = `url("${heroPhoto}")`;
    if (content) {
      $("hero-lede").textContent = content.sub || "Rental prices, plus an estimate tool for any vehicle and any length of rental.";
      const list = (title, items, cls, ordered) => items.length ? `<div class="pi-block ${cls}">${title ? `<h2>${R.esc(title)}</h2>` : ""}<${ordered ? "ol" : "ul"}>${items.map(x => `<li>${R.esc(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}></div>` : "";
      const html = list("", content.benefits, "pi-benefits") + list(content.stepsTitle || "How it works", content.steps, "pi-steps", true) + list(content.whyTitle || "Why choose us", content.why, "pi-why");
      if (html) { $("partner-info").innerHTML = html; $("partner-info").hidden = false; }
    }
    $("brand").textContent = name;
    $("foot-name").textContent = `© ${new Date().getFullYear()} ${name}`;
    if (content && content.badge) $("tagline").textContent = content.badge;
    else if (!content && design.badge) $("tagline").textContent = design.badge;
    else if (st.tagline) $("tagline").textContent = st.tagline;
    $("top-hours").textContent = R.hoursLines(st.hours)[0] || "";
    if (st.phone) { $("top-phone").hidden = false; $("top-phone").textContent = st.phone; $("top-phone").href = telHref(st.phone); }
    if (st.phone) { $("mbar-call").hidden = false; $("mbar-call").href = telHref(st.phone); $("mbar-call").textContent = "Call"; }
    const chips = [];
    if (st.shuttleOn !== false && st.shuttleUrl) chips.push(Number(st.shuttleMiles) ? `Free shuttle within ${Number(st.shuttleMiles)} mi` : "Free shuttle");
    if (R.hasFees(st)) chips.push("Taxes & fees shown up front");
    if (st.roadsidePhone) chips.push("24-hour roadside assistance");
    chips.push("Late-model Toyotas");
    $("hero-chips").innerHTML = chips.map(c => `<li>${R.esc(c)}</li>`).join("");

    if (partner && partner.logo) { const img = $("partner-logo"); img.src = `/logos/${partner.logo}`; img.alt = `${partner.label} logo`; img.hidden = false; }
    if (partner && partner.message) { $("partner-banner").hidden = false; $("partner-banner").textContent = partner.message; }

    const mount = $("sections");
    mount.innerHTML = "";
    const sections = view.sections || [];
    if (!sections.length) mount.innerHTML = `<div class="empty">Prices are being updated. Please call us for a quote.</div>`;
    sections.forEach(sec => {
      const items = sec.items || [];
      if (!items.length) return;
      const el = document.createElement("section");
      el.className = "price-section";
      let body;
      if (sec.kind === "special") {
        body = `<div class="card-grid">${items.map(it => {
          const r = R.rates(it, st);
          return `<article class="special">
            ${photoFor(it) ? `<img class="card-photo" src="${R.esc(photoFor(it))}" alt="${R.esc(it.name)}" loading="lazy">` : ""}
            <span class="tag">${R.esc(it.tag || "Special")}</span>
            <h3>${R.esc(it.name)}</h3>
            ${it.detail ? `<p>${R.esc(it.detail)}</p>` : ""}
            <div class="price"><span class="big money">${R.fmt(r.daily)}</span><span class="unit">per day</span></div>
            <span class="wk money">${r.week === null ? "Daily rate only" : R.fmt(r.week) + " for 7 days"}</span>
            <button class="btn small" data-quote="${R.esc(it.id)}">Price this</button>
          </article>`;
        }).join("")}</div>`;
      } else {
        body = `<ul class="rows">
          <li class="row cols" aria-hidden="true"><span>Vehicle</span><span>Daily</span><span>7 days</span><span></span></li>
          ${items.map(it => {
            const r = R.rates(it, st);
            return `<li class="row">
              <div class="name">${photoFor(it) ? `<img class="row-photo" src="${R.esc(photoFor(it))}" alt="${R.esc(it.name)}" loading="lazy">` : ""}<div><h3>${R.esc(it.name)}</h3>${it.detail ? `<p class="detail">${R.esc(it.detail)}</p>` : ""}</div></div>
              <div class="cell"><span class="lbl">Daily</span><span class="amt money">${R.fmt(r.daily)}</span></div>
              <div class="cell week"><span class="lbl">7 days</span>${r.week === null ? `<span class="unit">Daily only</span>` : `<span class="amt money">${R.fmt(r.week)}</span><span class="save money">Save ${R.fmt(r.daily * 7 - r.week)}</span>`}</div>
              <button class="btn small" data-quote="${R.esc(it.id)}">Price this</button>
            </li>`;
          }).join("")}
        </ul>`;
      }
      const heading = content && content.pricingTitle && sec === sections.find(x => (x.items || []).length) ? content.pricingTitle : sec.title;
      el.innerHTML = `<div class="section-head"><h2>${R.esc(heading)}</h2>${sec.note ? `<p>${R.esc(sec.note)}</p>` : ""}</div>${body}`;
      mount.appendChild(el);
    });
    mount.querySelectorAll("[data-quote]").forEach(b => b.addEventListener("click", () => {
      $("qq-car").value = b.dataset.quote; $("qq-car").dispatchEvent(new Event("change"));
      $("hero").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }));

    $("how").textContent = R.howItWorks(st, []).filter(l => !l.startsWith("Fuel")).join(" ");
    $("terms").textContent = st.terms || "";
    if (/^https:\/\//.test(st.startUrl || "")) {
      for (const id of ["start-link", "top-start"]) { $(id).href = st.startUrl; $(id).textContent = st.startLabel || "Start your rental"; $(id).hidden = false; }
      $("start-box").hidden = false;
    }
    if (st.shuttleOn !== false && /^https:\/\//.test(st.shuttleUrl || "")) {
      const miles = Number(st.shuttleMiles);
      $("shuttle-note").textContent = `Our free shuttle can bring you to pick it up${miles ? ` if you're within ${miles} miles` : ""}.`;
      $("shuttle-link").href = st.shuttleUrl; $("shuttle-box").hidden = false;
      $("v-shuttle").href = st.shuttleUrl; $("v-shuttle-wrap").hidden = false;
      if (miles) $("v-shuttle").textContent = `Need a ride? Request a free shuttle (within ${miles} miles)`;
    }
    const terms = R.termLines(st);
    $("terms-card").hidden = !terms.length;
    $("terms-list").innerHTML = terms.map(t => `<li>${R.esc(t)}</li>`).join("");
    if (st.directPhone) { $("v-direct-wrap").hidden = false; $("v-direct").textContent = st.directPhone; $("v-direct").href = telHref(st.directPhone); }
    if (st.roadsidePhone) { $("v-roadside").hidden = false; $("v-roadside").textContent = `24-hour roadside assistance: ${st.roadsidePhone}`; }
    const feeText = R.hasFees(st) ? ` Estimates include the Colorado daily rental fee (${R.fmt(Number(st.dailyRentalFee) || 0)}/day), ${Number(st.taxRate) || 0}% tax and a ${Number(st.servicesFeeRate) || 0}% connected services fee.` : "";
    $("how").textContent += feeText;
    const fuel = Number(st.fuelPerGallon);
    $("fuel-card").hidden = !fuel;
    $("fuel-price").textContent = fuel ? R.fmt(fuel) : "";
    $("v-address").textContent = st.address || "";
    $("v-hours").textContent = R.hoursLines(st.hours).join("\n");
    if (st.phone) { $("v-phone").hidden = false; $("v-phone").textContent = st.phone; $("v-phone").href = telHref(st.phone); }
    if (st.email) { $("v-email").hidden = false; $("v-email").textContent = st.email; $("v-email").href = "mailto:" + st.email; }
    const map = st.mapUrl || (st.address ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((st.businessName ? st.businessName + " " : "") + st.address) : "");
    if (map) { $("v-map").hidden = false; $("v-map").href = map; }
    $("visit-card").hidden = !(st.address || st.phone || st.email || st.hours);

    if (st.requestsOn === false) {
      $("req-form").innerHTML = `<h3 style="font-size:20px;margin-bottom:4px">Ready to book?</h3><p class="muted" style="margin:0;font-size:14px">${st.phone ? `Call us at <a href="${R.esc(telHref(st.phone))}">${R.esc(st.phone)}</a> and mention these options.` : "Contact us and mention these options."}</p>`;
    }
    builder.setSite(view);
    setupQuickPrice(view, st);
    if (!partner) renderWho(st);
  }

  /* The short price box in the banner. */
  function setupQuickPrice(view, st) {
    const items = R.allItems(view);
    const sel = $("qq-car");
    sel.innerHTML = (view.sections || []).filter(s => (s.items || []).length).map(sec =>
      `<optgroup label="${R.esc(sec.title)}">${sec.items.map(it => `<option value="${R.esc(it.id)}">${R.esc(it.name)} – ${R.fmt(R.rates(it, st).daily)}/day</option>`).join("")}</optgroup>`).join("");
    if (!items.length) { $("qq").hidden = true; return; }
    const t = new Date(), day = 86400000;
    const start = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() + 1));
    if (!$("qq-start").value) $("qq-start").value = R.isoDate(start);
    if (!$("qq-end").value) $("qq-end").value = R.isoDate(new Date(start.getTime() + 3 * day));
    $("qq-start").min = R.isoDate(new Date(start.getTime() - day));
    if (/^https:\/\//.test(st.startUrl || "")) { $("qq-start-link").href = st.startUrl; $("qq-start-link").textContent = st.startLabel || "Start your rental"; $("qq-start-link").hidden = false; }
    const update = () => {
      const f = R.findItem(view, sel.value); if (!f) return;
      const a = $("qq-start").value, b = $("qq-end").value;
      if (a && b && b <= a) $("qq-end").value = R.isoDate(new Date(R.parseDate(a).getTime() + day));
      const asked = Math.round((R.parseDate($("qq-end").value) - R.parseDate(a)) / day);
      const days = R.daysBetween(a, $("qq-end").value);
      const p = R.priceFor(f.item, days, st);
      $("qq-total").textContent = R.fmt(p.total);
      $("qq-sub").textContent = `${R.lenName(days)} · ${R.totalNote(st)}${asked > R.MAX_DAYS ? ` · rentals are under 30 days, so this is for ${R.MAX_DAYS}` : ""}`;
    };
    ["qq-car", "qq-start", "qq-end"].forEach(id => { $(id).oninput = update; $(id).onchange = update; });
    $("qq-more").onclick = () => {
      builder.quoteDates(sel.value, $("qq-start").value, $("qq-end").value);
      $("estimate").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    update();
  }

  $("req-form").addEventListener("submit", async e => {
    e.preventDefault();
    const out = $("r-msg-out");
    const name = $("r-name").value.trim(), phone = $("r-phone").value.trim(), email = $("r-email").value.trim();
    if (!name) { out.className = "note-err"; out.textContent = "Please enter your name."; $("r-name").focus(); return; }
    if (!phone && !email) { out.className = "note-err"; out.textContent = "Please enter a phone number or email so we can reach you."; $("r-phone").focus(); return; }
    const rows = builder.rows();
    if (!rows.length) { out.className = "note-err"; out.textContent = "Pick at least one vehicle first."; return; }
    $("r-send").disabled = true; out.className = ""; out.textContent = "Sending…";
    try {
      const res = await fetch("/api/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone, email, message: $("r-msg").value.trim(), company: $("r-company").value,
          source: slug || "", combined: rows.length > 1 && $("q-combined").checked,
          options: rows.map(r => ({ itemId: r.item.id, model: r.model, mode: r.mode, days: r.days, start: r.start, end: r.end }))
        })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "failed");
      out.className = "note-ok"; out.textContent = "Request sent. We'll be in touch soon.";
      $("req-form").reset();
    } catch (err) {
      out.className = "note-err";
      out.textContent = err.message === "rate_limited" ? "Too many requests. Please call us instead." : "Couldn't send. Please try again or call us.";
    } finally { $("r-send").disabled = false; }
  });

  // Design editor preview: the staff page puts its unsaved design in this browser's storage,
  // and this page (opened in the editor with ?preview=1) shows it and reloads when it changes.
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "1";
  if (PREVIEW) {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem("designDraft") || "null"); } catch {}
    if (draft) {
      try { const y = Number(sessionStorage.getItem("previewScroll")); sessionStorage.removeItem("previewScroll"); if (y) addEventListener("load", () => scrollTo(0, y)); } catch {}
      $("req-form").addEventListener("submit", e => { e.stopImmediatePropagation(); e.preventDefault(); $("r-msg-out").textContent = "Preview only: requests aren't sent from the design editor."; }, true);
      site = draft; render();
      return;
    }
  }
  fetch("/api/site").then(r => r.json()).then(s => { site = s; render(); })
    .catch(() => { $("sections").innerHTML = `<div class="empty">Prices couldn't load. Please refresh the page.</div>`; });
})();
