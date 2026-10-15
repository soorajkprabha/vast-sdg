const LINKS = [
  ["index.html", "Home", "home"],
  ["initiatives.html", "Initiatives", "initiatives"],
  ["solar.html", "Solar statistics", "solar"],
  ["sdg-mapping.html", "SDG mapping", "mapping"],
  ["carbon.html", "Carbon impact", "carbon"],
  ["index.html#goals", "Goals", "goal"],
  ["index.html#reports", "Reports", "reports"]
];

export function mountLayout(page) {
  const active = page === "initiative" ? "initiatives" : page;
  const header = document.getElementById("header");
  const footer = document.getElementById("footer");
  if (header) {
    header.innerHTML = `<div class="container nav">
      <a href="index.html" class="brand"><img class="logo-img" src="images/logo.png" alt="Vidya Academy of Science and Technology logo" onerror="this.outerHTML='<span class=&quot;logo&quot;>V</span>'"><span>Vidya Academy <small>SDG Activities</small></span></a>
      <button class="menu-btn" aria-label="Toggle menu" aria-expanded="false">☰</button>
      <nav id="menu">${LINKS.map(([h, t, k]) => `<a href="${h}"${k === active ? ' class="current" aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
    </div>`;
    const btn = header.querySelector(".menu-btn"), nav = header.querySelector("#menu");
    btn.addEventListener("click", () => btn.setAttribute("aria-expanded", nav.classList.toggle("open")));
    nav.addEventListener("click", e => { if (e.target.tagName === "A") nav.classList.remove("open"); });
  }
  if (footer) {
    footer.innerHTML = `<div class="container">© ${new Date().getFullYear()} Vidya Academy of Science and Technology. SDG icons and colours belong to the United Nations. · <a href="admin.html">Admin</a></div>`;
  }
}
