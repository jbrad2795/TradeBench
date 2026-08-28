// Human-seat demo. Same public-record view as the observation room
// (public/app.js), plus a form that appears whenever it's the seat you
// chose's turn. Talks only to /api/play/* (lib/play.js) - never touches
// /api/run or anything the batch pipeline depends on.

const $ = (id) => document.getElementById(id);
const state = { scenarios: [], current: null, running: false, source: null, seats: {}, terms: {}, runId: null, settlementTerms: [], statusValues: [] };

const initials = (label) =>
  label.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function showToast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 4000);
}

function renderScenarioMeta() {
  const s = state.current;
  if (!s) return;
  $("scenarioTitle").textContent = s.label;

  state.seats = Object.fromEntries((s.seatList || []).map((x) => [x.id, x]));
  state.settlementTerms = s.settlementTerms || [];
  state.statusValues = s.statusValues || ["opening", "counter", "accept", "reject", "none"];

  const variants = s.variants || [];
  $("variantSelect").innerHTML = variants.map((v) => `<option value="${v}">${v}${v === s.defaultVariant ? " (default)" : ""}</option>`).join("");
  if (s.defaultVariant) $("variantSelect").value = s.defaultVariant;

  const roundsVariants = s.roundsVariants || [];
  $("roundsSelect").innerHTML = roundsVariants.length
    ? roundsVariants.map((r) => `<option value="${r}">${r}${r === s.defaultRoundsVariant ? " (default)" : ""}</option>`).join("")
    : `<option value="">(pack default)</option>`;
  if (s.defaultRoundsVariant) $("roundsSelect").value = s.defaultRoundsVariant;

  $("seatSelect").innerHTML = (s.seatList || [])
    .map((seat) => `<option value="${seat.id}">${seat.label} (${seat.countryName} · ${seat.level})</option>`).join("");

  // Depends on seatSelect actually being populated above, so it comes after.
  $("runButton").disabled = s.placeholder || state.running || !$("seatSelect").value;
  $("runButton").textContent = s.placeholder ? "Not yet written" : state.running ? "In progress..." : "Take your seat";
  if (!state.running) {
    $("humanSeatLabel").textContent = state.seats[$("seatSelect").value]
      ? state.seats[$("seatSelect").value].label : "not yet chosen";
  }

  const byParty = {};
  for (const seat of s.seatList || []) (byParty[seat.countryName] ||= []).push(seat);
  const groups = Object.entries(byParty);
  $("rosters").innerHTML = groups.length
    ? groups.map(([party, list]) => {
        const people = list.map((seat) =>
          `<div class="person" id="seat-${seat.id}"><div class="avatar">${initials(seat.label)}</div>` +
          `<div><strong>${seat.label}${seat.id === $("seatSelect").value ? " (you)" : ""}</strong><small>${seat.level}</small></div></div>`).join("");
        return `<section class="team"><div class="team-head"><span class="team-name">${party}</span></div>${people}</section>`;
      }).join("")
    : "<p class=\"system-message\">This scenario has no seats yet.</p>";
}

function addMessage({ seat, round, publicMessage, proposal, paneId = "dialogue", note }) {
  const box = $(paneId);
  if (box.querySelector(".system-message")) box.innerHTML = "";
  const node = $("messageTemplate").content.cloneNode(true);
  const isHuman = seat.id === $("seatSelect").value;
  if (seat.country === "eu" && !isHuman) node.querySelector("article").classList.add("ai");
  node.querySelector(".avatar").textContent = isHuman ? "YOU" : initials(seat.label);
  node.querySelector("strong").textContent = seat.label + (isHuman ? " (you)" : "");
  node.querySelector(".message-meta span").textContent = seat.countryName || seat.country;
  node.querySelector("time").textContent = `Round ${round}`;
  node.querySelector("p").textContent = publicMessage;

  const line = document.createElement("p");
  line.className = "mono";
  line.textContent = note
    ? note
    : proposal
      ? Object.entries(proposal).filter(([k]) => k !== "other_terms").map(([k, v]) => `${k}: ${v}`).join("   ")
      : "no parseable proposal";
  node.querySelector(".rationale div").append(line);

  box.append(node);
  box.scrollTop = box.scrollHeight;
}

/** Scenario-agnostic - reads whichever fields this pack's settlementTerms declares. */
function renderTerms() {
  const rows = Object.entries(state.terms);
  if (!rows.length) {
    $("termsBoard").innerHTML = "<div><span>Tabled terms</span><strong>-</strong><small>Nothing tabled yet</small></div>";
    return;
  }
  $("termsBoard").innerHTML = rows.map(([seatId, p]) => {
    const seat = state.seats[seatId];
    const label = seat ? seat.label : seatId;
    if (!p) return `<div><span>${label}</span><strong>-</strong><small>no parseable proposal</small></div>`;
    const headline = state.settlementTerms.find((t) => t.type === "number");
    const strong = headline && p[headline.key] != null ? Number(p[headline.key]).toLocaleString() : "-";
    const rest = state.settlementTerms.filter((t) => t !== headline).map((t) => `${t.key}: ${p[t.key] ?? "-"}`).join("  ·  ");
    return `<div><span>${label}</span><strong>${strong}</strong><small>${p.status || ""}  ${rest}</small></div>`;
  }).join("");
}

// --- the human-turn form ----------------------------------------------------

function termFieldHtml(t, prefix) {
  const id = `${prefix}_${t.key}`;
  if (t.type === "number") {
    return `<div class="term-field"><label for="${id}">${t.key}</label><input type="number" id="${id}" step="any" placeholder="unset"></div>`;
  }
  if (t.type === "boolean") {
    return `<div class="term-field"><label for="${id}">${t.key}</label>` +
      `<select id="${id}"><option value="">unset</option><option value="true">true</option><option value="false">false</option></select></div>`;
  }
  // enum
  const opts = ["", ...(t.values || [])].map((v) => `<option value="${v}">${v || "unset"}</option>`).join("");
  return `<div class="term-field"><label for="${id}">${t.key}</label><select id="${id}">${opts}</select></div>`;
}

function readTermFields(prefix) {
  const out = {};
  for (const t of state.settlementTerms) {
    const el = document.getElementById(`${prefix}_${t.key}`);
    if (!el) continue;
    const raw = el.value;
    if (raw === "") { out[t.key] = null; continue; }
    out[t.key] = t.type === "number" ? Number(raw) : t.type === "boolean" ? raw === "true" : raw;
  }
  return out;
}

const otherTermsHtml = (id) =>
  `<div class="field-group"><label for="${id}">Other terms (one per line, optional)</label><textarea id="${id}" rows="2"></textarea></div>`;
const readLines = (id) => (document.getElementById(id).value || "").split("\n").map((s) => s.trim()).filter(Boolean);

const FORM_BUILDERS = {
  declaration: {
    render: () => `
      <div class="field-group"><label for="f_objectives">Objectives (one per line)</label><textarea id="f_objectives" rows="3" required></textarea></div>
      <div class="field-group"><label for="f_success">How will you know this went well or badly?</label><textarea id="f_success" rows="2" required></textarea></div>
      <div class="field-group"><label for="f_approach">Your intended approach, and why</label><textarea id="f_approach" rows="2" required></textarea></div>`,
    collect: () => ({
      objectives: readLines("f_objectives"),
      success_and_failure: $("f_success").value,
      approach: $("f_approach").value,
      parties: [],
    }),
  },
  turn: {
    render: () => `
      <div class="field-group"><label for="f_public">What you say at the table (shown to the other Geneva seat)</label><textarea id="f_public" rows="3" required></textarea></div>
      <div class="section-label">Proposal</div>
      <div class="term-grid">
        <div class="term-field"><label for="f_status">status</label><select id="f_status">${state.statusValues.map((v) => `<option value="${v}">${v}</option>`).join("")}</select></div>
        ${state.settlementTerms.map((t) => termFieldHtml(t, "prop")).join("")}
      </div>
      ${otherTermsHtml("f_other")}
      <div class="field-group"><label for="f_rationale">Private rationale (not shown to anyone)</label><textarea id="f_rationale" rows="2"></textarea></div>`,
    collect: () => ({
      public_message: $("f_public").value,
      proposal: { status: $("f_status").value, ...readTermFields("prop"), other_terms: readLines("f_other") },
      expectations: [],
      private_rationale: $("f_rationale").value,
    }),
  },
  report: {
    render: () => `
      <div class="field-group"><label for="f_report">Report to your capital colleague</label><textarea id="f_report" rows="3" required></textarea></div>
      <div class="section-label">Recommendation</div>
      <div class="term-grid">
        <div class="term-field"><label for="f_action">action</label><select id="f_action"><option value="accept">accept</option><option value="continue" selected>continue</option><option value="walk_away">walk_away</option></select></div>
        ${state.settlementTerms.map((t) => termFieldHtml(t, "ref")).join("")}
      </div>
      <div class="field-group"><label for="f_recreason">Reasoning</label><textarea id="f_recreason" rows="2" required></textarea></div>
      <div class="field-group"><label for="f_rationale">Private rationale (not shown to anyone)</label><textarea id="f_rationale" rows="2"></textarea></div>`,
    collect: () => ({
      report: $("f_report").value,
      recommendation: { action: $("f_action").value, terms_referred: readTermFields("ref"), reasoning: $("f_recreason").value },
      requests: [],
      private_rationale: $("f_rationale").value,
    }),
  },
  instruct: {
    render: () => `
      <div class="field-group"><label for="f_instruction">Instruct your colleague at the table</label><textarea id="f_instruction" rows="3" required></textarea></div>
      <div class="section-label">Authority (leave a field unset to not constrain it)</div>
      <div class="term-grid">${state.settlementTerms.map((t) => termFieldHtml(t, "auth")).join("")}</div>
      <div class="field-group"><label for="f_notes">Authority notes (conditions in prose, optional)</label><textarea id="f_notes" rows="2"></textarea></div>
      <div class="field-group"><label for="f_rationale">Private rationale (not shown to anyone)</label><textarea id="f_rationale" rows="2"></textarea></div>`,
    collect: () => ({
      instruction: $("f_instruction").value,
      authority: { ...readTermFields("auth"), notes: $("f_notes").value || null },
      response_to_requests: [],
      private_rationale: $("f_rationale").value,
    }),
  },
  poll: {
    render: () => `
      <div class="term-grid"><div class="term-field"><label for="f_decision">decision</label>
        <select id="f_decision"><option value="accept_deal">accept_deal</option><option value="accept_default">accept_default</option><option value="continue" selected>continue</option></select></div></div>
      <div class="section-label">Terms decided (what you're deciding on)</div>
      <div class="term-grid">${state.settlementTerms.map((t) => termFieldHtml(t, "dec")).join("")}</div>
      <div class="field-group"><label for="f_reasoning">Reasoning</label><textarea id="f_reasoning" rows="2" required></textarea></div>`,
    collect: () => ({ decision: $("f_decision").value, terms_decided: readTermFields("dec"), reasoning: $("f_reasoning").value }),
  },
};

const KIND_LABEL = {
  declaration: "Pre-game declaration",
  turn: "Your turn at the table",
  report: "Report to your capital",
  instruct: "Instruct your colleague at the table",
  poll: "Decide: accept or continue?",
};

function showHumanTurn(detail) {
  $("aiWait").hidden = true;
  $("turnKindLabel").innerHTML = `<span class="your-turn-banner">${KIND_LABEL[detail.kind] || "Your turn"}</span>`;
  $("humanFormHint").textContent = detail.note || "";
  const builder = FORM_BUILDERS[detail.kind];
  $("humanFormFields").innerHTML = builder ? builder.render() : "<p>Unrecognised turn kind.</p>";
  $("humanForm").hidden = false;
  $("humanForm").dataset.kind = detail.kind;
  $("runStatus").textContent = `waiting on you: ${KIND_LABEL[detail.kind] || detail.kind}`;
  $("humanForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function submitHumanTurn(e) {
  e.preventDefault();
  const kind = $("humanForm").dataset.kind;
  const builder = FORM_BUILDERS[kind];
  if (!builder || !state.runId) return;
  $("submitTurnButton").disabled = true;
  try {
    const answer = builder.collect();
    const res = await fetch(`/api/play/${encodeURIComponent(state.runId)}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answer),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `submit failed (${res.status})`);
    }
    $("humanForm").hidden = true;
    $("aiWait").hidden = false;
    $("aiWaitLabel").textContent = "Waiting on the other seats";
    $("runStatus").textContent = "submitted - waiting on the other seats";
  } catch (error) {
    showToast(error.message);
  } finally {
    $("submitTurnButton").disabled = false;
  }
}

// --- run lifecycle -----------------------------------------------------------

function startPlay() {
  const humanSeatId = $("seatSelect").value;
  if (state.running || !state.current || state.current.placeholder || !humanSeatId) return;
  state.running = true;
  state.terms = {};
  state.runId = null;
  $("dialogue").innerHTML = `<div class="system-message">Running ${state.current.label}. This takes several minutes per turn.</div>`;
  $("consultEu").innerHTML = '<div class="system-message">—</div>';
  $("consultUk").innerHTML = '<div class="system-message">—</div>';
  $("divergenceBoard").innerHTML = '<p class="system-message">None yet</p>';
  state.divergence = [];
  $("agreementStatus").textContent = "Running";
  $("agreementDetail").textContent = "Settlement is decided by the end-of-round poll";
  $("pollBoard").innerHTML = "";
  $("runStatus").textContent = "starting...";
  $("humanSeatLabel").textContent = state.seats[humanSeatId] ? state.seats[humanSeatId].label : humanSeatId;
  $("humanForm").hidden = true;
  $("aiWait").hidden = false;
  $("aiWaitLabel").textContent = "Getting under way";
  renderScenarioMeta();
  renderTerms();

  const arm = $("armSelect").value;
  const model = $("modelSelect").value;
  const variant = $("variantSelect").value;
  const roundsVariant = $("roundsSelect").value;
  const params = new URLSearchParams({ scenario: state.current.id, arm, model, variant, seat: humanSeatId });
  if (roundsVariant) params.set("roundsVariant", roundsVariant);
  const source = new EventSource(`/api/play/run?${params.toString()}`);
  state.source = source;

  const finish = () => {
    source.close();
    state.running = false;
    state.source = null;
    state.runId = null;
    $("humanForm").hidden = true;
    $("aiWait").hidden = true;
    document.querySelectorAll(".person.active").forEach((n) => n.classList.remove("active"));
    renderScenarioMeta();
  };

  source.addEventListener("run_id", (e) => { state.runId = JSON.parse(e.data).runId; });

  source.addEventListener("human_turn", (e) => showHumanTurn(JSON.parse(e.data)));

  source.addEventListener("pregame", (e) => {
    const d = JSON.parse(e.data);
    if (d.seat.id !== humanSeatId) $("runStatus").textContent = `pre-game declaration: ${d.seat.label}`;
  });

  source.addEventListener("turn", (e) => {
    const d = JSON.parse(e.data);
    $("roundNumber").textContent = d.round;
    $("turnIndicator").innerHTML = `<span>Round ${d.round}</span><small>${d.seat.label}</small>`;
    document.querySelectorAll(".person.active").forEach((n) => n.classList.remove("active"));
    const row = document.getElementById(`seat-${d.seat.id}`);
    if (row) row.classList.add("active");
    state.terms[d.seat.id] = d.proposal;
    addMessage(d);
    renderTerms();
  });

  const paneFor = (country) => (country === "eu" ? "consultEu" : "consultUk");

  const pushDivergence = (round, kind, detail) => {
    state.divergence = state.divergence || [];
    state.divergence.push({ round, kind, detail });
    $("divergenceBoard").innerHTML = state.divergence
      .map((d) => `<div class="ev"><code>${d.kind}</code> · round ${d.round}<small>${d.detail || ""}</small></div>`)
      .join("");
  };

  source.addEventListener("report", (e) => {
    const d = JSON.parse(e.data);
    const rec = d.recommendation ? `recommends ${d.recommendation.action}` : "no parseable recommendation";
    const asks = (d.requests || []).length ? `  |  ${d.requests.length} request(s)` : "";
    addMessage({ seat: d.seat, round: d.round, publicMessage: d.text || "(no parseable report)", paneId: paneFor(d.country), note: rec + asks });
  });

  source.addEventListener("instruct", (e) => {
    const d = JSON.parse(e.data);
    const auth = d.authority || {};
    const set = Object.entries(auth).filter(([k, v]) => k !== "notes" && v !== null && v !== undefined);
    addMessage({
      seat: d.seat, round: d.round, publicMessage: d.text || "(no parseable instruction)", paneId: paneFor(d.country),
      note: set.length ? "authority  " + set.map(([k, v]) => `${k}: ${v}`).join("   ") : "authority: none set",
    });
    if (!set.length) pushDivergence(d.round, "mandate_absent", `${d.country.toUpperCase()} set no authority`);
  });

  source.addEventListener("mandate_exceeded", (e) => {
    const d = JSON.parse(e.data);
    pushDivergence(d.round, "mandate_exceeded",
      `${d.seat.label}: ` + (d.breaches || []).map((b) => `${b.term} authorised ${b.authorised}, tabled ${b.tabled}`).join("; "));
  });

  source.addEventListener("package_incoherent", (e) => {
    const d = JSON.parse(e.data);
    pushDivergence(d.round, "package_incoherent",
      (d.reasons || []).map((r) => `${r.part} (${r.partValue}) exceeds ${r.whole} (${r.wholeValue})`).join("; "));
  });

  source.addEventListener("divergence", (e) => {
    const d = JSON.parse(e.data);
    pushDivergence(d.round, d.kind, (d.country || "").toUpperCase());
  });

  source.addEventListener("round_end", (e) => {
    const d = JSON.parse(e.data);
    const total = (state.current.seatList || []).filter((s) => s.level === "capital").length;
    const accepted = d.acceptCount != null ? d.acceptCount : 0;
    const note = d.settled ? "Settled" : (d.reason || "");
    $("pollBoard").innerHTML =
      `<div class="round-progress"><div><span>Round ${d.round} poll</span><b>${accepted} of ${total} accepted</b></div>` +
      `<p class="poll-reason">${note}</p></div>`;
  });

  source.addEventListener("done", (e) => {
    const d = JSON.parse(e.data);
    const t = d.summary.terminal;
    $("agreementStatus").textContent = t === "settled" ? "Settled" : t.replace(/_/g, " ");
    $("agreementDetail").textContent = d.summary.settlement
      ? Object.entries(d.summary.settlement).map(([k, v]) => `${k}: ${v}`).join(" / ")
      : "No settlement reached";
    $("runStatus").textContent = `run log: ${d.runId}`;
    $("turnIndicator").innerHTML = `<span>Complete</span><small>${d.summary.turns || d.summary.tableTurns} turns</small>`;
    finish();
  });

  source.addEventListener("failed", (e) => {
    const d = JSON.parse(e.data);
    showToast(d.message);
    $("runStatus").textContent = `failed: ${d.message}`;
    $("agreementStatus").textContent = "Failed";
    finish();
  });

  source.onerror = () => {
    if (state.running) {
      showToast("Lost connection to the run");
      finish();
    }
  };
}

async function init() {
  try {
    const status = await (await fetch("/api/status")).json();
    $("connectionLabel").textContent = status.live ? `Live - ${status.model}` : "Offline - stub responses";
  } catch {
    $("connectionLabel").textContent = "Offline";
  }

  const models = (await (await fetch("/api/models")).json()).models;
  $("modelSelect").innerHTML = models
    .map((m) => `<option value="${m.spec}"${m.ready ? "" : " disabled"}>${m.label} - ${m.provider}${m.ready ? "" : " (no key)"}</option>`)
    .join("");
  const firstReady = models.find((m) => m.ready);
  if (firstReady) $("modelSelect").value = firstReady.spec;

  const arms = (await (await fetch("/api/arms")).json()).arms;
  $("armSelect").innerHTML = arms.map((a) => `<option value="${a.key}" title="${a.description}">${a.label}</option>`).join("");
  $("armSelect").value = "control";

  const listing = await (await fetch("/api/scenarios")).json();
  state.scenarios = listing.scenarios;
  $("scenarioSelect").innerHTML = state.scenarios.map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
  state.current = state.scenarios[0];
  renderScenarioMeta();
  renderTerms();

  $("scenarioSelect").addEventListener("change", (e) => {
    state.current = state.scenarios.find((s) => s.id === e.target.value);
    $("dialogue").innerHTML = "<div class=\"system-message\">Choose your seat and press Take your seat.</div>";
    $("pollBoard").innerHTML = "";
    $("agreementStatus").textContent = "-";
    state.terms = {};
    renderScenarioMeta();
    renderTerms();
  });

  $("seatSelect").addEventListener("change", renderScenarioMeta);
  $("runButton").addEventListener("click", startPlay);
  $("humanForm").addEventListener("submit", submitHumanTurn);
}

init();
