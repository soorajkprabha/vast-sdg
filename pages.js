import { mountLayout } from "./layout.js";
import { SDGS, sdgOf } from "./sdgs.js";
import { loadSolar, loadGallery, fetchJson } from "./data.js";
import { loadInitiatives, initiativeCard, sdgChips, esc } from "./initiatives.js";

const $ = (s, r = document) => r.querySelector(s);
const page = document.body.dataset.page;
mountLayout(page);

const KEY_FIGURES = [["235 kWp", "Solar power"], ["…", "solar share of electricity"], ["50,000 LPD", "Sewage treatment"], ["11 Lakh L", "Rainwater harvesting"], ["41 m³", "Bio-gas plant"]];

const views = {
  async initiatives(list) {
    $("#key-figures").innerHTML = KEY_FIGURES.map(([v, l]) => `<div><strong>${v}</strong><span>${l}</span></div>`).join("");
    $("#init-grid").innerHTML = list.map(initiativeCard).join("");
    try {
      // solar share = solar ÷ (solar + KSEB import), for the current financial year to date
      const { rows } = await loadSolar();
      const fy = m => { const [y, mo] = m.split("-").map(Number); return mo >= 4 ? y : y - 1; };
      const cur = rows.filter(r => fy(r.month) === fy(rows[rows.length - 1].month));
      const solar = cur.reduce((s, r) => s + (r.p1 || 0) + (r.p2 || 0) + (r.p3 || 0), 0), grid = cur.reduce((s, r) => s + (r.grid || 0), 0);
      const tile = $("#key-figures").children[1];
      tile.innerHTML = `<strong>${Math.round(solar / (solar + grid) * 100)}%</strong><span>solar share of electricity, FY ${fy(cur[0].month)}-${String(fy(cur[0].month) + 1).slice(2)} so far</span>`;
    } catch (e) { console.error(e); $("#key-figures").children[1].remove(); }
    $("#glance tbody").innerHTML = list.map(i => `<tr><th scope="row"><a href="initiative.html?i=${i.id}">${esc(i.name)}</a></th><td>${esc(i.capacity)}</td><td>${esc(i.outcome)}</td><td>${esc(i.theme)}</td></tr>`).join("");
  },

  initiative(list) {
    const id = new URLSearchParams(location.search).get("i");
    const idx = list.findIndex(i => i.id === id);
    if (idx < 0) throw new Error("not found");
    const i = list[idx];
    document.title = `${i.name} | Vidya Academy of Science and Technology`;
    $("#init-hero").style.setProperty("--c", i.color);
    if (["#FCC30B"].includes(i.color)) $("#init-hero").classList.add("dark-text");
    $("#init-icon").textContent = i.icon;
    $("#init-name").textContent = i.name;
    $("#init-outcome").textContent = i.outcome;
    $("#f-cap").textContent = i.capacity;
    $("#f-theme").textContent = i.theme;
    $("#f-co2").textContent = i.co2.label;
    $("#i-summary").textContent = i.summary;
    $("#i-does").innerHTML = i.does.map(d => `<li>${esc(d)}</li>`).join("");
    $("#i-note").textContent = i.note;
    if (i.id === "solar") $("#i-extra").innerHTML = `<a class="btn-primary link-btn" href="solar.html">View solar statistics →</a>`;
    $("#i-primary").innerHTML = sdgChips(i.primary);
    $("#i-secondary").innerHTML = sdgChips(i.secondary);
    $("#i-basis").textContent = "Basis: " + i.basis;
    const photo = $("#i-photo");
    const fallback = () => { photo.innerHTML = `<img src="images/initiatives/${i.id}.jpg" alt="${esc(i.name)} on campus" onerror="this.parentElement.classList.add('empty');this.remove()"><figcaption>${esc(i.name)}</figcaption>`; };
    loadGallery().then(g => {
      const mine = g.filter(x => x.facility === i.id);
      if (!mine.length) return fallback();
      photo.classList.remove("empty");
      photo.innerHTML = `<img src="${esc(mine[0].file)}" alt="${esc(mine[0].caption || i.name)}"><figcaption>${esc(mine[0].caption || i.name)} · <a href="gallery.html?f=${i.id}">See all ${mine.length} photo${mine.length === 1 ? "" : "s"} →</a></figcaption>`;
    }).catch(e => { console.error(e); fallback(); });
    const prev = list[(idx + list.length - 1) % list.length], next = list[(idx + 1) % list.length];
    $("#i-prev").href = `initiative.html?i=${prev.id}`; $("#i-prev").textContent = `← ${prev.name}`;
    $("#i-next").href = `initiative.html?i=${next.id}`; $("#i-next").textContent = `${next.name} →`;
    $("#init-body").hidden = false;
  },

  mapping(list) {
    const head = `<thead><tr><th>Initiative</th>${SDGS.map(g => `<th style="--c:${g.color}" title="${esc(g.name)}"><a href="sdg.html?g=${g.n}">${g.n}</a></th>`).join("")}</tr></thead>`;
    const rows = list.map(i => `<tr><th scope="row"><a href="initiative.html?i=${i.id}">${esc(i.name)}</a><small>${esc(i.capacity)}</small></th>${SDGS.map(g => {
      const p = i.primary.includes(g.n), s = i.secondary.includes(g.n);
      return `<td>${p ? `<span class="dot primary" style="--c:${g.color}" title="Primary: ${esc(g.name)}"></span>` : s ? `<span class="dot secondary" style="--c:${g.color}" title="Supporting: ${esc(g.name)}"></span>` : ""}</td>`;
    }).join("")}</tr>`).join("");
    $("#matrix").innerHTML = head + `<tbody>${rows}</tbody>`;
    $("#basis").innerHTML = list.map(i => `<article class="basis-card" style="--c:${i.color}">
      <h3><a href="initiative.html?i=${i.id}">${i.icon} ${esc(i.name)}</a> <small>${esc(i.capacity)}</small></h3>
      <p><strong>Primary:</strong> ${i.primary.map(n => `SDG ${n} ${esc(sdgOf(n).name)}`).join("; ")}</p>
      <p><strong>Supporting:</strong> ${i.secondary.map(n => `SDG ${n} ${esc(sdgOf(n).name)}`).join("; ")}</p>
      <p class="muted">${esc(i.basis)}</p></article>`).join("");
  },

  carbon(list) {
    const max = Math.max(...list.map(i => i.co2.hi));
    $("#co2-chart").innerHTML = list.map(i => `
      <div class="co2-row">
        <span class="co2-name">${i.icon} ${esc(i.name)}</span>
        <span class="co2-track" role="img" aria-label="${esc(i.name)}: ${esc(i.co2.label)} per year">
          <span class="co2-range" style="left:${i.co2.lo / max * 100}%;width:${Math.max((i.co2.hi - i.co2.lo) / max * 100, 1.2)}%;background:${i.color}"></span>
        </span>
        <span class="co2-val">${esc(i.co2.label)}</span>
      </div>`).join("") + `<div class="co2-axis"><span>0</span><span>${max / 2} t</span><span>${max} t</span></div>`;
    const lo = list.reduce((s, i) => s + i.co2.lo, 0), hi = list.reduce((s, i) => s + i.co2.hi, 0);
    $("#co2-table tbody").innerHTML = list.map(i => `<tr><th scope="row">${esc(i.name)} <small>${esc(i.capacity)}</small></th><td>${esc(i.co2.basis)}</td><td>${esc(i.co2.label)}</td></tr>`).join("")
      + `<tr class="total"><th scope="row">Total</th><td>Middle case about 190 t per year</td><td>about ${Math.round(lo)} to ${Math.round(hi)} t</td></tr>`;
  },

  async about() {
    const d = await fetchJson("data/institute.json");
    $("#stats").innerHTML = d.stats.map(([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join("");
    $("#overview").innerHTML = `<tbody>${d.overview.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody>`;
    const ul = (id, list) => { $(id).innerHTML = list.map(x => `<li>${esc(x)}</li>`).join(""); };
    ul("#ug", d.graduate); ul("#pg", d.postgraduate); ul("#fac", d.facilities); ul("#gov", d.governance);
    $("#links").innerHTML = d.links.map(([t, u]) => `<a class="report" href="${esc(u)}" target="_blank" rel="noopener"><span class="pdf" style="background:#00689D">↗</span><span><strong>${esc(t)}</strong><br><small>${esc(u.replace("https://", ""))}</small></span></a>`).join("");
    $("#source").textContent = `Source: ${d.source} Statistics such as placements and admissions are updated each cycle; verify against the college website before quoting.`;
  },

  evidence() {
    const confirm = [
      "Add the date of commissioning for each facility",
      "Rainwater harvesting: confirm how the 11 Lakh litre total is made up from tanks and pits (the display board shows one 1,60,000 litre tank)",
      "Solar: keep the working behind the published solar share (solar ÷ (solar + KSEB import)) and annual generation in kWh",
      "SDG mapping: confirm the primary goals chosen and link them to the relevant POs and PSOs"
    ];
    const files = [
      "Solar: meter readings, bills and commissioning certificate filed",
      "Sewage treatment: test reports and reuse records filed",
      "Rainwater harvesting: tank and pit layout with capacities filed",
      "Bio-gas: waste feed records and gas-usage details filed",
      "Photographs of all four facilities with date and location"
    ];
    const KEY = "vast-evidence-v1";
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
    const all = [...confirm, ...files];
    const li = (t, i) => `<li><label><input type="checkbox" data-k="${i}" ${saved[i] ? "checked" : ""}> <span>${esc(t)}</span></label></li>`;
    $("#confirm").innerHTML = confirm.map((t, i) => li(t, i)).join("");
    $("#files").innerHTML = files.map((t, i) => li(t, i + confirm.length)).join("");
    const update = () => {
      const n = document.querySelectorAll(".checks input:checked").length;
      $("#progress").textContent = `${n} of ${all.length} done`;
    };
    document.addEventListener("change", e => {
      if (!e.target.dataset.k) return;
      saved[e.target.dataset.k] = e.target.checked;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
      update();
    });
    update();
  }
};

(async () => {
  try { await views[page](page === "evidence" || page === "about" ? null : await loadInitiatives()); }
  catch (e) { console.error(e); const el = $("#error"); if (el) el.hidden = false; }
})();
