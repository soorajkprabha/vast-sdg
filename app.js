import { SDGS, sdgOf } from "./sdgs.js";
import { mountLayout } from "./layout.js";
import { loadInitiatives, initiativeCard, sdgChips } from "./initiatives.js";
import { loadActivities, loadReports } from "./data.js";


const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const metaLine = a => [fmtDate(a.date), a.department].filter(Boolean).map(esc).join(" · ");
const byDate = (a, b) => (b.date || "").localeCompare(a.date || "");
const fmtNum = n => n.toLocaleString("en-IN");

function chips(list) {
  return list.map(n => `<a class="chip" style="--c:${sdgOf(n).color}" href="sdg.html?g=${n}">SDG ${n}</a>`).join("");
}

function activityCard(a, i) {
  const primary = sdgOf(a.sdgs[0]);
  const media = a.image
    ? `<img src="${esc(a.image)}" alt="${esc(a.title)}" loading="lazy">`
    : `<div class="ph" style="--c:${primary.color}"><span>${primary.n}</span></div>`;
  return `<article class="activity">
    ${media}
    <div class="body">
      <div class="chips">${chips(a.sdgs)}</div>
      <h3>${esc(a.title)}</h3>
      <p class="meta">${metaLine(a)}</p>
      <p>${esc(a.description)}</p>
      <button class="link" data-i="${i}">View details →</button>
    </div>
  </article>`;
}

function wireModal(activities) {
  const dlg = $("#modal");
  document.addEventListener("click", e => {
    const b = e.target.closest("button.link");
    if (!b) return;
    const a = activities[b.dataset.i];
    $("#modal-body").innerHTML = `
      <div class="chips">${chips(a.sdgs)}</div>
      <h2>${esc(a.title)}</h2>
      <p class="meta">${metaLine(a)}</p>
      ${a.image ? `<img class="full" src="${esc(a.image)}" alt="${esc(a.title)}">` : ""}
      <p>${esc(a.description)}</p>
      ${a.outcomes ? `<h3>Outcomes</h3><p>${esc(a.outcomes)}</p>` : ""}
      ${a.beneficiaries || a.hours ? `<p class="meta">${[a.beneficiaries ? `<strong>${fmtNum(a.beneficiaries)}</strong> beneficiaries` : "", a.hours ? `<strong>${fmtNum(a.hours)}</strong> volunteer hours` : ""].filter(Boolean).join(" · ")}</p>` : ""}
      ${a.link ? `<p><a href="${esc(a.link)}"${/^https?:/.test(a.link) ? ' target="_blank" rel="noopener"' : ""}>${/^https?:/.test(a.link) ? "Read the full report ↗" : "Read more →"}</a></p>` : ""}`;
    dlg.showModal();
  });
  $("#modal-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
}

const navSetup = () => mountLayout(document.body.dataset.page);

function countUp(el, target) {
  const start = performance.now();
  const tick = now => {
    const p = Math.min((now - start) / 1200, 1);
    el.textContent = fmtNum(Math.round(target * p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderStats(activities) {
  const covered = new Set(activities.flatMap(a => a.sdgs)).size;
  const vals = {
    activities: activities.length,
    beneficiaries: activities.reduce((s, a) => s + (a.beneficiaries || 0), 0),
    hours: activities.reduce((s, a) => s + (a.hours || 0), 0),
    covered
  };
  document.querySelectorAll("[data-stat]").forEach(el => {
    const v = vals[el.dataset.stat];
    // hide figures nobody has recorded yet rather than showing a misleading 0
    if (!v && (el.dataset.stat === "beneficiaries" || el.dataset.stat === "hours")) el.parentElement.hidden = true;
    else countUp(el, v);
  });

  const counts = SDGS.map(g => activities.filter(a => a.sdgs.includes(g.n)).length);
  const max = Math.max(1, ...counts);
  $("#bars").innerHTML = SDGS.map((g, i) => `
    <a class="bar-row" href="sdg.html?g=${g.n}" title="${esc(g.name)}">
      <span class="bar-label">SDG ${g.n}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${counts[i] / max * 100}%;background:${g.color}"></span></span>
      <span class="bar-val">${counts[i]}</span>
    </a>`).join("");
}

async function initHome() {
  navSetup();
  const [activities, reports] = await Promise.all([loadActivities(), loadReports()]);
  activities.sort(byDate);
  const count = n => activities.filter(a => a.sdgs.includes(n)).length;

  $("#goals-grid").innerHTML = SDGS.map(g => `
    <a class="goal" style="--c:${g.color}" href="sdg.html?g=${g.n}">
      <img class="icon" src="images/sdg/${g.n}.png" alt="SDG ${g.n}: ${esc(g.name)}" onerror="this.remove()">
      <span class="num">${g.n}</span>
      <span class="name">${esc(g.name)}</span>
      <span class="count">${count(g.n)} activit${count(g.n) === 1 ? "y" : "ies"}</span>
    </a>`).join("");

  renderStats(activities);
  loadInitiatives().then(list => { $("#home-initiatives").innerHTML = list.map(initiativeCard).join(""); }).catch(console.error);
  $("#latest").innerHTML = activities.slice(0, 6).map(a => activityCard(a, activities.indexOf(a))).join("")
    || `<p class="empty">No activities have been added yet.</p>`;
  $("#reports-list").innerHTML = reports.map(r => `
    <a class="report" href="${esc(r.file)}" download>
      <span class="pdf">PDF</span>
      <span><strong>${esc(r.title)}</strong><br><small>${esc(r.year)} · ${esc(r.description)}</small></span>
    </a>`).join("") || `<p class="empty">No reports have been uploaded yet.</p>`;
  wireModal(activities);
}

async function initGoal() {
  navSetup();
  const n = Math.min(17, Math.max(1, parseInt(new URLSearchParams(location.search).get("g")) || 1));
  const g = sdgOf(n);
  document.title = `SDG ${n}: ${g.name} | Vidya Academy of Science and Technology`;
  $("#goal-hero").style.setProperty("--c", g.color);
  $("#goal-num").textContent = n;
  $("#goal-name").textContent = g.name;
  const icon = $("#goal-icon");
  icon.onload = () => { icon.hidden = false; $("#goal-num").hidden = true; };
  icon.alt = `SDG ${n}: ${g.name}`;
  icon.src = `images/sdg/${n}.png`;
  $("#prev").href = `sdg.html?g=${n === 1 ? 17 : n - 1}`;
  $("#next").href = `sdg.html?g=${n === 17 ? 1 : n + 1}`;

  const all = (await loadActivities()).sort(byDate);
  const mine = all.filter(a => a.sdgs.includes(n));
  const benef = mine.reduce((s, a) => s + (a.beneficiaries || 0), 0);
  $("#goal-count").textContent = `${mine.length} activit${mine.length === 1 ? "y" : "ies"}${benef ? ` · ${fmtNum(benef)} beneficiaries` : ""}`;
  $("#activities").innerHTML = mine.length
    ? mine.map(a => activityCard(a, all.indexOf(a))).join("")
    : `<p class="empty">No activities recorded for this goal yet.</p>`;
  wireModal(all);
  loadInitiatives().then(list => {
    const rel = list.filter(i => i.primary.includes(n) || i.secondary.includes(n));
    if (!rel.length) return;
    $("#goal-initiatives").hidden = false;
    $("#goal-init-grid").innerHTML = rel.map(i => initiativeCard(i) + "").join("");
  }).catch(console.error);
}

const init = document.body.dataset.page === "goal" ? initGoal : initHome;
init().catch(err => {
  console.error(err);
  const el = $("#error");
  if (el) el.hidden = false;
});
