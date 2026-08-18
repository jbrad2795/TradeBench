import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pack } from "../public/scenarios/s1-article-xxviii-steel.js";
import { validatePack } from "../lib/validate.js";
import { assembleSeatPrompt, detectSettlement } from "../lib/assemble.js";
import { runNegotiation } from "../lib/engine.js";

const seats = pack.seats;

async function runInTemp(env = {}, condition = { dispositionArm: "control" }) {
  const dir = mkdtempSync(join(tmpdir(), "tb-"));
  const saved = {
    TB_RUNS_DIR: process.env.TB_RUNS_DIR,
    TB_STUB_ACCEPT: process.env.TB_STUB_ACCEPT,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  process.env.TB_RUNS_DIR = dir;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  delete process.env.OPENAI_API_KEY; // force offline stubs
  let result;
  try {
    result = await runNegotiation({ condition });
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const file = readdirSync(dir).find((f) => f.endsWith(".jsonl"));
  assert.ok(file, "no run log written");
  const events = readFileSync(join(dir, file), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { result, events };
}

test("S1 pack passes the leak audit", () => {
  const r = validatePack(pack);
  assert.deepEqual(r.errors, [], "pack must have no leak-audit errors");
});

// Blocks 1, 4 and 5 must be byte-identical across seats.
test("shared blocks are byte-identical across all seats", () => {
  const built = seats.map((s) => assembleSeatPrompt(pack, s, "firm", "turn"));
  for (const p of built) {
    assert.ok(p.includes(pack.facts), "Block 1 missing or altered");
    assert.ok(p.includes(pack.rules), "Block 4 missing or altered");
    assert.ok(p.includes(pack.schemas.turn.json), "Block 5 missing or altered");
  }
});

test("block order is facts, seat brief, disposition, rules, schema", () => {
  const p = assembleSeatPrompt(pack, seats[0], "firm", "turn");
  const at = (s) => p.indexOf(s);
  assert.ok(at(pack.facts) < at(seats[0].brief), "facts must precede seat brief");
  assert.ok(at(seats[0].brief) < at(pack.dispositions.firm), "seat brief must precede disposition");
  assert.ok(at(pack.dispositions.firm) < at(pack.rules), "disposition must precede rules");
  assert.ok(at(pack.rules) < at(pack.schemas.turn.json), "rules must precede schema");
});

// The control arm omits Block 3 entirely - no neutral filler.
test("control arm omits the disposition block with no substitute", () => {
  const p = assembleSeatPrompt(pack, seats[0], null, "turn");
  for (const text of Object.values(pack.dispositions)) {
    assert.ok(!p.includes(text), "control prompt contains a disposition sentence");
  }
  assert.doesNotMatch(p, /you believe/i, "control prompt contains disposition-style filler");
});

test("a seat never sees another seat's brief", () => {
  for (const seat of seats) {
    for (const schemaKey of ["declaration", "turn"]) {
      const p = assembleSeatPrompt(pack, seat, "firm", schemaKey);
      for (const other of seats) {
        if (other.id === seat.id) continue;
        assert.ok(!p.includes(other.brief), `${seat.id} saw ${other.id}'s brief`);
      }
    }
  }
});

test("settlement requires every seat to accept the same terms", () => {
  const agreed = {
    status: "accept", trq_volume_tonnes: 1200000, allocation: "global",
    out_of_quota_rate_pct: 12, duration_years: 4, review_clause: true,
  };
  const all = Object.fromEntries(seats.map((s) => [s.id, { ...agreed }]));
  assert.equal(detectSettlement(pack, all).settled, true);

  // One seat differs on a single term.
  const differs = { ...all, [seats[0].id]: { ...agreed, duration_years: 6 } };
  const r1 = detectSettlement(pack, differs);
  assert.equal(r1.settled, false);
  assert.match(r1.reason, /duration_years/);

  // One seat has not accepted.
  const rejects = { ...all, [seats[1].id]: { ...agreed, status: "counter" } };
  assert.equal(detectSettlement(pack, rejects).settled, false);

  // A term left unset cannot be a settlement.
  const unset = Object.fromEntries(seats.map((s) => [s.id, { ...agreed, allocation: null }]));
  const r2 = detectSettlement(pack, unset);
  assert.equal(r2.settled, false);
  assert.match(r2.reason, /allocation/);
});

test("settlement ends the run early", async () => {
  const { result } = await runInTemp({ TB_STUB_ACCEPT: "always" });
  assert.equal(result.summary.terminal, "settled");
  assert.equal(result.summary.rounds, 1);
  assert.ok(result.summary.settlement, "settled runs must record the agreed terms");
});

test("no settlement runs the full round budget", async () => {
  const { result } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  assert.equal(result.summary.terminal, "rounds_exhausted");
  assert.equal(result.summary.rounds, pack.rounds);
  assert.equal(result.summary.turns, seats.length * pack.rounds);
});

test("run log carries the pre-game declaration and per-turn private fields", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  const types = new Set(events.map((e) => e.type));
  for (const t of ["run_start", "pregame_declaration", "turn", "round_end", "run_end"]) {
    assert.ok(types.has(t), `missing event type: ${t}`);
  }
  assert.equal(events.filter((e) => e.type === "pregame_declaration").length, seats.length);
  const turn = events.find((e) => e.type === "turn");
  for (const field of ["public_message", "proposal", "expectations", "private_rationale"]) {
    assert.ok(field in turn, `turn event missing ${field}`);
  }
  assert.ok(events.every((e, i) => e.seq === i), "sequence numbers must be gapless");
});

test("turns follow the pack's fixed speaking order", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  const round1 = events.filter((e) => e.type === "turn" && e.round === 1).map((e) => e.seatId);
  assert.deepEqual(round1, pack.speakingOrder);
});

test("every round closes with an acceptance poll of all seats", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  const polls = events.filter((e) => e.type === "acceptance");
  assert.equal(polls.length, seats.length * pack.rounds, "one poll per seat per round");
  for (const p of polls) {
    assert.ok("accept" in p && "terms" in p && "if_not" in p, "poll event missing fields");
  }
  // The poll must run after every seat has spoken in that round.
  const r1 = events.filter((e) => e.round === 1 && (e.type === "turn" || e.type === "acceptance"));
  const lastTurn = r1.map((e) => e.type).lastIndexOf("turn");
  const firstPoll = r1.map((e) => e.type).indexOf("acceptance");
  assert.ok(firstPoll > lastTurn, "poll must follow all turns in the round");
});

test("the poll, not the tabled proposals, decides settlement", async () => {
  const { result, events } = await runInTemp({ TB_STUB_ACCEPT: "always" });
  assert.equal(result.summary.terminal, "settled");
  const roundEnd = events.find((e) => e.type === "round_end");
  assert.equal(roundEnd.acceptCount, seats.length, "all seats must have accepted in the poll");
  assert.ok(roundEnd.terms, "settlement terms must be recorded");
});
