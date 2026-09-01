/* Draft mode. Append ?edit to any page (index.html?edit, evidence.html?edit, ...)
 * to turn every piece of visible text into an editable block.
 *
 * This script NEVER writes to any file. Edits live in localStorage until you
 * press Download, which produces a drafts.json for Claude to merge into the
 * source by hand. That is the whole safety story: the page cannot mangle the
 * source, because it has no way to reach it.
 *
 * NOT editable: the top nav and section sub-nav (structural), and anything
 * app.js generates from the run logs - the scoreboard, the figures, the
 * limitations list, the parameters strip, the settled-note, the citation, and
 * the inline figures inside the findings/methods prose. Editing a generated
 * value would be pointless: the next page load rewrites it from the data.
 */
(function () {
  "use strict";
  if (!/[?&]edit\b/.test(location.search)) return;

  // Keyed per page: localStorage is shared across the origin, and nth-child
  // paths are page-relative, so an unkeyed store would collide between pages.
  const PAGE = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const KEY = "tb-drafts-v1:" + PAGE;

  // Containers whose contents app.js writes. Locked.
  const GENERATED = [
    "params", "scoreboard", "figures", "limits", "cite", "parity",
    "settled-footnote", "downloads", "sample-note",
    "f1-figs", "f2-figs", "f3-figs", "f4-figs", "f5-overrides",
    "test-count", "m-alpha", "m-passes", "m-disagree",
  ];
  const genRoots = GENERATED.map((id) => document.getElementById(id)).filter(Boolean);
  const insideGenerated = (n) => genRoots.some((g) => g === n || g.contains(n));

  // Keep draft mode across navigation: ?edit does not survive a page load, so
  // every internal link to another .html page gets it appended. Without this,
  // clicking "Evidence" from index.html?edit lands on a non-editable page.
  document.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || /^(https?:|mailto:|#)/.test(href)) return;
    if (!/\.html($|[#?])/.test(href) || /[?&]edit/.test(href)) return;
    const hashAt = href.indexOf("#");
    const hash = hashAt >= 0 ? href.slice(hashAt) : "";
    const base = hashAt >= 0 ? href.slice(0, hashAt) : href;
    a.setAttribute("href", base + (base.includes("?") ? "&" : "?") + "edit" + hash);
  });

  // A stable-enough address for a node: nth-child path from body.
  function pathOf(n) {
    const parts = [];
    while (n && n !== document.body) {
      const p = n.parentNode;
      if (!p) break;
      parts.unshift(n.tagName.toLowerCase() + ":nth-child(" + ([...p.children].indexOf(n) + 1) + ")");
      n = p;
    }
    return parts.join(">");
  }

  // "All the text, as far as possible." Walk every element under <main> and
  // <footer> and make the ones that directly own visible text editable. The
  // exclusions are the structural furniture (nav, sub-nav, the edit bar itself,
  // controls) and anything app.js generates - editing a generated value here is
  // futile because the next page load overwrites it from the run logs.
  const ROOTS = ["main", "footer"].map((s) => document.querySelector(s)).filter(Boolean);

  const NON_TEXT_TAG = new Set([
    "SCRIPT", "STYLE", "TEMPLATE", "SVG", "PATH", "BUTTON", "SELECT", "OPTION",
    "INPUT", "TEXTAREA", "IMG", "BR", "HR", "PRE",
  ]);
  const skipContainer = (n) =>
    insideGenerated(n) ||
    n.closest(".topbar, .subnav, #tb-editbar, .replay-controls, #replay, #replay-caption, #downloads, nav");

  // does this element have a direct (not descendant) non-whitespace text node?
  const ownsText = (n) =>
    [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());

  const blocks = [];
  for (const root of ROOTS) {
    root.querySelectorAll("*").forEach((n) => {
      if (NON_TEXT_TAG.has(n.tagName)) return;
      if (n.tagName === "A") return;            // links are navigation, not prose
      if (skipContainer(n)) return;
      if (!ownsText(n)) return;
      // querySelectorAll is document order, so any ancestor block is already in.
      if (blocks.some((b) => b.node.contains(n))) return;
      blocks.push({ node: n, path: pathOf(n) });
    });
  }

  // Generated values sitting *inside* an editable block stay atomic, so typing
  // around them cannot swallow or duplicate a figure. This mutates innerHTML,
  // so the "original" snapshot must be taken AFTER it - otherwise every block
  // containing a locked value reads as edited on a fresh load.
  blocks.forEach((b) => {
    b.node.querySelectorAll("[id]").forEach((c) => {
      if (GENERATED.includes(c.id)) { c.contentEditable = "false"; c.classList.add("gen-lock"); }
    });
    b.node.contentEditable = "true";
    b.node.spellcheck = true;
    b.node.classList.add("editable");
    b.original = b.node.innerHTML;
  });

  // ── persistence ──────────────────────────────────────────────────────────
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { flash("Could not save - storage blocked", true); } };

  let store = load();
  blocks.forEach((b) => { if (store[b.path] != null) b.node.innerHTML = store[b.path]; });

  const changed = () => blocks.filter((b) => b.node.innerHTML.trim() !== b.original.trim());

  // Where a block lives, for the merge. Falls back through id -> class -> the
  // nearest heading, so an edit is never mislabelled as belonging to the footer.
  function sectionLabel(n) {
    const sec = n.closest("section");
    if (!sec) return n.closest("footer") ? "footer" : "page";
    if (sec.id) return sec.id;
    if (sec.className) return sec.className.split(" ")[0];
    const h = sec.querySelector("h1, h2");
    return h ? h.textContent.trim().slice(0, 40) : "section";
  }

  let t;
  document.addEventListener("input", (e) => {
    const b = blocks.find((x) => x.node === e.target || x.node.contains(e.target));
    if (!b) return;
    clearTimeout(t);
    t = setTimeout(() => {
      store[b.path] = b.node.innerHTML;
      save(store);
      count();
    }, 350);
  });

  // ── panel ────────────────────────────────────────────────────────────────
  const bar = document.createElement("div");
  bar.id = "tb-editbar";
  bar.innerHTML =
    '<b>Draft mode</b><span id="tb-count"></span>' +
    '<button id="tb-dl">Download drafts</button>' +
    '<button id="tb-reset" class="ghost">Reset all</button>' +
    '<a class="ghost" href="' + location.pathname + '">Exit</a>';
  document.body.appendChild(bar);

  const count = () => {
    const n = changed().length;
    document.getElementById("tb-count").textContent =
      n ? `${n} block${n === 1 ? "" : "s"} edited · saved` : "no edits yet";
    document.getElementById("tb-dl").disabled = !n;
  };

  function flash(msg, bad) {
    const f = document.createElement("div");
    f.className = "tb-flash" + (bad ? " bad" : "");
    f.textContent = msg;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 3200);
  }

  document.getElementById("tb-dl").addEventListener("click", () => {
    const out = {
      generated: new Date().toISOString(),
      page: location.pathname.split("/").pop() || "index.html",
      note: "Edited blocks only. originalHTML is the exact string to find in the source; newHTML replaces it.",
      edits: changed().map((b) => ({
        path: b.path,
        section: sectionLabel(b.node),
        originalHTML: b.original,
        newHTML: b.node.innerHTML,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "drafts.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash("drafts.json downloaded - hand it to Claude to merge");
  });

  document.getElementById("tb-reset").addEventListener("click", () => {
    if (!confirm("Discard every edit and restore the original text?")) return;
    blocks.forEach((b) => { b.node.innerHTML = b.original; });
    store = {};
    save(store);
    count();
    flash("Reset to original");
  });

  count();
  flash(blocks.length + " text blocks editable. Nav and generated numbers are locked.");
})();
