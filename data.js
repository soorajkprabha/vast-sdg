import { configured } from "./firebase-config.js";

// A new query string every minute stops browsers and the Pages CDN from serving stale data files after an update.
const bust = () => Math.floor(Date.now() / 60000);
export async function fetchJson(path) {
  const res = await fetch(`${path}?t=${bust()}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(path + " failed to load");
  return res.json();
}

async function fromFirestore(name) {
  const { db, fs } = await import("./firebase.js");
  const snap = await fs.getDocs(fs.collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Firebase when configured, otherwise the sample JSON files.
// Entries with "verified": false are proposals from the news importer and stay hidden until a person approves them.
export const loadActivities = async () => (await (configured ? fromFirestore("activities") : fetchJson("data/activities.json"))).filter(a => a.verified !== false);
export const loadReports = () => configured ? fromFirestore("reports") : fetchJson("data/reports.json");

// Solar: plant names/ratings/settings come from data/solar.json; monthly readings from Firebase when configured.
export async function loadSolar() {
  const cfg = await fetchJson("data/solar.json");
  const rows = configured ? await fromFirestore("solar") : cfg.readings;
  rows.sort((a, b) => a.month.localeCompare(b.month));
  return { plants: cfg.plants, config: cfg.config, rows, sample: !configured && !!cfg.sample };
}

export const loadGallery = () => fetchJson("data/gallery.json");
