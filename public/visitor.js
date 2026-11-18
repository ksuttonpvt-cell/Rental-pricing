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

  function telHref(p) { return "tel:" + String(p).replace(/[^\d+]/g, ""); }

  function render() {
    const st = R.settingsOf(site);
    const view = R.pageView(site, slug);
    const partner = R.partnerOf(site, slug);
    const name = st.businessName || "Rentals";
    const pageTitle = partner ? (partner.headline || `${partner.label} rental rates`) : "Rental Rates";
    document.title = st.businessName ? `${pageTitle} – ${st.businessName}` : pageTitle;
    $("hero-title").textContent = pageTitle;
    if (st.visitorSiteOn === false) {
      $("brand").textContent = name;
      $("foot-name").textContent = `© ${new Date().getFullYear()} ${name}`;
      if (st.phone) { $("top-phone").hidden = false; $("top-phone").textContent = st.phone; $("top-phone").href = telHref(st.phone); }
      document.querySelector(".hero").hidden = true;
      document.querySelector("main").innerHTML = `<section class="panel offline">
        <h2>${R.esc(name)}</h2>
        <p class="lede" style="margin:0 auto 14px">${R.esc(st.offlineMessage || "Our rental prices page is being updated. Please call us for a quote.")}</p>
        ${st.phone ? `<p><a class="btn primary" href="${R.esc(telHref(st.phone))}">Call ${R.esc(st.phone)}</a></p>` : ""}
        ${st.address ? `<p class="muted" style="white-space:pre-line">${R.esc(st.address)}</p>` : ""}
        ${st.hours ? `<p class="muted" style="white-space:pre-line">${R.esc(R.hoursLines(st.hours).join("\n"))}</p>` : ""}
      </section>`;
      return;
    }
    if (partner) $("hero-lede").textContent = "Your special rental prices, plus an estimate tool for any vehicle and any length of rental.";
    $("brand").textContent = name;
    $("foot-name").textContent = `© ${new Date().getFullYear()} ${name}`;
    if (st.tagline) $("tagline").textContent = st.tagline;
    $("top-hours").textContent = R.hoursLines(st.hours)[0] || "";
    if (st.phone) { $("top-phone").hidden = false; $("top-phone").textContent = st.phone; $("top-phone").href = telHref(st.phone); }

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
              <div class="name"><h3>${R.esc(it.name)}</h3>${it.detail ? `<p class="detail">${R.esc(it.detail)}</p>` : ""}</div>
              <div class="cell"><span class="lbl">Daily</span><span class="amt money">${R.fmt(r.daily)}</span></div>
              <div class="cell week"><span class="lbl">7 days</span>${r.week === null ? `<span class="unit">Daily only</span>` : `<span class="amt money">${R.fmt(r.week)}</span><span class="save money">Save ${R.fmt(r.daily * 7 - r.week)}</span>`}</div>
              <button class="btn small" data-quote="${R.esc(it.id)}">Price this</button>
            </li>`;
          }).join("")}
        </ul>`;
      }
      el.innerHTML = `<div class="section-head"><h2>${R.esc(sec.title)}</h2>${sec.note ? `<p>${R.esc(sec.note)}</p>` : ""}</div>${body}`;
      mount.appendChild(el);
    });
    mount.querySelectorAll("[data-quote]").forEach(b => b.addEventListener("click", () => {
      builder.quote(b.dataset.quote);
      $("estimate").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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

  fetch("/api/site").then(r => r.json()).then(s => { site = s; render(); })
    .catch(() => { $("sections").innerHTML = `<div class="empty">Prices couldn't load. Please refresh the page.</div>`; });
})();
