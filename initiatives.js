import { sdgOf } from "./sdgs.js";
import { fetchJson } from "./data.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const loadInitiatives = () => fetchJson("data/initiatives.json");

export const sdgChips = (list, cls = "") =>
  list.map(n => `<a class="chip ${cls}" style="--c:${sdgOf(n).color}" href="sdg.html?g=${n}" title="${esc(sdgOf(n).name)}">SDG ${n}</a>`).join("");

export function initiativeCard(i) {
  return `<a class="init-card" style="--c:${i.color}" href="initiative.html?i=${i.id}">
    <span class="init-theme">${esc(i.theme)}</span>
    <h3>${esc(i.name)}</h3>
    <strong class="init-cap">${esc(i.capacity)}</strong>
    <p>${esc(i.outcome)}</p>
    <span class="chips">${i.primary.map(n => `<span class="chip" style="--c:${sdgOf(n).color}">SDG ${n}</span>`).join("")}</span>
  </a>`;
}
