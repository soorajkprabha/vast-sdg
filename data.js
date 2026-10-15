import { configured } from "./firebase-config.js";

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path + " failed to load");
  return res.json();
}

async function fromFirestore(name) {
  const { db, fs } = await import("./firebase.js");
  const snap = await fs.getDocs(fs.collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Firebase when configured, otherwise the sample JSON files.
export const loadActivities = () => configured ? fromFirestore("activities") : fetchJson("data/activities.json");
export const loadReports = () => configured ? fromFirestore("reports") : fetchJson("data/reports.json");
