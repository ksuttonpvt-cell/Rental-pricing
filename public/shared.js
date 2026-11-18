/* Price math and quote text, shared by the visitor page, the staff page and the server. */
(function (root) {
  const round2 = n => Math.round(n * 100) / 100;
  const fmt = n => "$" + round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const lenName = n => `${plural(n, "day")}${n % 7 === 0 ? ` (${plural(n / 7, "week")})` : ""}`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function settingsOf(site) {
    return Object.assign({
      businessName: "", tagline: "", phone: "", email: "", address: "", hours: "", mapUrl: "",
      weeklyDiscount: 30, fuelPerGallon: 10, terms: "", contact: ""
    }, (site && site.settings) || {});
  }

  function rates(item, settings) {
    const daily = Number(item.daily) || 0;
    if (item.noWeekly) return { daily, week: null, custom: false };
    const custom = item.weekly !== "" && item.weekly != null && !isNaN(Number(item.weekly));
    const disc = Number(settings.weeklyDiscount) || 0;
    const week = custom ? Number(item.weekly) : round2(daily * 7 * (1 - disc / 100));
    return { daily, week, custom };
  }

  function priceFor(item, days, settings) {
    const r = rates(item, settings);
    if (r.week === null) return { total: round2(days * r.daily), lines: [[`${plural(days, "day")} × ${fmt(r.daily)}`, round2(days * r.daily)]] };
    const weeks = Math.floor(days / 7), extra = days % 7;
    const lines = [];
    if (weeks) lines.push([`${plural(weeks, "week")} × ${fmt(r.week)}`, round2(weeks * r.week)]);
    if (extra) {
      const dayCost = extra * r.daily;
      if (dayCost > r.week) lines.push([`${plural(extra, "extra day")} (capped at the weekly rate)`, r.week]);
      else lines.push([`${plural(extra, "day")} × ${fmt(r.daily)}`, round2(dayCost)]);
    }
    return { total: round2(lines.reduce((s, l) => s + l[1], 0)), lines };
  }

  function allItems(site) {
    const out = [];
    ((site && site.sections) || []).forEach(s => (s.items || []).forEach(it => out.push({ section: s, item: it })));
    return out;
  }
  function findItem(site, id) { return allItems(site).find(x => x.item.id === id); }

  /* Partner pages: each partner has its own specials, plus optional main-site specials and regular prices. */
  function partnerOf(site, slug) {
    slug = String(slug || "").toLowerCase();
    return slug ? ((site && site.partners) || []).find(p => p.slug === slug) || null : null;
  }
  function pageSections(site, slug) {
    const main = (site && site.sections) || [];
    const p = partnerOf(site, slug);
    if (!p) return main;
    return [
      ...(p.sections || []),
      ...main.filter(s => s.kind === "special" ? p.showMainSpecials !== false : p.showRegular !== false)
    ];
  }
  /* Every price anywhere, for the staff quote builder. Partner sections are labelled with the partner name. */
  function allSections(site) {
    const out = [...((site && site.sections) || [])];
    ((site && site.partners) || []).forEach(p => (p.sections || []).forEach(s => out.push(Object.assign({}, s, { title: `${p.label}: ${s.title}` }))));
    return out;
  }
  const pageView = (site, slug) => ({ settings: (site && site.settings) || {}, sections: pageSections(site, slug), partners: (site && site.partners) || [] });
  const staffView = site => ({ settings: (site && site.settings) || {}, sections: allSections(site), partners: (site && site.partners) || [] });

  function parseDate(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function isoDate(d) { return d.toISOString().slice(0, 10); }
  function niceDate(s) { return parseDate(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
  function daysBetween(a, b) {
    if (!a || !b) return 1;
    const d = Math.round((parseDate(b) - parseDate(a)) / 86400000);
    return Number.isFinite(d) ? Math.max(1, Math.min(365, d)) : 1;
  }
  function cleanDays(n) { const d = Math.round(Number(n)); return Number.isFinite(d) && d >= 1 ? Math.min(d, 365) : 1; }

  const COMPARE = [1, 3, 7, 14, 21, 30];
  // Hours can be typed on separate lines or on one line split with "|".
  const hoursLines = h => String(h || "").split(/\n|\|/).map(x => x.trim()).filter(Boolean);
  const optionLabel = r => `${r.model ? r.model + " · " : ""}${r.item.name}`;

  function howItWorks(settings, rows) {
    const L = [];
    const disc = Number(settings.weeklyDiscount) || 0;
    L.push(`Rentals are charged per day. A 7-day rental gets the weekly rate${disc ? ` (${disc}% off seven daily charges unless a special weekly price is listed)` : ""}.`);
    L.push("Longer rentals: each full week at the weekly rate, extra days at the daily rate.");
    const dailyOnly = [...new Set((rows || []).filter(r => rates(r.item, settings).week === null).map(r => r.item.name))];
    if (dailyOnly.length) L.push(`${dailyOnly.join(", ")}: daily rate only, no weekly discount.`);
    if (Number(settings.fuelPerGallon)) L.push(`Fuel: return the vehicle with a full tank, or we refill it at ${fmt(Number(settings.fuelPerGallon))} per gallon.`);
    return L;
  }

  /* rows: [{n, item, section, model, days, start, end, mode, p}] */
  function buildEmail(site, rows, opt) {
    const st = settingsOf(site);
    const combined = rows.length > 1 && opt.combined;
    const sum = round2(rows.reduce((s, r) => s + r.p.total, 0));
    const L = [];
    L.push(opt.name ? `Hi ${opt.name},` : "Hi,");
    L.push("");
    L.push(rows.length === 1
      ? `Here is an estimate for your rental${st.businessName ? " with " + st.businessName : ""}.`
      : `Here are the rental estimates you asked about${st.businessName ? " from " + st.businessName : ""}.`);
    if (rows.length > 1) {
      L.push("", "SUMMARY");
      rows.forEach(r => L.push(`  Option ${r.n}: ${optionLabel(r)}, ${lenName(r.days)}: ${fmt(r.p.total)}`));
      if (combined) L.push(`  Combined total: ${fmt(sum)}`);
    }
    rows.forEach(r => {
      const dateText = r.mode === "dates" && r.start && r.end ? ` (${niceDate(r.start)} to ${niceDate(r.end)})` : "";
      L.push("");
      L.push(rows.length > 1 ? `OPTION ${r.n}: ${optionLabel(r).toUpperCase()}` : `VEHICLE: ${optionLabel(r)}`);
      if (r.item.detail) L.push(r.section.kind === "special" ? `  ${r.item.detail}` : `  Vehicle group: ${r.item.name} – ${r.item.detail}`);
      if (r.section.kind === "special") L.push(`  Pricing: ${r.section.title}`);
      L.push(`  Rental length: ${lenName(r.days)}${dateText}`);
      r.p.lines.forEach(([l, a]) => L.push(`  ${l}: ${fmt(a)}`));
      L.push(`  Estimated total: ${fmt(r.p.total)} before taxes and fees`);
      if (opt.compare) {
        const others = COMPARE.filter(n => n !== r.days);
        L.push(`  Other lengths: ${others.map(n => `${n % 7 === 0 ? plural(n / 7, "week") : plural(n, "day")} ${fmt(priceFor(r.item, n, st).total)}`).join(" · ")}`);
      }
    });
    if (combined) L.push("", `COMBINED TOTAL FOR ALL ${rows.length} RENTALS: ${fmt(sum)} before taxes and fees`);
    L.push("", "HOW PRICING WORKS");
    howItWorks(st, rows).forEach(l => L.push("  " + l));
    if (st.terms) L.push("", st.terms);
    const contact = [st.contact, st.businessName, st.phone, st.address].filter(Boolean);
    if (contact.length) L.push("", ...contact);
    return L.join("\n");
  }

  const api = { round2, fmt, plural, lenName, esc, settingsOf, rates, priceFor, allItems, findItem, partnerOf, pageSections, allSections, pageView, staffView,parseDate, isoDate, niceDate, daysBetween, cleanDays, COMPARE, optionLabel, howItWorks, buildEmail, hoursLines };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rates = api;
})(typeof window !== "undefined" ? window : globalThis);
