import { SDGS } from "./sdgs.js";
import { configured } from "./firebase-config.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notice = msg => { const n = $("#notice"); n.textContent = msg; n.hidden = !msg; };
const status = (k, msg) => { $(`[data-status=${k}]`).textContent = msg; };

if (!configured) {
  notice("Firebase is not configured yet. Fill in firebase-config.js (see README) and reload.");
} else {
  start().catch(e => { console.error(e); notice("Could not load Firebase: " + e.message); });
}

async function start() {
  const { db, auth, storage, fs, au, st } = await import("./firebase.js");
  let activities = [], reports = [], solarRows = [], solarCfg = null, editing = null;

  // ---- auth ----
  au.onAuthStateChanged(auth, user => {
    $("#login").hidden = !!user;
    $("#app").hidden = !user;
    $("#user-box").hidden = !user;
    if (user) { $("#user-email").textContent = user.email; refresh(); }
  });
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    notice("");
    try { await au.signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); }
    catch { notice("Sign-in failed. Check your email and password."); }
  });
  $("#signout").addEventListener("click", () => au.signOut(auth));

  // ---- tabs ----
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    $("#tab-activities").hidden = t.dataset.tab !== "activities";
    $("#tab-reports").hidden = t.dataset.tab !== "reports";
    $("#tab-solar").hidden = t.dataset.tab !== "solar";
  }));

  // ---- data ----
  async function refresh() {
    try {
      const [a, r] = await Promise.all([fs.getDocs(fs.collection(db, "activities")), fs.getDocs(fs.collection(db, "reports"))]);
      activities = a.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => (y.date || "").localeCompare(x.date || ""));
      reports = r.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => (y.year || "").localeCompare(x.year || ""));
      await refreshSolar();
      render();
    } catch (e) { notice("Could not load data: " + e.message); }
  }

  function render() {
    $("#activity-list").innerHTML = activities.length ? activities.map(a => `
      <div class="item">
        <div><strong>${esc(a.title)}</strong><br><small>${[a.date, a.department].filter(Boolean).map(esc).join(" · ")} · SDG ${a.sdgs.join(", ")}</small></div>
        <div class="item-actions"><button class="btn-outline" data-edit="${a.id}">Edit</button><button class="btn-danger" data-del-a="${a.id}">Delete</button></div>
      </div>`).join("") : `<p class="muted">No activities yet.</p>`;
    $("#report-list").innerHTML = reports.length ? reports.map(r => `
      <div class="item">
        <div><strong>${esc(r.title)}</strong><br><small>${esc(r.year)} · <a href="${esc(r.file)}" target="_blank" rel="noopener">Open PDF</a></small></div>
        <div class="item-actions"><button class="btn-danger" data-del-r="${r.id}">Delete</button></div>
      </div>`).join("") : `<p class="muted">No reports yet.</p>`;
  }

  // ---- activity form ----
  $("#sdg-picks").innerHTML = SDGS.map(g => `
    <label class="pick" style="--c:${g.color}" title="${esc(g.name)}"><input type="checkbox" value="${g.n}"><span>${g.n}</span></label>`).join("");
  const aForm = $("#activity-form");

  function openActivity(a) {
    editing = a || null;
    aForm.reset();
    aForm.querySelectorAll("#sdg-picks input").forEach(c => { c.checked = !!a && a.sdgs.includes(+c.value); });
    if (a) {
      for (const k of ["title", "date", "department", "description", "outcomes", "beneficiaries", "hours"]) aForm.elements[k].value = a[k] ?? "";
    }
    $("#current-image").hidden = !(a && a.image);
    if (a && a.image) $("#current-image img").src = a.image;
    $("#activity-form-title").textContent = a ? "Edit activity" : "New activity";
    status("activity", "");
    aForm.hidden = false;
    aForm.scrollIntoView({ behavior: "smooth" });
  }
  $("#new-activity").addEventListener("click", () => openActivity(null));
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.dataset.cancel === "activity") aForm.hidden = true;
    if (t.dataset.cancel === "report") $("#report-form").hidden = true;
    if (t.dataset.edit) openActivity(activities.find(a => a.id === t.dataset.edit));
    if (t.dataset.delA) delActivity(t.dataset.delA);
    if (t.dataset.delR) delReport(t.dataset.delR);
  });

  // Shrink photos before upload so pages stay fast
  async function resize(file, max = 1600) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
  }
  const safe = n => n.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  const removeFile = async path => { if (path) try { await st.deleteObject(st.ref(storage, path)); } catch (e) { console.warn(e); } };

  aForm.addEventListener("submit", async e => {
    e.preventDefault();
    const sdgs = [...aForm.querySelectorAll("#sdg-picks input:checked")].map(c => +c.value);
    if (!sdgs.length) return status("activity", "Choose at least one SDG.");
    const f = aForm.elements;
    const btn = aForm.querySelector("[type=submit]");
    btn.disabled = true; status("activity", "Saving…");
    try {
      let image = editing?.image || "", imagePath = editing?.imagePath || "";
      const file = f.image.files[0];
      if (file || f.removeImage.checked) { await removeFile(imagePath); image = ""; imagePath = ""; }
      if (file) {
        imagePath = `activities/${Date.now()}-${safe(file.name)}.jpg`;
        const ref = st.ref(storage, imagePath);
        await st.uploadBytes(ref, await resize(file), { contentType: "image/jpeg" });
        image = await st.getDownloadURL(ref);
      }
      const data = {
        title: f.title.value.trim(), date: f.date.value, department: f.department.value.trim(), sdgs,
        description: f.description.value.trim(), outcomes: f.outcomes.value.trim(),
        beneficiaries: Math.max(0, +f.beneficiaries.value || 0), hours: Math.max(0, +f.hours.value || 0),
        image, imagePath, updatedAt: Date.now()
      };
      if (editing) await fs.setDoc(fs.doc(db, "activities", editing.id), data);
      else await fs.addDoc(fs.collection(db, "activities"), data);
      aForm.hidden = true;
      await refresh();
    } catch (err) { console.error(err); status("activity", "Save failed: " + err.message); }
    btn.disabled = false;
  });

  async function delActivity(id) {
    const a = activities.find(x => x.id === id);
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try { await removeFile(a.imagePath); await fs.deleteDoc(fs.doc(db, "activities", id)); await refresh(); }
    catch (err) { notice("Delete failed: " + err.message); }
  }

  // ---- solar ----
  async function solarConfig() {
    if (!solarCfg) solarCfg = await (await fetch("data/solar.json?t=" + Date.now())).json();
    return solarCfg;
  }
  async function refreshSolar() {
    const snap = await fs.getDocs(fs.collection(db, "solar"));
    solarRows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.month.localeCompare(a.month));
    const cfg = await solarConfig();
    const f = n => (n == null ? "–" : Math.round(n).toLocaleString("en-IN"));
    $("#solar-list").innerHTML = solarRows.length ? solarRows.map(r => `
      <div class="item">
        <div><strong>${esc(r.month)}</strong><br><small>${cfg.plants.map(p => `${esc(p.name)}: ${f(r[p.id])}`).join(" · ")} · Export: ${f(r.export)} · KSEB import: ${f(r.grid)} kWh</small></div>
        <div class="item-actions"><button class="btn-outline" data-edit-solar="${esc(r.month)}">Edit</button><button class="btn-danger" data-del-solar="${esc(r.month)}">Delete</button></div>
      </div>`).join("") : `<p class="muted">No solar readings in Firebase yet. Use "Import readings from data/solar.json" to load the historical data, then add new months here.</p>`;
  }
  const sForm = $("#solar-form");
  const numOrNull = v => (v === "" || v == null ? null : +v);
  async function openSolar(row) {
    const cfg = await solarConfig();
    $("#solar-plant-fields").innerHTML = cfg.plants.map(p => `<label>${esc(p.name)}<input name="${p.id}" type="number" min="0" step="any"></label>`).join("");
    sForm.reset();
    if (row) {
      sForm.elements.month.value = row.month;
      for (const k of ["grid", "export", ...cfg.plants.map(p => p.id)]) if (row[k] != null) sForm.elements[k].value = row[k];
    }
    status("solar", "");
    sForm.hidden = false;
    sForm.scrollIntoView({ behavior: "smooth" });
  }
  $("#new-solar").addEventListener("click", () => openSolar(null));
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.dataset.cancel === "solar") sForm.hidden = true;
    if (t.dataset.editSolar) openSolar(solarRows.find(r => r.month === t.dataset.editSolar));
    if (t.dataset.delSolar) delSolar(t.dataset.delSolar);
  });
  sForm.addEventListener("submit", async e => {
    e.preventDefault();
    const cfg = await solarConfig();
    const f = sForm.elements;
    const data = { month: f.month.value };
    for (const k of ["grid", "export", ...cfg.plants.map(p => p.id)]) {
      const v = numOrNull(f[k].value);
      if (v != null) { if (v < 0) return status("solar", "Values cannot be negative."); data[k] = v; }
    }
    const btn = sForm.querySelector("[type=submit]");
    btn.disabled = true; status("solar", "Saving…");
    try {
      await fs.setDoc(fs.doc(db, "solar", data.month), data);
      sForm.hidden = true;
      await refreshSolar();
    } catch (err) { console.error(err); status("solar", "Save failed: " + err.message); }
    btn.disabled = false;
  });
  async function delSolar(month) {
    if (!confirm(`Delete the solar readings for ${month}?`)) return;
    try { await fs.deleteDoc(fs.doc(db, "solar", month)); await refreshSolar(); }
    catch (err) { notice("Delete failed: " + err.message); }
  }
  $("#import-solar").addEventListener("click", async () => {
    const cfg = await solarConfig();
    if (!confirm(`Write ${cfg.readings.length} monthly readings from data/solar.json into Firebase? Months that already exist will be replaced.`)) return;
    status("solar-list", "Importing…");
    try {
      for (let i = 0; i < cfg.readings.length; i += 400) {
        const batch = fs.writeBatch(db);
        cfg.readings.slice(i, i + 400).forEach(r => batch.set(fs.doc(db, "solar", r.month), r));
        await batch.commit();
      }
      status("solar-list", "Import complete.");
      await refreshSolar();
    } catch (err) { console.error(err); status("solar-list", "Import failed: " + err.message); }
  });

  // ---- reports ----
  const rForm = $("#report-form");
  $("#new-report").addEventListener("click", () => { rForm.reset(); status("report", ""); rForm.hidden = false; rForm.scrollIntoView({ behavior: "smooth" }); });
  rForm.addEventListener("submit", async e => {
    e.preventDefault();
    const f = rForm.elements, file = f.file.files[0];
    if (!file || file.type !== "application/pdf") return status("report", "Choose a PDF file.");
    if (file.size > 20 * 1024 * 1024) return status("report", "PDF must be under 20 MB.");
    const btn = rForm.querySelector("[type=submit]");
    btn.disabled = true; status("report", "Uploading…");
    try {
      const filePath = `reports/${Date.now()}-${safe(file.name)}.pdf`;
      const ref = st.ref(storage, filePath);
      await st.uploadBytes(ref, file, { contentType: "application/pdf" });
      await fs.addDoc(fs.collection(db, "reports"), {
        title: f.title.value.trim(), year: f.year.value.trim(), description: f.description.value.trim(),
        file: await st.getDownloadURL(ref), filePath, createdAt: Date.now()
      });
      rForm.hidden = true;
      await refresh();
    } catch (err) { console.error(err); status("report", "Upload failed: " + err.message); }
    btn.disabled = false;
  });

  async function delReport(id) {
    const r = reports.find(x => x.id === id);
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    try { await removeFile(r.filePath); await fs.deleteDoc(fs.doc(db, "reports", id)); await refresh(); }
    catch (err) { notice("Delete failed: " + err.message); }
  }
}
