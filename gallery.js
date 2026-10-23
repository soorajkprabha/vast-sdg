import { mountLayout } from "./layout.js";
import { loadGallery } from "./data.js";
import { loadInitiatives, esc } from "./initiatives.js";

mountLayout("gallery");
const $ = (s, r = document) => r.querySelector(s);
const LABELS = { campus: "Campus", conference: "Conferences" };
let photos = [], shown = [], idx = 0, names = { ...LABELS };

(async () => {
  try {
    const [g, inits] = await Promise.all([loadGallery(), loadInitiatives()]);
    inits.forEach(i => { names[i.id] = i.name; });
    photos = g;
    const facilities = [...new Set(photos.map(p => p.facility || "campus"))];
    const want = new URLSearchParams(location.search).get("f");
    $("#filters").innerHTML = ["all", ...facilities].map(f => `<button class="filter${(want || "all") === f ? " active" : ""}" data-f="${esc(f)}">${f === "all" ? "All photos" : esc(names[f] || f)}</button>`).join("");
    $("#filters").addEventListener("click", e => { const b = e.target.closest(".filter"); if (b) { document.querySelectorAll(".filter").forEach(x => x.classList.toggle("active", x === b)); render(b.dataset.f); } });
    render(facilities.includes(want) ? want : "all");
  } catch (e) { console.error(e); $("#error").hidden = false; }
})();

function render(f) {
  shown = photos.filter(p => f === "all" || (p.facility || "campus") === f);
  $("#photos").innerHTML = shown.length ? shown.map((p, i) => `
    <figure class="photo-tile"><button data-i="${i}" aria-label="Open photo: ${esc(p.caption || "")}"><img src="${esc(p.file)}" alt="${esc(p.caption || "")}" loading="lazy"></button>
    <figcaption>${esc(p.caption || "")}${p.year ? ` <small>${esc(p.year)}</small>` : ""}</figcaption></figure>`).join("")
    : `<p class="empty">No photos have been added yet.</p>`;
}

const lb = $("#lightbox");
function open(i) {
  idx = (i + shown.length) % shown.length;
  const p = shown[idx];
  $("#lb-img").src = p.file; $("#lb-img").alt = p.caption || "";
  $("#lb-cap").textContent = [p.caption, p.credit && "Photo: " + p.credit].filter(Boolean).join(" · ");
  if (!lb.open) lb.showModal();
}
$("#photos").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) open(+b.dataset.i); });
$("#lb-close").addEventListener("click", () => lb.close());
$("#lb-prev").addEventListener("click", () => open(idx - 1));
$("#lb-next").addEventListener("click", () => open(idx + 1));
lb.addEventListener("click", e => { if (e.target === lb) lb.close(); });
lb.addEventListener("keydown", e => { if (e.key === "ArrowLeft") open(idx - 1); if (e.key === "ArrowRight") open(idx + 1); });
