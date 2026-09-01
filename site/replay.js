/* Observation room - replays one recorded run from window.TB_REPLAY.
   Static data on a timer. No API call, no key, no cost, no abuse surface.
   The point it exists to demonstrate: the two consultation rooms never see
   each other, and you can watch that stay true for the whole run. */

(function () {
  "use strict";

  const D = window.TB_REPLAY;
  const root = document.getElementById("replay");
  if (!D || !root) {
    if (root) root.innerHTML = '<p class="empty">replay.js not found - run <code>node site/build-results.mjs</code>.</p>';
    return;
  }

  const SEAT = Object.fromEntries(D.seats.map((s) => [s.id, s]));
  const el = (t, a, h) => {
    const n = document.createElement(t);
    if (a) for (const k in a) n.setAttribute(k, a[k]);
    if (h != null) n.innerHTML = h;
    return n;
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const num = (v) => (typeof v === "number" ? v.toLocaleString("en-GB") : v === true ? "yes" : v === false ? "no" : v);
  const TERM_LABEL = (t) => t.replace(/_/g, " ").replace(/\bpct\b/, "%").replace(/\btonnes\b/, "(t)");

  // ─────────────────────────────────────────────────────────────── layout ───

  root.innerHTML = `
    <div class="replay-controls">
      <button id="rp-play">► Play</button>
      <button id="rp-step" class="ghost">Step ›</button>
      <button id="rp-reset" class="ghost">Reset</button>
      <label for="rp-speed">Speed</label>
      <select id="rp-speed">
        <option value="1400">Slow</option>
        <option value="750" selected>Normal</option>
        <option value="300">Fast</option>
        <option value="0">Instant</option>
      </select>
      <label>Jump to round</label>
      <div class="rounds" id="rp-rounds"></div>
      <span class="replay-progress" id="rp-progress"></span>
    </div>

    <div class="replay-grid">
      <div>
        <section class="chan-panel">
          <h3><span class="ch-badge table">Table</span> The public record - the only thing either delegation sees of the other</h3>
          <div class="feed" id="feed-table"><p class="empty">Press play.</p></div>
        </section>

        <div class="rooms-2">
          <section class="chan-panel">
            <h3><span class="ch-badge eu">EU room</span> Brussels ↔ Geneva <span class="sealed">sealed from the UK</span></h3>
            <div class="feed short" id="feed-eu"><p class="empty">Nothing yet</p></div>
          </section>
          <section class="chan-panel">
            <h3><span class="ch-badge uk">UK room</span> London ↔ Geneva <span class="sealed">sealed from the EU</span></h3>
            <div class="feed short" id="feed-uk"><p class="empty">Nothing yet</p></div>
          </section>
        </div>
      </div>

      <aside class="side">
        <section class="chan-panel">
          <h3>Outcome</h3>
          <div class="body">
            <p class="outcome none" id="rp-outcome">In progress</p>
            <div id="rp-terms"></div>
          </div>
        </section>
        <section class="chan-panel">
          <h3>Divergence</h3>
          <div class="body"><div id="rp-diverge"><p class="empty">None yet</p></div></div>
        </section>
      </aside>
    </div>`;

  const feeds = {
    table: document.getElementById("feed-table"),
    "consult:eu": document.getElementById("feed-eu"),
    "consult:uk": document.getElementById("feed-uk"),
  };
  const $ = (id) => document.getElementById(id);

  // ───────────────────────────────────────────────────────── event render ───

  function msg(seatId, round, kicker, body, extra) {
    const s = SEAT[seatId] || { label: seatId, level: "" };
    const m = el("div", { class: "msg" });
    m.innerHTML =
      `<div class="msg-meta"><span class="seat">${esc(s.label)}</span>` +
      `<span class="role">${esc(s.level)}</span>` +
      `<span class="rd">round ${round}</span></div>` +
      (kicker ? `<div class="kicker">${esc(kicker)}</div>` : "") +
      `<p>${esc(body)}</p>` +
      (extra ? `<details><summary>${esc(extra.label)}</summary><p>${esc(extra.text)}</p></details>` : "");
    return m;
  }

  function push(channel, node) {
    const f = feeds[channel];
    if (!f) return;
    const empty = f.querySelector(".empty");
    if (empty) empty.remove();
    f.appendChild(node);
    f.scrollTop = f.scrollHeight;
  }

  const diverge = [];
  function addDiverge(html, sub) {
    diverge.push({ html, sub });
    const box = $("rp-diverge");
    box.innerHTML = diverge
      .map((d) => `<div class="ev">${d.html}${d.sub ? `<small>${d.sub}</small>` : ""}</div>`)
      .join("");
  }

  function showTerms(terms, heading) {
    const box = $("rp-terms");
    if (!terms) { box.innerHTML = ""; return; }
    box.innerHTML =
      (heading ? `<div class="kicker" style="margin:.6rem 0 .3rem">${esc(heading)}</div>` : "") +
      D.meta.settlementTerms
        .filter((t) => terms[t] !== null && terms[t] !== undefined)
        .map((t) => `<div class="term"><span>${esc(TERM_LABEL(t))}</span><b>${esc(num(terms[t]))}</b></div>`)
        .join("");
  }

  // Apply one event to the DOM. Pure function of the event - so replaying the
  // first N events from a clean slate always gives the same picture, which is
  // what makes the round scrubber correct rather than approximate.
  function apply(e) {
    switch (e.type) {
      case "table_turn":
        push("table", msg(e.seatId, e.round, null, e.public_message,
          e.private_rationale ? { label: "Private rationale - not seen by anyone at the table", text: e.private_rationale } : null));
        break;

      case "post_report":
        push(e.channel, msg(e.seatId, e.round, "Reports to capital", e.report,
          e.recommendation ? { label: "Recommendation", text: e.recommendation } : null));
        break;

      case "capital_instruction": {
        const a = e.authority || {};
        const set = Object.entries(a).filter(([, v]) => v !== null && v !== undefined);
        push(e.channel, msg(e.seatId, e.round, "Instructs the post", e.instruction,
          set.length ? { label: `Authority envelope (${set.length} term${set.length === 1 ? "" : "s"} bounded)`,
                         text: set.map(([k, v]) => `${TERM_LABEL(k)}: ${num(v)}`).join("  ·  ") } : null));
        break;
      }

      case "release_refused":
        addDiverge(`<code>release_refused</code> - ${esc(SEAT[e.seatId]?.label || e.seatId)} refused ${e.count} ask${e.count === 1 ? "" : "s"}`,
          `round ${e.round}`);
        break;

      case "mandate_exceeded":
        addDiverge(`<code>mandate_exceeded</code> - ${esc(SEAT[e.seatId]?.label || e.seatId)} tabled outside its capital's stated figure`,
          `round ${e.round} · ` + (e.breaches || []).map((b) => `${TERM_LABEL(b.term)}: authorised ${num(b.authorised)}, tabled ${num(b.tabled)}`).join(" · "));
        break;

      case "acceptance":
        if (e.decision !== "continue") {
          addDiverge(`<code>${esc(e.decision)}</code> - ${esc(SEAT[e.seatId]?.label || e.seatId)}`, `round ${e.round}`);
        }
        break;

      case "round_end":
        if (e.settled) {
          $("rp-outcome").textContent = "Settled";
          $("rp-outcome").className = "outcome";
          showTerms(e.terms, "Agreed terms");
        }
        break;

      case "judge_reconciliation":
        addDiverge(
          `<code>judge_reconciliation</code> - ${e.rescued ? "rescued" : "did not rescue"} the round-${e.round} poll`,
          e.mechanicalReason ? `mechanical read: ${esc(e.mechanicalReason)}` : "");
        if (e.rescued && e.reconciledTerms) {
          $("rp-outcome").textContent = "Settled";
          $("rp-outcome").className = "outcome";
          showTerms(e.reconciledTerms, "Reconciled terms");
        }
        break;
    }
  }

  // ───────────────────────────────────────────────────────────── playback ───

  let i = 0, timer = null, playing = false;
  const speed = () => Number($("rp-speed").value);
  const roundOf = (e) => e.round || 1;

  function reset() {
    stop();
    i = 0;
    for (const f of Object.values(feeds)) f.innerHTML = '<p class="empty">Nothing yet</p>';
    feeds.table.innerHTML = '<p class="empty">Press play.</p>';
    diverge.length = 0;
    $("rp-diverge").innerHTML = '<p class="empty">None yet</p>';
    $("rp-outcome").textContent = "In progress";
    $("rp-outcome").className = "outcome none";
    showTerms(null);
    render();
  }

  function step() {
    if (i >= D.events.length) { stop(); return false; }
    apply(D.events[i++]);
    render();
    return true;
  }

  function render() {
    const last = D.events[Math.max(0, i - 1)];
    const r = i ? roundOf(last) : 0;
    $("rp-progress").textContent = `event ${i} of ${D.events.length}${r ? ` · round ${r} of ${D.meta.rounds}` : ""}`;
    [...$("rp-rounds").children].forEach((b, n) => b.classList.toggle("on", n + 1 === r));
    $("rp-step").disabled = i >= D.events.length;
    $("rp-play").textContent = playing ? "❚❚ Pause" : i >= D.events.length ? "► Replay" : "► Play";
  }

  function tick() {
    if (!step()) return;
    if (playing) timer = setTimeout(tick, Math.max(60, speed()));
  }

  function play() {
    if (i >= D.events.length) reset();
    playing = true;
    if (speed() === 0) { while (step()) {} stop(); return; }
    render();
    tick();
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    timer = null;
    render();
  }

  // Jumping is a clean re-application from event 0, never a partial rewind.
  function jumpToRound(r) {
    stop();
    i = 0;
    for (const f of Object.values(feeds)) f.innerHTML = "";
    diverge.length = 0;
    $("rp-diverge").innerHTML = "";
    $("rp-outcome").textContent = "In progress";
    $("rp-outcome").className = "outcome none";
    showTerms(null);
    while (i < D.events.length && roundOf(D.events[i]) <= r) apply(D.events[i++]);
    for (const f of Object.values(feeds)) if (!f.children.length) f.innerHTML = '<p class="empty">Nothing yet</p>';
    if (!diverge.length) $("rp-diverge").innerHTML = '<p class="empty">None yet</p>';
    render();
  }

  $("rp-rounds").innerHTML = Array.from({ length: D.meta.rounds }, (_, n) =>
    `<button data-r="${n + 1}">${n + 1}</button>`).join("");
  $("rp-rounds").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b) jumpToRound(Number(b.dataset.r));
  });
  $("rp-play").addEventListener("click", () => (playing ? stop() : play()));
  $("rp-step").addEventListener("click", () => { stop(); step(); });
  $("rp-reset").addEventListener("click", reset);

  // Caption the run being replayed, from its own manifest.
  const cap = document.getElementById("replay-caption");
  if (cap) {
    cap.innerHTML =
      `Replaying <code>${esc(D.meta.arm)} / rep2</code> - ${esc(D.meta.label)}, ` +
      `${esc(D.meta.variant)} variant, ${D.meta.rounds} rounds, ${esc(D.meta.model)}. ` +
      `${D.events.length} events. Outcome: <b>${esc(D.meta.terminal)}</b>. ` +
      `Chosen because it shows the whole arc - a mandate breach at round 2, refusals on both ` +
      `sides, and a poll that closes only after the reconciliation judge rules the two ` +
      `capitals accepted the same package.`;
  }

  render();
})();
