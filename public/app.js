// Observation room. Streams a headless negotiation over server-sent events and
// renders the public record, with the private material in a researcher panel.

const $ = (id) => document.getElementById(id);
const state = { scenarios: [], current: null, running: false, source: null, seats: {}, terms: {} };

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
  $("scenarioStatus").textContent = s.status;
  $("runButton").disabled = s.placeholder || state.running;
  $("runButton").textContent = s.placeholder ? "Not yet written" : state.running ? "Running..." : "Run negotiation";

  state.seats = Object.fromEntries((s.seatList || []).map((x) => [x.id, x]));

  // Variants are per-pack. Repopulate whenever the scenario changes; a
  // placeholder pack has none, so the select ends up empty and disabled by
  // the runButton guard above.
  const variants = s.variants || [];
  $("variantSelect").innerHTML = variants.map((v) => `<option value="${v}">${v}${v === s.defaultVariant ? " (default)" : ""}</option>`).join("");
  if (s.defaultVariant) $("variantSelect").value = s.defaultVariant;

  const byParty = {};
  for (const seat of s.seatList || []) (byParty[seat.countryName] ||= []).push(seat);

  const groups = Object.entries(byParty);
  $("rosters").innerHTML = groups.length
    ? groups.map(([party, list]) => {
        const people = list.map((seat) =>
          `<div class="person" id="seat-${seat.id}"><div class="avatar">${initials(seat.label)}</div>` +
          `<div><strong>${seat.label}</strong><small>${seat.level}</small></div></div>`).join("");
        return `<section class="team"><div class="team-head"><span class="team-name">${party}</span></div>${people}</section>`;
      }).join("")
    : "<p class=\"system-message\">This scenario has no seats yet.</p>";
}

function addMessage({ seat, round, publicMessage, proposal, paneId = "dialogue", note }) {
  const box = $(paneId);
  if (box.querySelector(".system-message")) box.innerHTML = "";
  const node = $("messageTemplate").content.cloneNode(true);
  if (seat.country === "eu") node.querySelector("article").classList.add("ai");
  node.querySelector(".avatar").textContent = initials(seat.label);
  node.querySelector("strong").textContent = seat.label;
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
    const vol = p.trq_volume_tonnes != null ? `${Math.round(p.trq_volume_tonnes / 1000).toLocaleString()}kt` : "-";
    const rate = p.out_of_quota_rate_pct != null ? `${p.out_of_quota_rate_pct}%` : "-";
    const dur = p.duration_years != null ? `${p.duration_years}yr` : "-";
    const alloc = p.allocation != null ? p.allocation : "-";
    const st = p.status != null ? p.status : "-";
    return `<div><span>${label}</span><strong>${vol}</strong><small>${rate} - ${alloc} - ${dur} - ${st}</small></div>`;
  }).join("");
}

function startRun() {
  if (state.running || !state.current || state.current.placeholder) return;
  state.running = true;
  state.terms = {};
  $("dialogue").innerHTML = `<div class="system-message">Running ${state.current.label}. This takes several minutes.</div>`;
  $("consultEu").innerHTML = '<div class="system-message">—</div>';
  $("consultUk").innerHTML = '<div class="system-message">—</div>';
  $("divergenceBoard").innerHTML = '<p class="system-message">None yet</p>';
  state.divergence = [];
  $("agreementStatus").textContent = "Running";
  $("agreementDetail").textContent = "Settlement is decided by the end-of-round poll";
  $("pollBoard").innerHTML = "";
  $("runStatus").textContent = "pre-game declarations...";
  renderScenarioMeta();
  renderTerms();

  const arm = $("armSelect").value;
  const model = $("modelSelect").value;
  const variant = $("variantSelect").value;
  const source = new EventSource(
    `/api/run?scenario=${encodeURIComponent(state.current.id)}&arm=${encodeURIComponent(arm)}` +
      `&model=${encodeURIComponent(model)}&variant=${encodeURIComponent(variant)}`,
  );
  state.source = source;

  const finish = () => {
    source.close();
    state.running = false;
    state.source = null;
    document.querySelectorAll(".person.active").forEach((n) => n.classList.remove("active"));
    renderScenarioMeta();
  };

  source.addEventListener("pregame", (e) => {
    const d = JSON.parse(e.data);
    $("runStatus").textContent = `pre-game declaration: ${d.seat.label}`;
  });

  source.addEventListener("turn", (e) => {
    const d = JSON.parse(e.data);
    $("roundNumber").textContent = d.round;
    $("turnIndicator").innerHTML = `<span>Round ${d.round}</span><small>${d.seat.label}</small>`;
    $("runStatus").textContent = `round ${d.round}: ${d.seat.label}`;
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
    $("runStatus").textContent = `round ${d.round}: ${d.seat.label} reports`;
    const rec = d.recommendation ? `recommends ${d.recommendation.action}` : "no parseable recommendation";
    const asks = (d.requests || []).length ? `  |  ${d.requests.length} request(s)` : "";
    addMessage({
      seat: d.seat, round: d.round, publicMessage: d.text || "(no parseable report)",
      paneId: paneFor(d.country), note: rec + asks,
    });
  });

  source.addEventListener("instruct", (e) => {
    const d = JSON.parse(e.data);
    $("runStatus").textContent = `round ${d.round}: ${d.seat.label} instructs`;
    const auth = d.authority || {};
    const set = Object.entries(auth).filter(([k, v]) => k !== "notes" && v !== null && v !== undefined);
    addMessage({
      seat: d.seat, round: d.round, publicMessage: d.text || "(no parseable instruction)",
      paneId: paneFor(d.country),
      note: set.length ? "authority  " + set.map(([k, v]) => `${k}: ${v}`).join("   ") : "authority: none set",
    });
    if (!set.length) pushDivergence(d.round, "mandate_absent", `${d.country.toUpperCase()} set no authority`);
  });

  source.addEventListener("mandate_exceeded", (e) => {
    const d = JSON.parse(e.data);
    pushDivergence(d.round, "mandate_exceeded",
      `${d.seat.label}: ` + (d.breaches || []).map((b) => `${b.term} authorised ${b.authorised}, tabled ${b.tabled}`).join("; "));
  });

  source.addEventListener("divergence", (e) => {
    const d = JSON.parse(e.data);
    pushDivergence(d.round, d.kind, (d.country || "").toUpperCase());
  });

  source.addEventListener("round_end", (e) => {
    const d = JSON.parse(e.data);
    const total = (state.current.seatList || []).length;
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
    $("turnIndicator").innerHTML = `<span>Complete</span><small>${d.summary.turns} turns</small>`;
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

  // Models the machine actually holds a key for come first and are selectable;
  // the rest are shown but disabled, so a missing key is visible rather than a
  // failed run three minutes later.
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
    $("dialogue").innerHTML = "<div class=\"system-message\">Choose a scenario and press Run negotiation.</div>";
    $("pollBoard").innerHTML = "";
    $("agreementStatus").textContent = "-";
    state.terms = {};
    renderScenarioMeta();
    renderTerms();
  });

  $("runButton").addEventListener("click", startRun);
}

init();
