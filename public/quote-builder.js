/* Multi-vehicle quote builder used on both the visitor page and the staff page. */
(function () {
  const { esc, fmt, round2, rates, priceFor, findItem, allItems, isoDate, daysBetween, cleanDays, lenName, optionLabel, settingsOf, MAX_DAYS, parseDate } = window.Rates;
  const QUICK = [[1, "1 day"], [2, "2 days"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"], [21, "3 weeks"]];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const today = (() => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())); })();

  window.QuoteBuilder = function (container, onChange) {
    let site = null;
    let opts = [];
    const newOpt = itemId => ({ id: uid(), itemId: itemId || "", model: "", mode: "days", days: 3, start: isoDate(today), end: isoDate(new Date(today.getTime() + 3 * 86400000)), touched: false });
    const optDays = o => o.mode === "dates" ? daysBetween(o.start, o.end) : cleanDays(o.days);

    function itemOptions(selected) {
      const st = settingsOf(site);
      return ((site && site.sections) || []).filter(s => (s.items || []).length).map(sec =>
        `<optgroup label="${esc(sec.title)}">${sec.items.map(it => `<option value="${esc(it.id)}" ${it.id === selected ? "selected" : ""}>${esc(it.name)} – ${fmt(rates(it, st).daily)}/day</option>`).join("")}</optgroup>`).join("");
    }

    function rows() {
      const st = settingsOf(site);
      return opts.map((o, i) => {
        const f = findItem(site, o.itemId);
        if (!f) return null;
        const days = optDays(o);
        return { n: i + 1, id: o.id, item: f.item, section: f.section, model: o.model.trim(), days, mode: o.mode, start: o.start, end: o.end, p: priceFor(f.item, days, st) };
      }).filter(Boolean);
    }

    function render() {
      container.innerHTML = opts.map((o, i) => `
        <div class="opt-card" data-opt="${o.id}">
          <div class="opt-head">
            <h3>Option ${i + 1}</h3>
            <span class="opt-total money" data-total></span>
            ${opts.length > 1 ? `<button class="btn small danger" type="button" data-remove aria-label="Remove option ${i + 1}">Remove</button>` : ""}
          </div>
          <div class="two">
            <div class="field"><label for="o-item-${o.id}">Vehicle or special</label><select id="o-item-${o.id}" data-k="itemId">${itemOptions(o.itemId)}</select></div>
            <div class="field"><label for="o-model-${o.id}">Model <span class="hint">(optional)</span></label><input id="o-model-${o.id}" data-k="model" value="${esc(o.model)}" placeholder="e.g. Highlander" maxlength="60"></div>
          </div>
          <div class="opt-len">
            <span class="label">Rental length</span>
            <div class="seg" role="group" aria-label="How to enter the rental length for option ${i + 1}">
              <button type="button" data-mode="days" aria-pressed="${o.mode === "days"}">Days</button>
              <button type="button" data-mode="dates" aria-pressed="${o.mode === "dates"}">Dates</button>
            </div>
          </div>
          ${o.mode === "days" ? `<div>
            <div class="stepper">
              <button type="button" data-step="-1" aria-label="One less day">−</button>
              <input id="o-days-${o.id}" type="number" min="1" max="${MAX_DAYS}" value="${o.days}" inputmode="numeric" data-k="days" aria-label="Number of days for option ${i + 1}">
              <button type="button" data-step="1" aria-label="One more day">+</button>
            </div>
            <div class="quick">${QUICK.map(([n, l]) => `<button type="button" data-days="${n}" aria-pressed="${Number(o.days) === n}">${l}</button>`).join("")}</div>
          </div>` : `<div class="two">
            <div class="field"><label for="o-start-${o.id}">Pick-up date</label><input id="o-start-${o.id}" type="date" data-k="start" value="${o.start}"></div>
            <div class="field"><label for="o-end-${o.id}">Return date</label><input id="o-end-${o.id}" type="date" data-k="end" value="${o.end}"></div>
          </div>`}
          <p class="opt-break money" data-break></p>
        </div>`).join("");
      update();
    }

    function update() {
      const rs = rows();
      container.querySelectorAll("[data-opt]").forEach(card => {
        const r = rs.find(x => x.id === card.dataset.opt);
        card.querySelector("[data-total]").textContent = r ? fmt(r.p.total) : "";
        const o = opts.find(x => x.id === card.dataset.opt);
        const asked = o.mode === "dates" ? Math.round((parseDate(o.end) - parseDate(o.start)) / 86400000) : Math.round(Number(o.days));
        const tooLong = asked > MAX_DAYS ? ` Rentals must be shorter than 30 days, so this is priced for ${MAX_DAYS}.` : "";
        card.querySelector("[data-break]").textContent = r ? `${lenName(r.days)}: ${[...r.p.lines, ...r.p.feeLines].map(([l, a]) => `${l} ${fmt(a)}`).join(" + ")}.${tooLong}` : "";
      });
      onChange && onChange(rs, opts.length);
    }

    container.addEventListener("input", e => {
      const card = e.target.closest("[data-opt]"), k = e.target.dataset.k;
      if (!card || !k) return;
      const o = opts.find(x => x.id === card.dataset.opt);
      o[k] = e.target.value; o.touched = true;
      if (k === "days") card.querySelectorAll("[data-days]").forEach(b => b.setAttribute("aria-pressed", Number(b.dataset.days) === Number(o.days)));
      update();
    });
    container.addEventListener("click", e => {
      const card = e.target.closest("[data-opt]"), b = e.target.closest("button");
      if (!card || !b) return;
      const o = opts.find(x => x.id === card.dataset.opt);
      if (b.dataset.remove !== undefined) { opts = opts.filter(x => x !== o); render(); return; }
      if (b.dataset.mode) { o.mode = b.dataset.mode; o.touched = true; render(); return; }
      if (b.dataset.days) o.days = Number(b.dataset.days);
      else if (b.dataset.step) o.days = Math.min(MAX_DAYS, Math.max(1, optDays(o) + Number(b.dataset.step)));
      else return;
      o.touched = true;
      const inp = card.querySelector('[data-k="days"]'); if (inp) inp.value = o.days;
      card.querySelectorAll("[data-days]").forEach(x => x.setAttribute("aria-pressed", Number(x.dataset.days) === Number(o.days)));
      update();
    });

    return {
      setSite(s) {
        site = s;
        const items = allItems(site);
        if (!opts.length) opts.push(newOpt());
        opts.forEach(o => { if (!findItem(site, o.itemId) && items.length) o.itemId = items[0].item.id; });
        render();
      },
      add(itemId) {
        const last = opts[opts.length - 1];
        opts.push(newOpt(itemId || (last && last.itemId)));
        render();
        const cards = container.querySelectorAll("[data-opt]");
        const sel = cards[cards.length - 1] && cards[cards.length - 1].querySelector("select");
        if (sel) sel.focus();
      },
      quote(itemId) {
        const only = opts.length === 1 && !opts[0].touched ? opts[0] : null;
        if (only) { only.itemId = itemId; only.touched = true; render(); }
        else this.add(itemId);
      },
      // Start (or add) an option for a vehicle with pick-up and return dates, from the price box.
      quoteDates(itemId, start, end) {
        const only = opts.length === 1 && !opts[0].touched ? opts[0] : null;
        const o = only || newOpt(itemId);
        Object.assign(o, { itemId, mode: "dates", start, end, touched: true });
        if (!only) opts.push(o);
        render();
      },
      reset() { opts = []; this.setSite(site); },
      rows,
      sum() { return round2(rows().reduce((s, r) => s + r.p.total, 0)); },
      label: optionLabel
    };
  };
})();
