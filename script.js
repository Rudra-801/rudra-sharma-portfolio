"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const motion = matchMedia("(prefers-reduced-motion: reduce)"),
  menu = $(".menu-toggle"),
  nav = $("#navigation");
function closeMenu() {
  nav.classList.remove("open");
  menu.setAttribute("aria-expanded", "false");
}
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("open", open);
});
nav.addEventListener("click", (e) => {
  if (e.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("open")) {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".nav")) closeMenu();
});
matchMedia("(min-width: 801px)").addEventListener("change", closeMenu);
$("#year").textContent = new Date().getFullYear();
const sections = $$("main section[id]"),
  links = $$("#navigation a");
let scheduled = false;
function updateScroll() {
  scheduled = false;
  $(".nav").classList.toggle("scrolled", scrollY > 20);
  let active = "home";
  for (const s of sections)
    if (s.getBoundingClientRect().top < innerHeight * 0.4) active = s.id;
  if (active === "featured") active = "projects";
  for (const a of links) {
    const on = a.hash === "#" + active;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "location");
    else a.removeAttribute("aria-current");
  }
  if (!motion.matches && innerWidth > 800) {
    const r = $("#featured").getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) {
      const p = Math.max(
        0,
        Math.min(1, (innerHeight - r.top) / (innerHeight * 0.9)),
      );
      $(".product-surface").style.transform =
        `rotateY(${-12 * (1 - p)}deg) rotateX(${8 * (1 - p)}deg) translateZ(${-45 * (1 - p)}px)`;
    }
    if (scrollY < innerHeight)
      $(".architecture").style.transform =
        `rotateY(-23deg) rotateZ(13deg) translateY(${Math.min(scrollY * 0.12, 70)}px)`;
  }
}
addEventListener(
  "scroll",
  () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateScroll);
    }
  },
  { passive: true },
);
addEventListener("resize", updateScroll);
motion.addEventListener("change", () => {
  if (motion.matches) {
    $(".architecture").style.transform = "";
    $(".product-surface").style.transform = "";
  }
  updateScroll();
});
updateScroll();
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    }),
  { threshold: 0.08 },
);
$$(
  ".section-heading,.work-item,.about-layout,.capabilities,.timeline li,.contact h2",
).forEach((el) => {
  el.classList.add("reveal");
  observer.observe(el);
});
document.body.classList.add("motion-ready");
portfolioHighlights.forEach(([title], i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<span>${String(i + 1).padStart(2, "0")}</span>${title}`;
  b.setAttribute("aria-pressed", String(i === 0));
  b.addEventListener("click", () => selectFeature(i));
  $("#feature-controls").append(b);
});
function selectFeature(i) {
  $$("#feature-controls button").forEach((b, j) =>
    b.setAttribute("aria-pressed", String(i === j)),
  );
  $("#feature-number").textContent = String(i + 1).padStart(2, "0") + " / 08";
  $("#feature-description").textContent = portfolioHighlights[i][1];
  $(".screen-caption span:first-child").textContent =
    portfolioHighlights[i][0].toUpperCase();
  $(".screen-caption span:last-child").textContent =
    String(i + 1).padStart(2, "0") + "—08";
}
selectFeature(0);
const dlg = $("#caseModal");
let opener;
$$("[data-case]").forEach((b) =>
  b.addEventListener("click", () => {
    const p = portfolioProjects[b.dataset.case];
    if (!p) return;
    opener = b;
    const content = $("#modalBody");
    content.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "modal-inner";
    const label = document.createElement("p");
    label.className = "eyebrow";
    label.textContent = p.url
      ? "ENGINEERING CASE STUDY"
      : "PROJECT DIRECTION / IN DEVELOPMENT";
    const title = document.createElement("h2");
    title.id = "case-title";
    title.textContent = p.name;
    const desc = document.createElement("p");
    desc.textContent = p.description;
    wrap.append(label, title, desc);
    if (p.shot) {
      const figure = document.createElement("div");
      figure.className = "case-hero";
      const img = new Image();
      img.src = p.shot;
      img.alt = p.name + " — bundled project screenshot";
      figure.append(img);
      wrap.append(figure);
    }
    const grid = document.createElement("div");
    grid.className = "modal-grid";
    Object.entries(p.sections).forEach(([heading, text]) => {
      const a = document.createElement("article"),
        h = document.createElement("h3"),
        body = document.createElement("p");
      h.textContent = heading;
      body.textContent = text;
      a.append(h, body);
      grid.append(a);
    });
    wrap.append(grid);
    const actions = document.createElement("div");
    actions.className = "case-actions";
    if (p.url) {
      const a = document.createElement("a");
      a.className = "button primary";
      a.href = p.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open bundled project ↗";
      actions.append(a);
    }
    const gh = document.createElement("a");
    gh.className = "button";
    gh.href = p.url ? "https://github.com/Rudra-801/rudra-sharma-portfolio/tree/main/projects/" + b.dataset.case : "https://github.com/Rudra-801";
    gh.target = "_blank";
    gh.rel = "noopener";
    gh.textContent = p.url ? "GitHub source ↗" : "GitHub profile ↗";
    actions.append(gh);
    wrap.append(actions);
    content.append(wrap);
    dlg.showModal();
    dlg.scrollTop = 0;
    $("#modalClose").focus();
  }),
);
$("#modalClose").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => {
  if (e.target === dlg) {
    const r = dlg.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dlg.close();
  }
});
dlg.addEventListener("close", () => opener?.focus());
[
  ["pulsechat", "PulseChat", "Realtime messaging"],
  ["cartforge", "CartForge", "Commerce & catalog APIs"],
  ["quizops", "QuizOps", "Assessment workflows"],
  ["taskflow", "TaskFlow Pro", "Task management"],
  ["studenthub", "StudentHub", "Student records"],
  ["expenseflow", "ExpenseFlow", "Expense tracking"],
].forEach(([id, name, description]) => {
  const a = document.createElement("a");
  a.href = `projects/${id}/index.html`;
  a.target = "_blank";
  a.rel = "noopener";
  a.innerHTML = `${name}<span>${description} ↗</span>`;
  $("#experiments").append(a);
});
$("#contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  if (!f.reportValidity()) return;
  const button = f.querySelector("button[type=submit]"),
    status = $("#contactStatus");
  button.disabled = true;
  button.textContent = "Sending…";
  status.textContent = "";
  const abort = new AbortController(),
    timeout = setTimeout(() => abort.abort(), 15000);
  try {
    const r = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(f))),
      signal: abort.signal,
    });
    const data = await r.json();
    if (!r.ok)
      throw new Error(
        data.error || "Could not send your message. Please try email.",
      );
    status.textContent = data.message;
    f.reset();
  } catch (error) {
    status.textContent =
      error.name === "AbortError"
        ? "The request timed out. Please try again or use email."
        : error.message || "Could not send. Please use email.";
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
    button.innerHTML = "Send Message <span>↗</span>";
  }
});
fetch("assets/portrait-config.json")
  .then((r) => r.json())
  .then(({ src, alt }) => {
    if (!src || !/^assets\/[\w./-]+\.(png|webp|avif)$/i.test(src)) return;
    const img = new Image();
    img.alt = alt || "Rudra Sharma";
    img.onload = () => {
      const layer = document.createElement("div");
      layer.className = "portrait-layer";
      layer.append(img);
      $(".hero").append(layer);
    };
    img.src = src;
  })
  .catch(() => {});
