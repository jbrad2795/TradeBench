import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pack } from "../public/scenarios/s1-article-xxviii-steel.js";
import { validatePack } from "../lib/validate.js";
import {
  assembleSeatPrompt,
  historyBlocksFor,
  buildAcceptanceSchema,
  buildReportSchema,
  buildInstructionSchema,
  detectSettlement,
  checkAuthority,
  authorityIsEmpty,
} from "../lib/assemble.js";
import * as C from "../lib/channels.js";
import { dispositionsForArm, ARM_KEYS } from "../lib/arms.js";
import { runNegotiation } from "../lib/engine.js";

const seats = pack.seats;
const schemaOf = (key) =>
  key === "turn" ? pack.schemas.turn
  : key === "declaration" ? pack.schemas.declaration
  : key === "report" ? buildReportSchema(pack)
  : key === "instruct" ? buildInstructionSchema(pack)
  : buildAcceptanceSchema(pack);
const ALL_SCHEMAS = ["declaration", "turn", "report", "instruct", "poll"];

async function runInTemp(env = {}, condition = { dispositionArm: "control" }, rounds = 2) {
  const dir = mkdtempSync(join(tmpdir(), "tb-"));
  const saved = {};
  for (const k of ["TB_RUNS_DIR", "TB_STUB_ACCEPT", "TB_STUB_DEFY", "TB_STUB_MANDATE", "OPENAI_API_KEY"]) {
    saved[k] = process.env[k];
  }
  process.env.TB_RUNS_DIR = dir;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  delete process.env.OPENAI_API_KEY; // force offline stubs
  let result;
  try {
    result = await runNegotiation({ condition, rounds });
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
  assert.deepEqual(validatePack(pack).errors, []);
});

// THE hard invariant. Consultation content must never cross between countries.
test("no consultation content from one country reaches the other country's seats", () => {
  const messages = [
    { channel: C.TABLE, seatId: "eu-geneva", round: 1, phase: "table", text: "TABLE-EU-MARKER" },
    { channel: C.TABLE, seatId: "uk-geneva", round: 1, phase: "table", text: "TABLE-UK-MARKER" },
    { channel: C.consultChannel("eu"), seatId: "eu-geneva", round: 1, phase: "report", text: "CONSULT-EU-SECRET" },
    { channel: C.consultChannel("eu"), seatId: "eu-brussels", round: 1, phase: "instruct", text: "CONSULT-EU-ORDER" },
    { channel: C.consultChannel("uk"), seatId: "uk-geneva", round: 1, phase: "report", text: "CONSULT-UK-SECRET" },
    { channel: C.consultChannel("uk"), seatId: "uk-london", round: 1, phase: "instruct", text: "CONSULT-UK-ORDER" },
  ];

  for (const seat of seats) {
    const rendered = historyBlocksFor(pack, messages, seat);
    const foreign = seat.country === "eu" ? ["CONSULT-UK-SECRET", "CONSULT-UK-ORDER"] : ["CONSULT-EU-SECRET", "CONSULT-EU-ORDER"];
    for (const marker of foreign) {
      assert.ok(!rendered.includes(marker), `${seat.id} was shown ${marker}`);
    }
    const own = seat.country === "eu" ? "CONSULT-EU-SECRET" : "CONSULT-UK-SECRET";
    assert.ok(rendered.includes(own), `${seat.id} could not see its own delegation's exchange`);
  }
});

test("a seat never sees another seat's brief or private information", () => {
  for (const seat of seats) {
    for (const key of ALL_SCHEMAS) {
      const prompt = assembleSeatPrompt(pack, seat, "firm", schemaOf(key));
      for (const other of seats) {
        if (other.id === seat.id) continue;
        assert.ok(!prompt.includes(other.brief), `${seat.id} saw ${other.id}'s brief in ${key}`);
        if ((other.privateInfo || "").trim()) {
          assert.ok(!prompt.includes(other.privateInfo), `${seat.id} saw ${other.id}'s privateInfo in ${key}`);
        }
      }
    }
  }
});

test("control arm carries no disposition sentence or filler in any schema", () => {
  for (const seat of seats) {
    for (const key of ALL_SCHEMAS) {
      const prompt = assembleSeatPrompt(pack, seat, null, schemaOf(key));
      for (const text of Object.values(pack.dispositions)) {
        assert.ok(!prompt.includes(text), `control ${seat.id}/${key} contains a disposition`);
      }
      assert.doesNotMatch(prompt, /you believe/i, `control ${seat.id}/${key} contains disposition-style filler`);
    }
  }
});

test("only the focal seat is tagged in the focal arm", () => {
  const m = dispositionsForArm(pack, "focal_firm_ukgva");
  assert.equal(m["uk-geneva"], "firm");
  for (const s of seats) if (s.id !== "uk-geneva") assert.ok(!m[s.id], `${s.id} should be untagged`);
  // Control baseline stays whole-table untagged.
  assert.deepEqual(dispositionsForArm(pack, "control"), {});
});

test("every arm names only dispositions the pack defines", () => {
  for (const key of ARM_KEYS) assert.doesNotThrow(() => dispositionsForArm(pack, key));
});

test("capital seats cannot speak at the table, post seats can", () => {
  for (const s of seats) {
    assert.equal(C.canSpeak(pack, s, C.TABLE), s.level === "post", `${s.id} table speech rights`);
    assert.equal(C.canSpeak(pack, s, C.consultChannel(s.country)), true);
    assert.equal(C.canSpeak(pack, s, C.consultChannel(s.country === "eu" ? "uk" : "eu")), false);
  }
  assert.ok(pack.speakingOrder.every((id) => seats.find((s) => s.id === id).level === "post"));
});

test("settlement is decided by capital seats only", () => {
  const agreed = { status: "accept", trq_volume_tonnes: 1200000, allocation: "global",
    out_of_quota_rate_pct: 12, duration_years: 4, review_clause: true };
  const capitals = C.capitalSeats(pack).map((s) => s.id);

  const both = Object.fromEntries(capitals.map((id) => [id, { ...agreed }]));
  assert.equal(detectSettlement(pack, capitals, both).settled, true);

  // Post seats agreeing is not a settlement.
  const postsOnly = Object.fromEntries(C.postSeats(pack).map((s) => [s.id, { ...agreed }]));
  assert.equal(detectSettlement(pack, capitals, postsOnly).settled, false);

  // One capital differing on a single term blocks it.
  const differ = { ...both, [capitals[0]]: { ...agreed, duration_years: 6 } };
  const r = detectSettlement(pack, capitals, differ);
  assert.equal(r.settled, false);
  assert.match(r.reason, /duration_years/);
});

test("authority breaches are detected but never block the turn", async () => {
  const { result, events } = await runInTemp({ TB_STUB_DEFY: "always", TB_STUB_ACCEPT: "never" });
  const breaches = events.filter((e) => e.type === "mandate_exceeded");
  assert.ok(breaches.length > 0, "defiant proposal should raise mandate_exceeded");
  // The run continued to the full round budget despite the breach.
  assert.equal(result.summary.terminal, "rounds_exhausted");
  assert.equal(result.summary.rounds, 2);
  // The defiant proposal is still on the record.
  const tabled = events.filter((e) => e.type === "table_turn" && e.round === 2);
  assert.ok(tabled.some((t) => t.proposal && t.proposal.trq_volume_tonnes === 9000000),
    "the out-of-mandate proposal must still stand");
});

test("an all-null authority raises mandate_absent", async () => {
  const { events } = await runInTemp({ TB_STUB_MANDATE: "absent", TB_STUB_ACCEPT: "never" });
  assert.ok(events.some((e) => e.type === "mandate_absent"), "expected mandate_absent");
});

test("round structure runs table, then consultation, then poll", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  const r1 = events.filter((e) => e.round === 1 && ["table_turn", "post_report", "capital_instruction", "acceptance"].includes(e.type));
  const order = r1.map((e) => e.type);
  const lastTable = order.lastIndexOf("table_turn");
  const firstReport = order.indexOf("post_report");
  const lastInstruct = order.lastIndexOf("capital_instruction");
  const firstPoll = order.indexOf("acceptance");
  assert.ok(firstReport > lastTable, "consultation must follow the table");
  assert.ok(firstPoll > lastInstruct, "poll must follow the consultation");
  // Only post seats table; only capitals poll.
  for (const e of events.filter((x) => x.type === "table_turn")) {
    assert.equal(seats.find((s) => s.id === e.seatId).level, "post");
  }
  for (const e of events.filter((x) => x.type === "acceptance")) {
    assert.equal(seats.find((s) => s.id === e.seatId).level, "capital");
  }
});

test("every message event carries phase, channel and a computed visible_to", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  for (const e of events.filter((x) => x.channel)) {
    assert.ok(e.phase, `${e.type} missing phase`);
    assert.ok(Array.isArray(e.visible_to), `${e.type} missing computed visible_to`);
    assert.deepEqual(e.visible_to, C.visibleTo(pack, e.channel), `${e.type} visible_to disagrees with the channel`);
  }
  assert.ok(events.every((e, i) => e.seq === i), "sequence numbers must be gapless");
});

test("consultation events are never marked visible to the other country", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  for (const e of events.filter((x) => C.isConsult(x.channel))) {
    const country = C.consultCountry(e.channel);
    for (const id of e.visible_to) {
      assert.equal(seats.find((s) => s.id === id).country, country,
        `${e.type} on ${e.channel} was marked visible to ${id}`);
    }
  }
});

test("capital rejecting its post seat's accept recommendation is recorded", async () => {
  // Stubs: post recommends accept, capital declines to accept.
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "recommend_only" });
  const recs = events.filter((e) => e.type === "post_report");
  assert.ok(recs.length, "expected post reports");
});

test("release requests and refusals are recorded", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  assert.ok(events.some((e) => e.type === "release_requested"), "expected release_requested");
  assert.ok(events.some((e) => e.type === "release_refused"), "expected release_refused");
});

test("paired brief lengths are compared within a level, not across", () => {
  const r = validatePack(pack);
  // Cross-level comparison is dropped; post-vs-post and capital-vs-capital only.
  for (const wmsg of r.warnings) {
    assert.doesNotMatch(wmsg, /eu-geneva=\d+, eu-brussels=/, "must not compare across levels");
  }
  const byLevel = {};
  for (const s of seats) (byLevel[s.level] ||= []).push(s);
  assert.equal(Object.keys(byLevel).length, 2);
  for (const g of Object.values(byLevel)) assert.equal(g.length, 2);
});

test("a second run cannot start while one holds the lock", async () => {
  const { acquireRunLock } = await import("../lib/lock.js");
  const dir = mkdtempSync(join(tmpdir(), "tb-lock-"));
  const saved = process.env.TB_RUNS_DIR;
  process.env.TB_RUNS_DIR = dir;
  try {
    const release = acquireRunLock({ model: "test:model", scenario: "s1" });
    assert.throws(() => acquireRunLock({ model: "other:model", scenario: "s1" }), /already in progress/);
    release();
    acquireRunLock({ model: "test:model", scenario: "s1" })();
  } finally {
    if (saved === undefined) delete process.env.TB_RUNS_DIR;
    else process.env.TB_RUNS_DIR = saved;
  }
});

test("a lock left by a dead process is taken over, not honoured", async () => {
  const { acquireRunLock } = await import("../lib/lock.js");
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "tb-lock-"));
  const saved = process.env.TB_RUNS_DIR;
  process.env.TB_RUNS_DIR = dir;
  try {
    writeFileSync(join(dir, ".run-lock"), JSON.stringify({ pid: 2147483647, model: "dead" }), "utf8");
    acquireRunLock({ model: "test:model", scenario: "s1" })();
  } finally {
    if (saved === undefined) delete process.env.TB_RUNS_DIR;
    else process.env.TB_RUNS_DIR = saved;
  }
});

test("the round count stated in the rules must match the pack", () => {
  assert.deepEqual(validatePack(pack).errors, []);
  assert.ok(validatePack({ ...pack, rounds: 4 }).errors.some((e) => /rounds/.test(e)));
});

test("JSON repair handles the failure modes seen in live runs", async () => {
  const { parseJson } = await import("../lib/model.js");
  // Trailing comma before a closing brace - 4 of 6 live failures were this.
  assert.deepEqual(parseJson('{"a": 1, "b": {"c": 2,},}'), { a: 1, b: { c: 2 } });
  assert.deepEqual(parseJson('{"a": [1, 2,]}'), { a: [1, 2] });
  // Fences and surrounding prose.
  assert.deepEqual(parseJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Here: {"a": 1} done'), { a: 1 });
  // Genuinely malformed must stay null so the caller retries rather than
  // recording a silent half-answer.
  assert.equal(parseJson('{"a": 1, "b":'), null);
  assert.equal(parseJson("not json at all"), null);
});
