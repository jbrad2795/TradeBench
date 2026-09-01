/* Shared across all pages. No dependencies.
 *   1. mark the top-nav link for the current page
 *   2. if the page has a .subnav, highlight the link for the section in view
 * Uses IntersectionObserver so it does not depend on scroll events firing.
 */
(function () {
  "use strict";

  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll(".topbar .nav a").forEach((a) => {
    const target = (a.getAttribute("href") || "").split("#")[0].toLowerCase();
    if (target === here || (here === "" && target === "index.html")) a.classList.add("current");
  });

  const sub = document.querySelector(".subnav");
  if (!sub) return;

  const links = [...sub.querySelectorAll("a[href^='#']")];
  const byId = {};
  links.forEach((a) => (byId[a.getAttribute("href").slice(1)] = a));
  const sections = Object.keys(byId)
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!sections.length) return;

  const setActive = (id) => {
    links.forEach((a) => a.classList.remove("on"));
    if (byId[id]) byId[id].classList.add("on");
  };

  // Detection band: a thin strip ~96px below the sticky bars. Whichever section
  // most recently crossed downward through it is the active one.
  const visible = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      }
      // pick the section closest to the band, preferring ones above it
      let active = null, bestTop = -Infinity;
      for (const sec of sections) {
        const top = sec.getBoundingClientRect().top;
        if (top <= 140 && top > bestTop) { bestTop = top; active = sec.id; }
      }
      if (!active && visible.size) active = [...visible][0];
      if (!active) active = sections[0].id;
      setActive(active);
    },
    { rootMargin: "-90px 0px -75% 0px", threshold: [0, 1] }
  );
  sections.forEach((s) => io.observe(s));

  // also run once after layout settles (fonts, generated tables changing height)
  window.addEventListener("load", () => {
    let active = sections[0].id, bestTop = -Infinity;
    for (const sec of sections) {
      const top = sec.getBoundingClientRect().top;
      if (top <= 140 && top > bestTop) { bestTop = top; active = sec.id; }
    }
    setActive(active);
  });
})();
