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
  const scrollable = document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.setProperty("--scroll-progress", `${scrollable > 0 ? scrollY / scrollable * 100 : 0}%`);
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
      const p = Math.max(0, Math.min(1, (innerHeight - r.top) / (innerHeight * 0.9)));
      $(".product-surface").style.transform = `rotateY(${-5 * (1 - p)}deg) rotateX(${4 * (1 - p)}deg) scale(${0.96 + 0.04 * p})`;
    }
    if (scrollY < innerHeight) {
      const p = Math.min(scrollY / innerHeight, 1);
      $(".architecture").style.transform = `translateY(${p * 24}px)`;
      $(".hero-copy").style.translate = `0 ${p * -18}px`;
      const portrait = $(".portrait-layer");
      if (portrait) portrait.style.translate = `0 ${p * 12}px`;
    }
  } else {
    $(".hero-copy").style.translate = "";
    const portrait = $(".portrait-layer");
    if (portrait) portrait.style.translate = "";
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
  ".section-heading,.work-item,.about-layout,.capabilities,.timeline li,.contact h2,.hero-copy,.hero-copy .eyebrow,.hero-copy .intro,.hero .actions,.hero .socials,.hero-meta,.hero-note,.hero-baseline,.product-stage,.feature-rail",
).forEach((el) => {
  el.classList.add("reveal");
  observer.observe(el);
});
document.body.classList.add("motion-ready");
portfolioHighlights.forEach(({title}, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<span>${String(i + 1).padStart(2, "0")}</span>${title}`;
  b.setAttribute("aria-pressed", String(i === 0));
  b.addEventListener("click", () => selectFeature(i));
  $("#feature-controls").append(b);
});
let currentFeature = 0;
let featureRequest = 0;
const evidenceCache = new Map();
function loadEvidence(feature) {
  if (!evidenceCache.has(feature.src)) {
    const image = new Image();
    image.src = feature.src;
    evidenceCache.set(feature.src, image.decode().then(() => image));
  }
  return evidenceCache.get(feature.src);
}
async function selectFeature(i) {
  i = (i + portfolioHighlights.length) % portfolioHighlights.length;
  currentFeature = i;
  const request = ++featureRequest;
  const feature = portfolioHighlights[i];
  const buttons = $$("#feature-controls button");
  buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(index === i)));
  $("#feature-controls").style.setProperty("--active-y", buttons[i].offsetTop + "px");
  $("#feature-controls").style.setProperty("--active-height", buttons[i].offsetHeight + "px");
  try {
    await loadEvidence(feature);
    if (request !== featureRequest) return;
    const screen = $(".product-screen");
    const previous = $("#featured-image");
    screen.querySelectorAll("img:not(#featured-image)").forEach(image => image.remove());
    if (previous.getAttribute("src") !== feature.src) {
      const incoming = new Image();
      incoming.src = feature.src;
      incoming.alt = feature.alt;
      await incoming.decode();
      if (request !== featureRequest) return;
      previous.removeAttribute("id");
      incoming.id = "featured-image";
      screen.append(incoming);
      if (!motion.matches) {
        previous.animate([{opacity:1,transform:"scale(1)"},{opacity:0,transform:"scale(.985) translateZ(-20px)"}],{duration:500,easing:"ease",fill:"forwards"});
        await incoming.animate([{opacity:0,transform:"scale(1.015) translateZ(20px)"},{opacity:1,transform:"scale(1) translateZ(0)"}],{duration:550,easing:"cubic-bezier(.2,.7,.2,1)"}).finished;
      }
      previous.remove();
    }
    if (request !== featureRequest) return;
    $("#feature-number").textContent = String(i + 1).padStart(2,"0") + " / 08";
    $("#feature-description").textContent = feature.description;
    $(".browser-bar span:nth-child(2)").textContent = "NEXZO / " + feature.label;
    $(".screen-caption span:first-child").textContent = feature.title.toUpperCase();
    $(".screen-caption span:last-child").textContent = String(i+1).padStart(2,"0") + "—08";
    $("#feature-source").href = feature.source;
    $("#capture-link").href = feature.src;
    const controls = $("#feature-controls");
    if (innerWidth <= 800) controls.scrollTo({left:buttons[i].offsetLeft-controls.offsetLeft,behavior:motion.matches?"instant":"smooth"});
    for (const offset of [-1,1]) loadEvidence(portfolioHighlights[(i+offset+portfolioHighlights.length)%portfolioHighlights.length]).catch(()=>{});
  } catch {
    if (request === featureRequest) $("#feature-description").textContent = "The product capture could not load. Open the live NEXZO page using the source link.";
  }
}
$("#feature-prev").addEventListener("click", () => selectFeature(currentFeature - 1));
$("#feature-next").addEventListener("click", () => selectFeature(currentFeature + 1));
$("#featured").addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); selectFeature(currentFeature + (e.key === "ArrowRight" ? 1 : -1)); }
});
let swipeStart = null;
$(".product-stage").addEventListener("touchstart", (e) => { swipeStart = e.changedTouches[0].clientX; }, { passive: true });
$(".product-stage").addEventListener("touchend", (e) => {
  if (swipeStart === null) return;
  const distance = e.changedTouches[0].clientX - swipeStart;
  if (Math.abs(distance) > 45) selectFeature(currentFeature + (distance < 0 ? 1 : -1));
  swipeStart = null;
}, { passive: true });
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
    dlg.dataset.project = b.dataset.case;
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
      img.alt = p.name + (b.dataset.case === "nexzo" ? " — captured live product interface" : " — bundled project screenshot");
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
    if (p.flow) {
      const architecture = document.createElement("section");
      architecture.className = "architecture-evidence";
      const heading = document.createElement("h3");
      heading.textContent = "PERSONALIZATION / DATA FLOW";
      const flow = document.createElement("ol");
      p.flow.forEach(step => { const item = document.createElement("li"); item.textContent = step; flow.append(item); });
      const note = document.createElement("p");
      note.textContent = "Implementation diagram based on the bundled data service and personalization engine. It is not a product screenshot or a performance claim.";
      architecture.append(heading, flow, note);
      wrap.append(architecture);
    }
    const actions = document.createElement("div");
    actions.className = "case-actions";
    if (p.url) {
      const a = document.createElement("a");
      a.className = "button primary";
      a.href = p.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = b.dataset.case === "nexzo" ? "View live NEXZO ↗" : "Open bundled project ↗";
      actions.append(a);
    }
    const gh = document.createElement("a");
    gh.className = "button";
    gh.href = p.sourceUrl || (p.url ? "https://github.com/Rudra-801/rudra-sharma-portfolio/tree/main/projects/" + b.dataset.case : "https://github.com/Rudra-801");
    gh.target = "_blank";
    gh.rel = "noopener";
    gh.textContent = p.url ? "GitHub source ↗" : "GitHub profile ↗";
    actions.append(gh);
    wrap.append(actions);
    content.append(wrap);
    dlg.showModal();
    history.pushState({ caseStudy: b.dataset.case }, "", `#case-${b.dataset.case}`);
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
dlg.addEventListener("close", () => {
  if (location.hash.startsWith("#case-")) history.replaceState({}, "", location.pathname + location.search);
  opener?.focus();
});
addEventListener("popstate", () => { if (dlg.open) dlg.close(); });
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
