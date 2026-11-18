/* Price math and quote text, shared by the visitor page, the staff page and the server. */
(function (root) {
  const round2 = n => Math.round(n * 100) / 100;
  const fmt = n => "$" + round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const lenName = n => `${plural(n, "day")}${n % 7 === 0 ? ` (${plural(n / 7, "week")})` : ""}`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MAX_DAYS = 29; // rentals must be shorter than 30 consecutive days
  const DEFAULT_TERMS = [
    "Drivers must be 21 or older, with a valid driver's license and your own auto insurance.",
    "Vehicles may only be driven in Colorado. They have GPS and connected services.",
    "Rentals are shorter than 30 days. Return the vehicle by the due date and time.",
    "Return it with the same amount of fuel, or we refill it at the fuel price per gallon.",
    "No smoking or vaping: $250 smoke removal and detailing fee.",
    "No pets (service animals welcome): $250 cleaning fee.",
    "Return it reasonably clean. Extra interior cleaning is $250; interior and exterior is $350.",
    "You pay any tickets or violations, plus a $30 fee for each one. Tolls have a 3% processing fee.",
    "Service loaners: $25 per day if not returned within 24 hours after we tell you your car is ready.",
    "You're responsible for the vehicle until we check it in. We're not responsible for items left inside."
  ].join("\n");

  function settingsOf(site) {
    return Object.assign({
      businessName: "", tagline: "", phone: "", email: "", address: "", hours: "", mapUrl: "",
      weeklyDiscount: 30, fuelPerGallon: 10, terms: "", contact: "",
      directPhone: "", roadsidePhone: "(800) 599-6766",
      // Link to the rental software's form, so customers can fill in their details ahead of time.
      startUrl: "https://hyperdrivepro.com/smartlink/qr/1afe185c69aa21952fc6ab10", startLabel: "Start your rental",
      // Shuttle ride to come pick up the rental.
      shuttleUrl: "https://corwinshuttleservice.com/request", shuttleMiles: 15,
      // Taxes and fees, worked out like page 1 of the rental agreement.
      dailyRentalFee: 5.57, taxRate: 9.195, servicesFeeRate: 3.95,
      rentalTerms: DEFAULT_TERMS
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

  function rentalPrice(item, days, settings) {
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
  /* Taxes and fees, in the same order as the rental agreement:
     daily rental fee per day, tax on the rental, then the connected services fee on all of that. */
  function feesFor(rental, days, settings) {
    const dailyFee = round2(days * (Number(settings.dailyRentalFee) || 0));
    const tax = round2(rental * (Number(settings.taxRate) || 0) / 100);
    const services = round2((rental + dailyFee + tax) * (Number(settings.servicesFeeRate) || 0) / 100);
    const lines = [];
    if (dailyFee) lines.push([`Colorado daily rental fee (${plural(days, "day")} × ${fmt(Number(settings.dailyRentalFee))})`, dailyFee]);
    if (tax) lines.push([`Tax (${Number(settings.taxRate)}%)`, tax]);
    if (services) lines.push([`Connected services fee (${Number(settings.servicesFeeRate)}%)`, services]);
    return { lines, total: round2(dailyFee + tax + services) };
  }
  const hasFees = settings => !!(Number(settings.dailyRentalFee) || Number(settings.taxRate) || Number(settings.servicesFeeRate));
  const totalNote = settings => hasFees(settings) ? "with taxes and fees" : "before taxes and fees";
  // p.total is what the customer pays (with taxes and fees); p.rental is the rental before them.
  function priceFor(item, days, settings) {
    const r = rentalPrice(item, days, settings);
    const f = feesFor(r.total, days, settings);
    return { rental: r.total, lines: r.lines, feeLines: f.lines, fees: f.total, total: round2(r.total + f.total) };
  }

  function allItems(site) {
    const out = [];
    ((site && site.sections) || []).forEach(s => (s.items || []).forEach(it => out.push({ section: s, item: it })));
    return out;
  }
  function findItem(site, id) { return allItems(site).find(x => x.item.id === id); }

  /* Partner pages.
     Categories (e.g. Body shop) live in site.partners and have their own prices.
     Each category can have locations (e.g. ABC Collision) with their own link, name and logo.
     A location uses its category's prices unless it is set to use its own. */
  function partnerOf(site, slug) {
    slug = String(slug || "").toLowerCase();
    if (!slug) return null;
    for (const cat of (site && site.partners) || []) {
      if (cat.slug === slug) return Object.assign({ kind: "category" }, cat);
      for (const loc of cat.locations || []) {
        if (loc.slug !== slug) continue;
        return {
          kind: "location", category: cat, slug: loc.slug, label: loc.name, logo: loc.logo || "",
          headline: loc.headline || `${loc.name} customer rental rates`,
          message: loc.message || cat.message || "",
          sections: loc.useOwnPrices ? (loc.sections || []) : (cat.sections || []),
          alsoMainSpecials: cat.alsoMainSpecials, alsoRegular: cat.alsoRegular,
        };
      }
    }
    return null;
  }
  /* What a partner page says, taken from the partner flyers. Staff can change all of it per category
     (saved as category.content); locations use their category's. */
  const SHOP_CONTENT = {
    badge: "Partner rental program",
    headline: "Keep Your Customers Moving",
    sub: "Partner Rental Program for Body Shops & Repair Shops",
    photo: "/img/shops.jpg",
    benefits: ["Special partner pricing for repair and body shop referrals", "No mileage fee", "Free shuttle service within 15 miles", "Reliable late-model Toyota vehicles", "Easy customer referral process", "Pickup at Corwin Toyota Boulder service drive"],
    stepsTitle: "How it works",
    steps: ["Refer your customer", "Customer contacts Corwin Toyota Boulder", "We confirm availability and help get them moving"],
    whyTitle: "", why: [], pricingTitle: "Partner pricing"
  };
  const PAGE_CONTENT = {
    "body-shop": SHOP_CONTENT,
    "repair-shop": SHOP_CONTENT,
    "hotels": {
      badge: "For hotels",
      headline: "Give Your Guests More Freedom to Explore",
      sub: "Rental options for hotel guests visiting Boulder and beyond.",
      photo: "/img/hotels.jpg",
      benefits: ["No mileage fee", "Free shuttle service within 15 miles", "Reliable late-model Toyota vehicles", "Great for visitors, families, and business travelers", "Pickup at Corwin Toyota Boulder service drive", "Easy guest referral process"],
      stepsTitle: "Guest referral: how it works",
      steps: ["Guest contacts Corwin Toyota Boulder", "We confirm availability and arrange pickup when applicable", "Guest is picked up by free shuttle within 15 miles or comes to the dealership", "Guest enjoys their Toyota rental"],
      whyTitle: "", why: [], pricingTitle: "Leisure Rental Pricing"
    },
    "travel-agents": {
      badge: "For travel agencies",
      headline: "A Trusted Local Rental Option for Your Clients",
      sub: "Help travelers explore Colorado in a late-model Toyota.",
      photo: "/img/travel-agents.jpg",
      benefits: ["No mileage fee", "Free shuttle service within 15 miles", "Reliable late-model Toyota vehicles", "Great for family vacations, business trips, and Colorado adventures", "Local Boulder dealership support", "Easy rental inquiry process"],
      stepsTitle: "",
      steps: [],
      whyTitle: "Why refer Corwin Toyota Boulder?",
      why: ["Local, trusted rental option", "Variety of Toyota vehicle choices", "Convenient for travelers visiting Boulder and nearby destinations", "Free shuttle within 15 miles"],
      pricingTitle: "Leisure Rental Rates"
    }
  };
  const BLANK_CONTENT = { badge: "", headline: "", sub: "", photo: "", benefits: [], stepsTitle: "", steps: [], whyTitle: "", why: [], pricingTitle: "" };
  // The category's page content: what staff saved, or the flyer wording for the four starting categories.
  function categoryContent(cat) {
    const base = PAGE_CONTENT[cat.slug] || BLANK_CONTENT;
    const c = Object.assign({}, BLANK_CONTENT, base, cat.content || {});
    if (!c.headline) c.headline = cat.headline || (cat.label ? `${cat.label} rental rates` : "");
    return c;
  }
  // Photo setting -> address: "" none, "/img/..." built-in, otherwise an uploaded file.
  const photoUrl = v => !v ? "" : v.startsWith("/img/") ? v : `/logos/${v}`;
  function pageContent(site, slug) {
    const p = partnerOf(site, slug);
    if (!p) return null;
    const cat = p.kind === "location" ? p.category : p;
    const c = Object.assign({}, categoryContent(cat));
    if (p.kind === "location") c.headline = p.headline;
    return c;
  }

  // "ABC Collision (Body shop)" or "Body shop"
  function sourceLabel(site, slug) {
    const p = partnerOf(site, slug);
    if (!p) return slug || "";
    return p.kind === "location" ? `${p.label} (${p.category.label})` : p.label;
  }
  function pageSections(site, slug) {
    const main = (site && site.sections) || [];
    const p = partnerOf(site, slug);
    if (!p) return main;
    // A partner page shows only its own prices. With none of its own yet, it shows regular pricing.
    // Staff can tick "Also show..." on the category to add more.
    const own = (p.sections || []).filter(s => (s.items || []).length);
    const hasOwn = own.length > 0;
    return [
      ...own,
      ...main.filter(s => s.kind === "special" ? !!p.alsoMainSpecials : (!hasOwn || !!p.alsoRegular))
    ];
  }
  /* Every price anywhere, for the staff quote builder, labelled with the category or location name. */
  function allSections(site) {
    const out = [...((site && site.sections) || [])];
    ((site && site.partners) || []).forEach(p => {
      (p.sections || []).forEach(s => out.push(Object.assign({}, s, { title: `${p.label}: ${s.title}` })));
      (p.locations || []).forEach(l => { if (l.useOwnPrices) (l.sections || []).forEach(s => out.push(Object.assign({}, s, { title: `${l.name}: ${s.title}` }))); });
    });
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
    return Number.isFinite(d) ? Math.max(1, Math.min(MAX_DAYS, d)) : 1;
  }
  function cleanDays(n) { const d = Math.round(Number(n)); return Number.isFinite(d) && d >= 1 ? Math.min(d, MAX_DAYS) : 1; }

  const COMPARE = [1, 3, 7, 14, 21, 28];
  // Hours can be typed on separate lines or on one line split with "|".
  const termLines = st => String(st.rentalTerms || "").split("\n").map(x => x.trim()).filter(Boolean)
    .map(t => t.replace(/the fuel price per gallon/i, fmt(Number(st.fuelPerGallon) || 0) + " per gallon"));
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
      if (r.p.feeLines.length) {
        L.push(`  Rental subtotal: ${fmt(r.p.rental)}`);
        r.p.feeLines.forEach(([l, a]) => L.push(`  ${l}: ${fmt(a)}`));
      }
      L.push(`  Estimated total: ${fmt(r.p.total)} ${totalNote(st)}`);
      if (opt.compare) {
        const others = COMPARE.filter(n => n !== r.days);
        L.push(`  Other lengths: ${others.map(n => `${n % 7 === 0 ? plural(n / 7, "week") : plural(n, "day")} ${fmt(priceFor(r.item, n, st).total)}`).join(" · ")}`);
      }
    });
    if (combined) L.push("", `COMBINED TOTAL FOR ALL ${rows.length} RENTALS: ${fmt(sum)} ${totalNote(st)}`);
    L.push("", "HOW PRICING WORKS");
    howItWorks(st, rows).forEach(l => L.push("  " + l));
    const terms = termLines(st);
    if (terms.length) { L.push("", "GOOD TO KNOW BEFORE YOU RENT"); terms.forEach(t => L.push("  - " + t)); }
    if (st.terms) L.push("", st.terms);
    if (st.startUrl) L.push("", "READY TO RENT?", `  ${st.startLabel || "Start your rental"} ahead of time, so pick-up is quick:`, `  ${st.startUrl}`);
    if (st.shuttleUrl && st.shuttleOn !== false) L.push("", `NEED A RIDE TO PICK UP YOUR RENTAL?`, `  Request a free shuttle ride${Number(st.shuttleMiles) ? ` (within ${Number(st.shuttleMiles)} miles)` : ""}:`, `  ${st.shuttleUrl}`);
    const contact = [st.contact, st.businessName, st.phone && `Main: ${st.phone}`, st.directPhone && `Direct: ${st.directPhone}`, st.address].filter(Boolean);
    if (contact.length) L.push("", ...contact);
    return L.join("\n");
  }

  const api = { round2, fmt, plural, lenName, esc, settingsOf, rates, priceFor, allItems, findItem, partnerOf, sourceLabel, pageContent, categoryContent, photoUrl, PAGE_CONTENT, pageSections, allSections, pageView, staffView,parseDate, isoDate, niceDate, daysBetween, cleanDays, COMPARE, optionLabel, howItWorks, buildEmail, hoursLines, termLines, totalNote, hasFees, feesFor, MAX_DAYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rates = api;
})(typeof window !== "undefined" ? window : globalThis);
