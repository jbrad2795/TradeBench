const scenario = {
  title: "Steel Safeguards Consultation",
  maxRounds: 3,
  maxUtterancesPerCountry: 3,
  publicCase: "The European Union has proposed new safeguards on steel imports. The UK and EU are meeting to seek a joint package across tariff levels, sectoral compensation, review timing, and enforcement. Any outcome requires explicit acceptance by both countries.",
  countries: [
    { id: "uk", name: "United Kingdom", human: true, roles: [
      { id: "uk-amb", name: "Alex Morgan", title: "UK Ambassador to the EU", initials: "AM", privateBrief: "Protect the wider UK–EU relationship. Secure a credible tariff reduction, avoid escalation, and preserve room for a politically defensible compromise." },
      { id: "uk-steel", name: "Priya Shah", title: "Deputy Director for Steel", initials: "PS", privateBrief: "Limit immediate harm to UK steel exporters. Prioritise a low tariff, prompt relief, and enforceable safeguards against sudden quota restrictions." }
    ]},
    { id: "eu", name: "European Union", human: false, roles: [
      { id: "eu-trade", name: "Elena Varga", title: "Trade Commissioner", initials: "EV", country: "European Union", privateBrief: "Defend the legitimacy of EU safeguards. You may trade a phased tariff reduction for UK commitments on monitoring, origin verification, and restraint from retaliation." },
      { id: "eu-industry", name: "Marc Dubois", title: "Director for Steel Industries", initials: "MD", country: "European Union", privateBrief: "Protect EU producers from import surges. Resist fast tariff removal; favour a review clause, quotas, and compensation that does not weaken industrial safeguards." }
    ]}
  ]
};

const state = { round: 1, turn: "uk", dialogue: [], counts: { uk: 0, eu: 0 }, accepted: { uk: false, eu: false }, busy: false, demo: true, lastAi: 1 };
const $ = (id) => document.getElementById(id);
const human = scenario.countries.find((c) => c.human);
const ai = scenario.countries.find((c) => !c.human);

function initials(name) { return name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase(); }
function renderRosters() {
  $("rosters").innerHTML = scenario.countries.map((country) => `<section class="team"><div class="team-head"><span class="team-name">${country.name}</span><span class="side-tag">${country.human ? "Your side" : "AI side"}</span></div>${country.roles.map((r) => `<div class="person ${r.id === $("speakerSelect")?.value ? "active" : ""}"><div class="avatar">${r.initials || initials(r.name)}</div><div><strong>${r.name}</strong><small>${r.title}</small></div></div>`).join("")}</section>`).join("");
}
function renderDialogue() {
  const box = $("dialogue"); box.innerHTML = "";
  if (!state.dialogue.length) box.innerHTML = `<div class="system-message">Round 1 opened · The United Kingdom has the floor</div>`;
  for (const m of state.dialogue) {
    const node = $("messageTemplate").content.cloneNode(true); const article = node.querySelector("article");
    if (m.countryId === ai.id) article.classList.add("ai");
    node.querySelector(".avatar").textContent = m.initials;
    node.querySelector("strong").textContent = m.name;
    node.querySelector(".message-meta span").textContent = m.role;
    node.querySelector("time").textContent = `R${m.round} · ${m.time}`;
    node.querySelector("p").textContent = m.text; box.append(node);
  }
  box.scrollTop = box.scrollHeight;
}
function renderState() {
  $("roundNumber").textContent = state.round;
  const yourTurn = state.turn === human.id && !state.busy;
  $("turnIndicator").innerHTML = `<span>${yourTurn ? "Your turn" : "EU turn"}</span><small>${yourTurn ? human.name : ai.name}</small>`;
  $("composer").hidden = !yourTurn; $("aiWait").hidden = state.turn !== ai.id || !state.busy;
  $("utteranceCount").textContent = `${state.counts.uk} / ${scenario.maxUtterancesPerCountry} interventions`;
  const total = state.counts.uk + state.counts.eu;
  $("progressText").textContent = `${total} of ${scenario.maxUtterancesPerCountry * 2}`;
  $("progressBar").style.width = `${Math.min(100, total / (scenario.maxUtterancesPerCountry * 2) * 100)}%`;
  $("agreementStatus").textContent = state.accepted.uk && state.accepted.eu ? "Accepted" : state.accepted.uk ? "UK ready" : "Open";
  $("acceptButton").textContent = state.accepted.uk ? "Acceptance declared ✓" : "Declare ready to accept";
  $("acceptButton").classList.toggle("accepted", state.accepted.uk);
  $("speakButton").disabled = !$("utteranceInput").value.trim() || state.busy;
  renderRosters();
}
function addMessage(country, role, text) {
  state.dialogue.push({ countryId: country.id, country: country.name, name: role.name, role: role.title, initials: role.initials || initials(role.name), text, round: state.round, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  renderDialogue();
}
function showToast(text) { const t = $("toast"); t.textContent = text; t.hidden = false; setTimeout(() => t.hidden = true, 2600); }
async function humanTurn() {
  const text = $("utteranceInput").value.trim(); if (!text || state.turn !== human.id || state.busy) return;
  const role = human.roles.find((r) => r.id === $("speakerSelect").value); addMessage(human, role, text);
  $("utteranceInput").value = ""; state.counts.uk++; state.turn = ai.id; state.busy = true; renderState();
  try {
    const agent = chooseAiSpeaker();
    const response = await fetch("/api/agent-turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent, team: ai.roles, dialogue: state.dialogue, caseText: scenario.publicCase, round: state.round }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Agent request failed");
    state.demo = result.demo; addMessage(ai, agent, result.text); state.counts.eu++;
    if (state.counts.uk >= scenario.maxUtterancesPerCountry && state.counts.eu >= scenario.maxUtterancesPerCountry) advanceRound(); else state.turn = human.id;
  } catch (error) { state.turn = human.id; showToast(error.message); }
  finally { state.busy = false; renderState(); }
}
function chooseAiSpeaker() {
  // Independent agents do not consult each other; selection rotates while each model call receives only its own brief.
  state.lastAi = (state.lastAi + 1) % ai.roles.length; return ai.roles[state.lastAi];
}
function advanceRound() {
  if (state.round >= scenario.maxRounds) { showToast("Final round complete — record acceptance decisions."); state.turn = human.id; return; }
  state.round++; state.counts = { uk: 0, eu: 0 }; state.accepted = { uk: false, eu: false }; state.turn = human.id;
  state.dialogue.push({ countryId: "system", country: "Room", name: "Round opened", role: "System", initials: "R" + state.round, text: `Round ${state.round} is now open. Previous public statements remain on the record.`, round: state.round, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }); renderDialogue();
}
function reset() { Object.assign(state, { round: 1, turn: "uk", dialogue: [], counts: { uk: 0, eu: 0 }, accepted: { uk: false, eu: false }, busy: false, lastAi: 1 }); $("utteranceInput").value = ""; renderDialogue(); renderState(); showToast("Simulation reset"); }

$("caseText").textContent = scenario.publicCase;
$("speakerSelect").innerHTML = human.roles.map((r) => `<option value="${r.id}">${r.name} · ${r.title}</option>`).join("");
function updatePrivateBrief(){ const role=human.roles.find((r)=>r.id===$("speakerSelect").value); $("privateBrief").textContent=role.privateBrief; renderRosters(); }
$("speakerSelect").addEventListener("change", updatePrivateBrief);
$("utteranceInput").addEventListener("input", renderState);
$("utteranceInput").addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") humanTurn(); });
$("speakButton").addEventListener("click", humanTurn);
$("briefToggle").addEventListener("click", () => { const open = $("caseBrief").hidden; $("caseBrief").hidden = !open; $("briefToggle").setAttribute("aria-expanded", open); });
$("acceptButton").addEventListener("click", () => { state.accepted.uk = !state.accepted.uk; renderState(); showToast(state.accepted.uk ? "UK acceptance recorded" : "Acceptance withdrawn"); });
$("endRoundButton").addEventListener("click", () => { if (state.busy) return; advanceRound(); renderState(); });
$("resetButton").addEventListener("click", reset);
fetch("/api/status").then((r) => r.json()).then((s) => { $("connectionLabel").textContent = s.live ? `Live · ${s.model}` : "Demo model"; }).catch(() => $("connectionLabel").textContent = "Offline");
updatePrivateBrief(); renderDialogue(); renderState();
