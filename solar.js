import { mountLayout } from "./layout.js";
import { loadSolar } from "./data.js";
import { esc, sdgChips } from "./initiatives.js";

mountLayout("solar");
const $ = (s, r = document) => r.querySelector(s);
const fmt = n => Math.round(n).toLocaleString("en-IN");
const fmt1 = n => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const fmt2 = n => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const has = v => typeof v === "number";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
const fyOf = m => { const [y, mo] = m.split("-").map(Number); const s = mo >= 4 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}`; };
const daysIn = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
const COLORS = { solar: "#f5b82e", export: "#26BDE2", grid: "#6b7280", green: "#16834b" };
const SEASONS = [{ n: "Summer", span: "Mar–May", m: [3, 4, 5] }, { n: "Monsoon", span: "Jun–Sep", m: [6, 7, 8, 9] }, { n: "Winter", span: "Oct–Feb", m: [10, 11, 12, 1, 2] }];
// Illustrative conversion factors (same ones disclosed in the method note)
const F = { treeKg: 21.8, homeKwh: 1200, petrolKg: 2.3, evKwhKm: 0.12, coalLo: 0.55, coalHi: 0.70, waterLo: 3, waterHi: 4 };

let data;
init().catch(e => { console.error(e); $("#error").hidden = false; });

async function init() {
  data = await loadSolar();
  $("#sample-banner").hidden = !data.sample;
  if (!data.rows.length) { $("#error").textContent = "No solar readings have been added yet."; $("#error").hidden = false; return; }
  const fys = [...new Set(data.rows.map(r => fyOf(r.month)))].sort().reverse();
  const cys = [...new Set(data.rows.map(r => r.month.slice(0, 4)))].sort().reverse();
  $("#period").innerHTML = `<option value="12">Last 12 months</option><option value="all">All time</option>`
    + `<optgroup label="Financial year (Apr–Mar)">${fys.map(f => `<option value="fy:${f}">FY ${f}</option>`).join("")}</optgroup>`
    + `<optgroup label="Calendar year">${cys.map(y => `<option value="cy:${y}">${y}</option>`).join("")}</optgroup>`;
  $("#month").innerHTML = `<option value="all">All months</option>` + MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  $("#period").addEventListener("change", render);
  $("#month").addEventListener("change", render);
  $("#csv").addEventListener("click", downloadCsv);
  $("#q").addEventListener("input", () => renderTable(current()));
  document.querySelectorAll(".solar-tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1), false));
  buildMoyTabs();
  $("#solar-body").hidden = false;
  showTab(location.hash.slice(1) || "overview", false);
  render();
}

function showTab(t, setHash = true) {
  if (!["overview", "analytics", "impact", "data"].includes(t)) t = "overview";
  ["overview", "analytics", "impact", "data"].forEach(k => { $("#tab-" + k).hidden = k !== t; });
  document.querySelectorAll(".solar-tabs button").forEach(b => { const on = b.dataset.tab === t; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  if (setHash) history.replaceState(null, "", "#" + t);
}

// ---------- data helpers ----------
function current() {
  let rs = data.rows;
  const p = $("#period").value;
  if (p === "12") rs = rs.slice(-12);
  else if (p.startsWith("fy:")) rs = rs.filter(r => fyOf(r.month) === p.slice(3));
  else if (p.startsWith("cy:")) rs = rs.filter(r => r.month.startsWith(p.slice(3)));
  const m = $("#month").value;
  if (m !== "all") rs = rs.filter(r => +r.month.slice(5, 7) === +m);
  return rs;
}
const solarOf = r => data.plants.reduce((s, p) => s + (has(r[p.id]) ? r[p.id] : 0), 0);
const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);

// Solar share = solar ÷ (solar + KSEB import)
function totals(rows) {
  const solar = sum(rows, solarOf), exported = sum(rows, r => r.export), grid = sum(rows, r => r.grid);
  return { solar, exported, grid, share: solar + grid ? solar / (solar + grid) * 100 : null };
}

// Days a plant could generate in a month (a plant commissioned part-way through a month only counts from that day)
function activeDays(p, month) {
  const dim = daysIn(month);
  if (p.commissioned && p.commissioned.slice(0, 7) === month) return dim - (+p.commissioned.slice(8, 10)) + 1;
  return dim;
}
// CUF = generation ÷ (capacity × 24 × days) × 100;  specific yield = generation ÷ capacity
function plantStats(p, rows) {
  const w = rows.filter(r => has(r[p.id]));
  const kwh = sum(w, r => r[p.id]);
  const days = w.reduce((s, r) => s + activeDays(p, r.month), 0);
  const best = w.length ? w.reduce((a, b) => b[p.id] > a[p.id] ? b : a) : null;
  return { w, kwh, days, best, avgMonth: w.length ? kwh / w.length : null, perDay: days ? kwh / days : null,
    yield: p.kWp && w.length ? kwh / p.kWp : null, cuf: p.kWp && days ? kwh / (p.kWp * 24 * days) * 100 : null };
}
const card = (label, value, sub = "", cls = "") => `<div class="card ${cls}"><h4>${label}</h4><div class="v">${value}</div>${sub ? `<small>${sub}</small>` : ""}</div>`;

// ---------- render ----------
function render() {
  const rows = current();
  $(".solar-main").toggleAttribute("data-empty", !rows.length);
  if (!rows.length) { $("#period-note").textContent = "No readings for this selection."; return; }
  const t = totals(rows);
  const co2t = t.solar / 1000 * data.config.emissionFactorTPerMWh;
  $("#period-note").textContent = `${monthLabel(rows[0].month)} to ${monthLabel(rows[rows.length - 1].month)} · ${rows.length} month${rows.length === 1 ? "" : "s"}`;
  $("#big-total").textContent = fmt(t.solar) + " kWh";
  $("#big-sub").textContent = `${fmt1(t.solar / 1000)} MWh from ${data.plants.length} installations · ${$("#period-note").textContent}`;

  $("#kpis").innerHTML = [
    card("Exported to KSEB", fmt(t.exported) + " kWh", "surplus sent to the grid"),
    card("Imported from KSEB", fmt(t.grid) + " kWh", "zone 1 units drawn from the grid"),
    card("Solar share", t.share == null ? "–" : fmt1(t.share) + "%", "solar ÷ (solar + KSEB import)", "accent"),
    card("CO₂ avoided (est.)", fmt1(co2t) + " t", `at ${data.config.emissionFactorTPerMWh} t CO₂ per MWh`)
  ].join("");

  renderPlants(rows, t);
  renderCharts(rows);
  renderCompare();
  renderAnalytics(rows, t);
  renderImpact(rows, t, co2t);
  renderTable(rows);
  $("#method").innerHTML = `<strong>How these numbers are worked out.</strong>
    <ul class="ticks">
      <li><b>Solar generated</b> is the sum of the three installations. <b>KSEB import</b> is the units drawn from KSEB (zone 1) as recorded in the college electricity data sheet.</li>
      <li><b>Solar share</b> = solar generated ÷ (solar generated + KSEB import). Energy exported to KSEB is included in generation and not deducted. Diesel generator use is not included.</li>
      <li><b>Specific yield</b> = generation ÷ installed capacity (kWh per kWp). <b>CUF</b> = generation ÷ (capacity × 24 × days) × 100.</li>
      <li>The Administration Block plant (120 kWp) was commissioned on 22 April 2026, so earlier months show only the other two installations.</li>
      <li>Dashboard layout and the choice of indicators (CUF, seasonal comparison, impact equivalents) are adapted from the Vidya Solar Energy Dashboard by a VAST colleague (aruncx.github.io/solarvidya).</li>
    </ul>`;
}

function renderPlants(rows, t) {
  $("#plants").innerHTML = data.plants.map(p => {
    const s = plantStats(p, rows);
    const note = [p.kWp ? p.kWp + " kWp" : "", p.meter ? "Meter " + p.meter : "", p.commissioned ? "commissioned " + new Date(p.commissioned).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : p.commissionedYear ? "commissioned " + p.commissionedYear : ""].filter(Boolean).join(" · ");
    return `<article class="plant" style="--c:${p.color}">
      <h3>${esc(p.name)}</h3><p class="plant-sub">${esc(note)}</p>
      <strong class="plant-total">${s.w.length ? fmt(s.kwh) : "–"} <small>kWh</small></strong>
      <div class="bar"><span style="width:${t.solar ? s.kwh / t.solar * 100 : 0}%"></span></div>
      <ul>
        <li><span>Share of solar output</span><strong>${fmt1(t.solar ? s.kwh / t.solar * 100 : 0)}%</strong></li>
        <li><span>Monthly average</span><strong>${s.w.length ? fmt(s.avgMonth) + " kWh" : "–"}</strong></li>
        <li><span>Best month</span><strong>${s.best ? monthLabel(s.best.month) + " · " + fmt(s.best[p.id]) : "–"}</strong></li>
        ${s.yield != null ? `<li><span>Specific yield</span><strong>${fmt(s.yield)} kWh/kWp</strong></li>` : ""}
        ${s.cuf != null ? `<li><span>Capacity utilisation (CUF)</span><strong>${fmt1(s.cuf)}%</strong></li>` : ""}
      </ul></article>`;
  }).join("");
}

function groupsFor(rows) {
  if (rows.length <= 24) return { long: false, groups: rows.map(r => ({ label: monthLabel(r.month), rows: [r] })) };
  const m = new Map();
  rows.forEach(r => { const k = fyOf(r.month); (m.get(k) || m.set(k, []).get(k)).push(r); });
  return { long: true, groups: [...m].map(([k, rs]) => ({ label: "FY " + k.slice(2), rows: rs })) };
}

function renderCharts(rows) {
  const { long, groups } = groupsFor(rows);
  $("#chart-note").textContent = long ? "Totals per financial year (April–March). Years with fewer than 12 months of data are partial." : "Stacked by installation.";
  const labels = groups.map(g => g.label);
  const plantSeries = data.plants.map(p => ({ name: p.name, color: p.color, values: groups.map(g => sum(g.rows, r => r[p.id])) }));
  legend("#legend-a", plantSeries);
  $("#chart-a").innerHTML = chart(labels, plantSeries, true);

  const compare = [
    { name: "Solar generated", color: COLORS.solar, values: groups.map(g => sum(g.rows, solarOf)) },
    { name: "Exported to KSEB", color: COLORS.export, values: groups.map(g => sum(g.rows, r => r.export)) },
    { name: "Imported from KSEB", color: COLORS.grid, values: groups.map(g => sum(g.rows, r => r.grid)) }
  ];
  legend("#legend-b", compare);
  $("#chart-b").innerHTML = chart(labels, compare, false);
  $("#share-row").innerHTML = groups.map(g => { const s = totals(g.rows).share; return `<span><small>${g.label}</small><strong>${s == null ? "–" : fmt(s) + "%"}</strong></span>`; }).join("");
}

// ---------- before / after the newest plant ----------
function renderCompare() {
  const box = $("#compare");
  const plant = data.plants.filter(p => p.commissioned).sort((a, b) => a.commissioned.localeCompare(b.commissioned)).pop();
  if (!plant) { box.hidden = true; return; }
  const cm = plant.commissioned.slice(0, 7);
  const after = data.rows.filter(r => r.month >= cm);
  const shift = m => (+m.slice(0, 4) - 1) + m.slice(4);
  const wanted = new Set(after.map(r => shift(r.month)));
  const before = data.rows.filter(r => wanted.has(r.month));
  if (!after.length || before.length !== after.length) { box.hidden = true; return; }
  box.hidden = false;

  const span = rs => `${monthLabel(rs[0].month)} to ${monthLabel(rs[rs.length - 1].month)}`;
  const B = totals(before), A = totals(after), n = after.length;
  const date = new Date(plant.commissioned).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  $("#compare-title").textContent = `Before and after the ${plant.name} plant (${plant.kWp} kWp)`;
  $("#compare-lead").textContent = `Commissioned on ${date}. Comparing the same months in consecutive years (${span(before)} against ${span(after)}) keeps the seasons the same.`;

  const pct = (a, b) => b ? (a - b) / b * 100 : null;
  const rowsDef = [["Solar generated per month (kWh)", B.solar / n, A.solar / n, "up"], ["KSEB import per month (kWh)", B.grid / n, A.grid / n, "down"], ["Exported to KSEB per month (kWh)", B.exported / n, A.exported / n, "neutral"]];
  const sign = v => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt1(Math.abs(v));
  const good = (d, dir) => dir === "neutral" ? "" : (dir === "up") === (d > 0) ? "good" : "bad";
  const trs = rowsDef.map(([label, b, a, dir]) => { const d = pct(a, b); return `<tr><th scope="row">${label}</th><td>${fmt(b)}</td><td>${fmt(a)}</td><td class="${good(d, dir)}">${d == null ? "–" : sign(d) + "%"}</td></tr>`; });
  const dShare = A.share - B.share;
  trs.push(`<tr><th scope="row">Solar share</th><td>${fmt1(B.share)}%</td><td>${fmt1(A.share)}%</td><td class="${good(dShare, "up")}">${sign(dShare)} percentage points</td></tr>`);
  $("#compare-table").innerHTML = `<thead><tr><th></th><th>Before<br><small>${span(before)}</small></th><th>After<br><small>${span(after)}</small></th><th>Change</th></tr></thead><tbody>${trs.join("")}</tbody>`;

  const dGen = pct(A.solar, B.solar), dImp = pct(A.grid, B.grid);
  $("#compare-cards").innerHTML = [
    [fmt1(B.share) + "% → " + fmt1(A.share) + "%", "solar share of electricity", dShare > 0],
    [sign(dGen) + "%", "solar generation per month", dGen > 0],
    [sign(dImp) + "%", "KSEB import per month", dImp < 0]
  ].map(([v, l, ok]) => `<div class="${ok ? "good" : "bad"}"><strong>${v}</strong><span>${l}</span></div>`).join("");

  const series = [{ name: `Before (${span(before)})`, color: COLORS.grid, values: before.map(r => r.grid) }, { name: `After (${span(after)})`, color: COLORS.green, values: after.map(r => r.grid) }];
  legend("#legend-c", series);
  $("#chart-c").innerHTML = chart(after.map(r => MONTHS[+r.month.slice(5, 7) - 1]), series, false);
  $("#compare-note").textContent = `The plant was commissioned partway through ${monthLabel(cm)}, so that month includes only part of its output. Weather and campus electricity demand also differ between years, so treat the comparison as indicative.`;
}

// ---------- analytics ----------
function renderAnalytics(rows, t) {
  // cumulative
  let acc = 0;
  const cum = rows.map(r => (acc += solarOf(r)));
  legend("#legend-cum", [{ name: "Cumulative solar generation", color: COLORS.green }]);
  $("#chart-cum").innerHTML = lineChart(rows.map(r => monthLabel(r.month)), [{ name: "Cumulative", color: COLORS.green, values: cum }]);

  // period statistics
  const monthly = rows.map(r => ({ r, v: solarOf(r) }));
  const best = monthly.reduce((a, b) => b.v > a.v ? b : a), low = monthly.reduce((a, b) => b.v < a.v ? b : a);
  const calDays = sum(rows, r => daysIn(r.month));
  const capHours = data.plants.reduce((s, p) => s + (p.kWp || 0) * 24 * rows.reduce((d, r) => d + (has(r[p.id]) ? activeDays(p, r.month) : 0), 0), 0);
  $("#period-stats").innerHTML = [
    card("Average per month", fmt(t.solar / rows.length) + " kWh", "all installations"),
    card("Average per day", fmt(t.solar / calDays) + " kWh", `over ${fmt(calDays)} calendar days`),
    card("Best month", monthLabel(best.r.month), fmt(best.v) + " kWh"),
    card("Lowest month", monthLabel(low.r.month), fmt(low.v) + " kWh"),
    card("Campus CUF", capHours ? fmt1(t.solar / capHours * 100) + "%" : "–", "generation ÷ (capacity × 24 × days)"),
    card("Months in period", String(rows.length), `${rows.filter(r => has(r.p3)).length} with all three installations`)
  ].join("");

  // plant comparison table
  const stats = data.plants.map(p => ({ p, s: plantStats(p, rows) }));
  $("#plant-table").innerHTML = `<thead><tr><th>Installation</th><th>Capacity</th><th>Generation (kWh)</th><th>Share of solar</th><th>Specific yield (kWh/kWp)</th><th>CUF</th><th>Average per day (kWh)</th></tr></thead><tbody>`
    + stats.map(({ p, s }) => `<tr><th scope="row"><span class="dot-sm" style="background:${p.color}"></span>${esc(p.name)}</th><td>${p.kWp ? p.kWp + " kWp" : "–"}</td><td>${s.w.length ? fmt(s.kwh) : "–"}</td><td>${fmt1(t.solar ? s.kwh / t.solar * 100 : 0)}%</td><td>${s.yield != null ? fmt(s.yield) : "–"}</td><td>${s.cuf != null ? fmt1(s.cuf) + "%" : "–"}</td><td>${s.perDay != null ? fmt(s.perDay) : "–"}</td></tr>`).join("")
    + `<tr class="total"><th scope="row">All installations</th><td>${fmt(sum(data.plants, p => p.kWp))} kWp</td><td>${fmt(t.solar)}</td><td>100%</td><td>–</td><td>${capHours ? fmt1(t.solar / capHours * 100) + "%" : "–"}</td><td>${fmt(t.solar / calDays)}</td></tr></tbody>`;

  // seasons
  $("#seasons").innerHTML = SEASONS.map(se => {
    const rs = rows.filter(r => se.m.includes(+r.month.slice(5, 7)));
    const k = sum(rs, solarOf), d = sum(rs, r => daysIn(r.month));
    return card(`${se.n} <span class="faint">(${se.span})</span>`, rs.length ? fmt(k) + " kWh" : "–", rs.length ? `${rs.length} month${rs.length === 1 ? "" : "s"} · ${fmt(k / d)} kWh/day` : "no readings in this selection");
  }).join("");

  $("#analytics-method").innerHTML = `<strong>Reading these indicators.</strong> Specific yield and CUF let you compare plants of different sizes fairly. A plant commissioned part-way through a month is counted only from its commissioning day. These are screening indicators, not proof of a fault: shading, orientation, inverter limits, meter calibration and outages all affect them. Financial savings and payback need verified tariff and installation-cost data and are not shown.`;
}

let moy = null;
function buildMoyTabs() {
  moy = +data.rows[data.rows.length - 1].month.slice(5, 7);
  $("#moy-tabs").innerHTML = MONTHS.map((m, i) => `<button class="${i + 1 === moy ? "on" : ""}" data-m="${i + 1}">${m}</button>`).join("");
  $("#moy-tabs").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    moy = +b.dataset.m;
    document.querySelectorAll("#moy-tabs button").forEach(x => x.classList.toggle("on", x === b));
    renderMoy();
  });
  renderMoy();
}
function renderMoy() {
  const rs = data.rows.filter(r => +r.month.slice(5, 7) === moy);
  const series = data.plants.map(p => ({ name: p.name, color: p.color, values: rs.map(r => has(r[p.id]) ? r[p.id] : 0) }));
  legend("#legend-moy", series);
  $("#chart-moy").innerHTML = rs.length ? chart(rs.map(r => r.month.slice(0, 4)), series, true) : `<p class="empty">No readings for this month.</p>`;
}

// ---------- impact ----------
function renderImpact(rows, t, co2t) {
  const kwh = t.solar, co2kg = co2t * 1000;
  $("#impact-energy").textContent = fmt1(kwh / 1000) + " MWh";
  $("#impact-sub").textContent = `solar generation · ${$("#period-note").textContent}`;
  const imp = (ico, label, val, sub) => `<div class="card impact-card"><div class="ico" aria-hidden="true">${ico}</div><h4>${label}</h4><div class="v">${val}</div><small>${sub}</small></div>`;
  $("#impact-grid").innerHTML = [
    `<div class="card impact-card wide"><div class="ico" aria-hidden="true">🌍</div><h4>Carbon emissions &amp; potential carbon-credit equivalent</h4><div class="carbon-pair"><div><div class="v">${fmt1(co2t)} t</div><small>estimated CO₂ avoided</small></div><div><div class="v">≈ ${fmt(co2t)}</div><small>carbon-credit equivalent (1 credit = 1 t CO₂). Indicative only: credits exist only once a registry has verified them.</small></div></div></div>`,
    imp("🪨", "Coal equivalent not burned", `${fmt1(kwh * F.coalLo / 1000)}–${fmt1(kwh * F.coalHi / 1000)} t`, `Illustrative range at ${F.coalLo}–${F.coalHi} kg coal per kWh.`),
    imp("🌳", "Mature-tree equivalent", `${fmt(co2kg / F.treeKg)} tree-years`, "CO₂ absorbed by that many mature trees in a year; not trees planted or saved."),
    imp("🏠", "Household electricity equivalent", `${fmt(kwh / F.homeKwh)} home-years`, `At an illustrative ${fmt(F.homeKwh)} kWh per household per year.`),
    imp("⛽", "Petrol CO₂ equivalent", `${fmt(co2kg / F.petrolKg)} litres`, `Based on ${F.petrolKg} kg CO₂ per litre of petrol.`),
    imp("🚗", "Electric vehicle distance", `${fmt(kwh / F.evKwhKm)} km`, `At an illustrative ${F.evKwhKm} kWh per km.`),
    imp("💧", "Thermal-generation water equivalent", `${fmt2(kwh * F.waterLo / 1e6)}–${fmt2(kwh * F.waterHi / 1e6)} million L`, "Indicative range of 3–4 litres per kWh; highly technology-dependent.")
  ].join("");

  const share = t.share == null ? "" : ` Solar supplied ${fmt1(t.share)}% of electricity in this period.`;
  const links = [
    [[7], "Affordable and clean energy", "On-campus solar supplies renewable electricity." + share],
    [[13], "Climate action", `An estimated ${fmt1(co2t)} t of CO₂ avoided, using the grid emission factor of ${data.config.emissionFactorTPerMWh} t CO₂ per MWh.`],
    [[12], "Responsible consumption and production", "Tracking production supports energy awareness and informed decisions about electricity use."],
    [[4], "Quality education", "These records are a learning resource for students, staff and visitors."],
    [[11], "Sustainable cities and communities", "Clean-energy monitoring shows the campus contribution to a more sustainable built environment."],
    [[9], "Industry, innovation and infrastructure", "Clean energy infrastructure on campus."]
  ];
  $("#sdg-links").innerHTML = links.map(([n, title, text]) => `<div class="sdg-item">${sdgChips(n)}<div><h4>${title}</h4><p>${text}</p></div></div>`).join("");
  $("#impact-method").innerHTML = `<strong>Calculation notes.</strong> Values are approximate equivalents, not direct measurements. Factors used: ${data.config.emissionFactorTPerMWh} t CO₂/MWh (grid emission factor; the latest CEA baseline will be used when finalised); ${F.coalLo}–${F.coalHi} kg coal/kWh; ${F.treeKg} kg CO₂ absorbed per mature tree per year; ${fmt(F.homeKwh)} kWh per household per year; ${F.petrolKg} kg CO₂/litre of petrol; ${F.evKwhKm} kWh/km for EV driving; and ${F.waterLo}–${F.waterHi} litres of thermal-plant water use per kWh. Review and cite authoritative sources for these factors before using them in formal reporting. See also <a href="carbon.html">carbon impact</a>.`;
}

// ---------- data table / csv ----------
function renderTable(rows) {
  const q = ($("#q").value || "").trim().toLowerCase();
  const shown = rows.filter(r => !q || monthLabel(r.month).toLowerCase().includes(q) || r.month.includes(q)).slice().reverse();
  const cell = v => has(v) ? fmt(v) : "–";
  const t = totals(shown);
  $("#data-table").innerHTML = `<thead><tr><th>Month</th>${data.plants.map(p => `<th>${esc(p.name)} (kWh)</th>`).join("")}<th>Solar total</th><th>Exported</th><th>KSEB import</th><th>Solar share</th></tr></thead><tbody>`
    + shown.map(r => { const s = totals([r]).share; return `<tr><th scope="row">${monthLabel(r.month)}</th>${data.plants.map(p => `<td>${cell(r[p.id])}</td>`).join("")}<td>${fmt(solarOf(r))}</td><td>${cell(r.export)}</td><td>${cell(r.grid)}</td><td>${s == null ? "–" : fmt1(s) + "%"}</td></tr>`; }).join("")
    + (shown.length ? `<tr class="total"><th scope="row">Total</th>${data.plants.map(p => `<td>${fmt(sum(shown, r => r[p.id]))}</td>`).join("")}<td>${fmt(t.solar)}</td><td>${fmt(t.exported)}</td><td>${fmt(t.grid)}</td><td>${t.share == null ? "–" : fmt1(t.share) + "%"}</td></tr>` : `<tr><td colspan="${data.plants.length + 5}">No matching months.</td></tr>`) + `</tbody>`;
}

function downloadCsv() {
  const rows = current();
  const head = ["month", ...data.plants.map(p => p.name), "solar_total_kwh", "export_kwh", "kseb_import_kwh"];
  const lines = [head.join(",")].concat(rows.map(r => [r.month, ...data.plants.map(p => has(r[p.id]) ? r[p.id] : ""), solarOf(r), has(r.export) ? r.export : "", r.grid].join(",")));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = "solar-data.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- charts (inline SVG) ----------
function legend(sel, series) {
  $(sel).innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
}
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v);
}
const short = n => n >= 1e6 ? (n / 1e6) + "M" : n >= 1000 ? (n / 1000) + "k" : String(n);
const M = { l: 48, r: 8, t: 14, b: 30 }, W = 800, H = 300;

function axes(max, y) {
  let out = "";
  for (let t = 0; t <= 4; t++) {
    const v = max / 4 * t;
    out += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="grid-line"/><text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${short(v)}</text>`;
  }
  return out;
}

function chart(labels, series, stacked) {
  const iw = W - M.l - M.r, ih = H - M.t - M.b, n = labels.length;
  const tops = labels.map((_, i) => stacked ? series.reduce((s, x) => s + x.values[i], 0) : Math.max(...series.map(x => x.values[i])));
  const max = niceMax(Math.max(...tops, 1));
  const y = v => M.t + ih - v / max * ih;
  const band = iw / n, bw = stacked ? Math.min(band * 0.62, 60) : Math.min(band * 0.8 / series.length, 40);
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of kWh" class="chart">${axes(max, y)}`;
  labels.forEach((lab, i) => {
    const x0 = M.l + i * band;
    if (stacked) {
      let acc = 0;
      series.forEach(s => {
        const v = s.values[i], h = v / max * ih;
        if (v) out += `<rect x="${x0 + (band - bw) / 2}" y="${y(acc + v)}" width="${bw}" height="${h}" fill="${s.color}"><title>${lab} · ${esc(s.name)}: ${fmt(v)} kWh</title></rect>`;
        acc += v;
      });
    } else {
      const total = bw * series.length;
      series.forEach((s, k) => {
        const v = s.values[i];
        out += `<rect x="${x0 + (band - total) / 2 + k * bw}" y="${y(v)}" width="${Math.max(bw - 1, 1)}" height="${v / max * ih}" fill="${s.color}"><title>${lab} · ${esc(s.name)}: ${fmt(v)} kWh</title></rect>`;
      });
    }
    if (n <= 14 || i % Math.ceil(n / 14) === 0) out += `<text x="${x0 + band / 2}" y="${H - 10}" text-anchor="middle" class="tick">${lab}</text>`;
  });
  return out + `<text x="${M.l}" y="9" class="tick">kWh</text></svg>`;
}

function lineChart(labels, series) {
  const iw = W - M.l - M.r, ih = H - M.t - M.b, n = labels.length;
  const max = niceMax(Math.max(...series.flatMap(s => s.values), 1));
  const y = v => M.t + ih - v / max * ih;
  const x = i => M.l + (n === 1 ? iw / 2 : i / (n - 1) * iw);
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of cumulative kWh" class="chart">${axes(max, y)}`;
  series.forEach(s => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    out += `<polygon points="${x(0).toFixed(1)},${y(0)} ${pts.join(" ")} ${x(n - 1).toFixed(1)},${y(0)}" fill="${s.color}" opacity=".15"/>`
      + `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    if (n <= 40) s.values.forEach((v, i) => { out += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}"><title>${labels[i]}: ${fmt(v)} kWh</title></circle>`; });
  });
  const step = Math.ceil(n / 12);
  labels.forEach((lab, i) => { if (i % step === 0) out += `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="tick">${lab}</text>`; });
  return out + `<text x="${M.l}" y="9" class="tick">kWh</text></svg>`;
}
