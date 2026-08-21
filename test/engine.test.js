import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pack } from "../public/scenarios/s1-article-xxviii-steel.js";
import { packs } from "../public/scenarios/index.js";
import { validatePack } from "../lib/validate.js";
import {
  assembleSeatPrompt,
  resolveVariant,
  historyBlocksFor,
  buildAcceptanceSchema,
  buildReportSchema,
  buildInstructionSchema,
  pollToProposal,
  detectSettlement,
  checkAuthority,
  authorityIsEmpty,
} from "../lib/assemble.js";
import * as C from "../lib/channels.js";
import { dispositionsForArm, ARM_KEYS } from "../lib/arms.js";
import { runNegotiation } from "../lib/engine.js";

const seats = pack.seats;
const resolvedHarsh = resolveVariant(pack, "harsh");
const schemaOf = (key) =>
  key === "turn" ? pack.schemas.turn
  : key === "declaration" ? pack.schemas.declaration
  : key === "report" ? buildReportSchema(pack)
  : key === "instruct" ? buildInstructionSchema(pack)
  : buildAcceptanceSchema(pack);
const ALL_SCHEMAS = ["declaration", "turn", "report", "instruct", "poll"];

// Known content finding (see lib/validate.js banned vocab, and the report):
// JB's own Block 1/2-B text uses "mandate" in the ordinary EU-institutional
// sense ("a mandate from the Council"), which the v0.2 leak audit also bans as
// a construct name. The real pack currently fails validatePack() for exactly
// this reason - see the dedicated test below, which documents the finding
// rather than hiding it.
//
// Engine-mechanics tests (settlement, phases, the lock, divergence events)
// exist to prove the ENGINE is correct for any valid pack, not to re-litigate
// this specific, pending content decision. They run against a private clone
// with "mandate" substituted, registered under its own id, never written to
// disk and never touching public/scenarios/s1-article-xxviii-steel.js.
function buildFixturePack() {
  const clone = JSON.parse(JSON.stringify(pack));
  clone.id = "s1-test-fixture";
  clone.placeholder = false;
  const desub = (t) =>
    String(t || "")
      .replace(/\bMandate\b/g, "Remit")
      .replace(/\bmandate\b/g, "remit");
  clone.facts = desub(clone.facts);
  clone.rules = desub(clone.rules);
  for (const seat of clone.seats) {
    seat.brief = desub(seat.brief);
    seat.privateInfo = desub(seat.privateInfo);
  }
  return clone;
}
const fixturePack = buildFixturePack();
if (!packs.find((p) => p.id === fixturePack.id)) packs.push(fixturePack);

async function runInTemp(env = {}, condition = { dispositionArm: "control" }, rounds = 2, extra = {}) {
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
    result = await runNegotiation({ packId: fixturePack.id, condition, rounds, ...extra });
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

test("known finding: the real pack currently fails the leak audit on 'mandate'", () => {
  const r = validatePack(pack);
  assert.equal(r.ok, false, "if this now passes, JB has resolved the mandate collision - update this test to assert ok:true and delete this comment");
  const flagged = r.errors.filter((e) => /banned vocabulary "mandate"/.test(e));
  assert.equal(flagged.length, 3, "expected exactly the known 3 hits: facts x2 (harsh+lenient) and seat.eu-brussels.brief");
});

test("the test fixture pack (mandate substituted) passes the leak audit", () => {
  assert.deepEqual(validatePack(fixturePack).errors, []);
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
      const prompt = assembleSeatPrompt(pack, seat, "firm", schemaOf(key), resolvedHarsh);
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
      const prompt = assembleSeatPrompt(pack, seat, null, schemaOf(key), resolvedHarsh);
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

test("both variants resolve with no leftover {{PLACEHOLDER}} tokens", () => {
  for (const key of Object.keys(pack.variants)) {
    const r = resolveVariant(pack, key);
    assert.doesNotMatch(r.facts, /\{\{[A-Z_]+\}\}/, `variant ${key} facts has an unresolved token`);
    assert.doesNotMatch(r.rules, /\{\{[A-Z_]+\}\}/, `variant ${key} rules has an unresolved token`);
  }
});

test("harsh and lenient variants differ only in the parameterised figures", () => {
  const h = resolveVariant(pack, "harsh");
  const l = resolveVariant(pack, "lenient");
  assert.notEqual(h.facts, l.facts, "variants must actually differ");
  assert.match(h.facts, /50%/);
  assert.match(l.facts, /15%/);
  assert.match(h.rules, /50%/);
  assert.match(l.rules, /15%/);
});

test("Block 1 and Block 4 resolve to the same figures within a variant", () => {
  // The mechanical check in validate.js should find nothing wrong on the real
  // pack - both blocks are filled from the same values object.
  const r = validatePack(pack);
  assert.equal(r.errors.some((e) => /does not resolve to the same value/.test(e)), false);
});

test("validate.js catches Block 1/Block 4 figures resolving to different values", () => {
  const broken = JSON.parse(JSON.stringify(pack));
  // Break only Block 4's copy of the figure, leaving Block 1 untouched.
  broken.rules = broken.rules.replace("{{BOUND_RATE_PCT}}%,", "99%,");
  const r = validatePack(broken);
  assert.ok(
    r.errors.some((e) => /does not resolve to the same value/.test(e)),
    "expected a consistency error when Block 4 hardcodes a different figure than Block 1",
  );
});

test("validate.js catches an unresolved placeholder", () => {
  const broken = JSON.parse(JSON.stringify(pack));
  broken.variants.harsh = { ...broken.variants.harsh };
  delete broken.variants.harsh.BOUND_RATE_PCT;
  const r = validatePack(broken);
  assert.ok(r.errors.some((e) => /unresolved placeholder/.test(e)));
});

test("Schema C is the v0.2 decision shape: decision, terms_decided, reasoning", () => {
  const schema = buildAcceptanceSchema(pack);
  assert.match(schema.json, /"decision": "accept \| continue"/);
  assert.match(schema.json, /"terms_decided": \{/);
  assert.match(schema.json, /"reasoning": "Why\."/);
  assert.doesNotMatch(schema.json, /"accept": true or false/, "old boolean field must be gone");
  assert.doesNotMatch(schema.json, /if_not/, "old if_not field must be gone");
});

test("pollToProposal maps decision/terms_decided onto the internal settlement shape", () => {
  const accepted = pollToProposal({ decision: "accept", terms_decided: { trq_volume_tonnes: 1000 }, reasoning: "ok" });
  assert.equal(accepted.status, "accept");
  assert.equal(accepted.trq_volume_tonnes, 1000);

  const continuing = pollToProposal({ decision: "continue", terms_decided: {}, reasoning: "not yet" });
  assert.equal(continuing.status, "continue");

  assert.equal(pollToProposal(null), null);
});

test("settlement is decided by capital seats only (v0.2 field names)", () => {
  const agreed = { status: "accept", trq_volume_tonnes: 1200000, allocation: "global",
    out_of_quota_rate_pct: 12, duration_years: 4, review_clause: true };
  const capitals = C.capitalSeats(pack).map((s) => s.id);

  const both = Object.fromEntries(capitals.map((id) => [id, { ...agreed }]));
  assert.equal(detectSettlement(pack, capitals, both).settled, true);

  const postsOnly = Object.fromEntries(C.postSeats(pack).map((s) => [s.id, { ...agreed }]));
  assert.equal(detectSettlement(pack, capitals, postsOnly).settled, false);

  const differ = { ...both, [capitals[0]]: { ...agreed, duration_years: 6 } };
  const r = detectSettlement(pack, capitals, differ);
  assert.equal(r.settled, false);
  assert.match(r.reason, /duration_years/);
});

test("authority breaches are detected but never block the turn", async () => {
  const { result, events } = await runInTemp({ TB_STUB_DEFY: "always", TB_STUB_ACCEPT: "never" });
  const breaches = events.filter((e) => e.type === "mandate_exceeded");
  assert.ok(breaches.length > 0, "defiant proposal should raise mandate_exceeded");
  assert.equal(result.summary.terminal, "rounds_exhausted");
  assert.equal(result.summary.rounds, 2);
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
  for (const e of events.filter((x) => x.type === "table_turn")) {
    assert.equal(fixturePack.seats.find((s) => s.id === e.seatId).level, "post");
  }
  for (const e of events.filter((x) => x.type === "acceptance")) {
    assert.equal(fixturePack.seats.find((s) => s.id === e.seatId).level, "capital");
  }
});

test("acceptance events carry decision/terms_decided/reasoning, not the old shape", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  const polls = events.filter((e) => e.type === "acceptance");
  assert.ok(polls.length > 0);
  for (const p of polls) {
    assert.ok("decision" in p, "missing decision field");
    assert.ok("terms_decided" in p, "missing terms_decided field");
    assert.ok("reasoning" in p, "missing reasoning field");
    assert.ok(!("accept" in p), "old boolean accept field should be gone");
    assert.ok(!("if_not" in p), "old if_not field should be gone");
  }
});

test("every message event carries phase, channel and a computed visible_to", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  for (const e of events.filter((x) => x.channel)) {
    assert.ok(e.phase, `${e.type} missing phase`);
    assert.ok(Array.isArray(e.visible_to), `${e.type} missing computed visible_to`);
    assert.deepEqual(e.visible_to, C.visibleTo(fixturePack, e.channel), `${e.type} visible_to disagrees with the channel`);
  }
  assert.ok(events.every((e, i) => e.seq === i), "sequence numbers must be gapless");
});

test("consultation events are never marked visible to the other country", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  for (const e of events.filter((x) => C.isConsult(x.channel))) {
    const country = C.consultCountry(e.channel);
    for (const id of e.visible_to) {
      assert.equal(fixturePack.seats.find((s) => s.id === id).country, country,
        `${e.type} on ${e.channel} was marked visible to ${id}`);
    }
  }
});

test("settlement ends the run early, and records terms_decided as the settlement", async () => {
  const { result } = await runInTemp({ TB_STUB_ACCEPT: "always" });
  assert.equal(result.summary.terminal, "settled");
  assert.equal(result.summary.rounds, 1);
  assert.ok(result.summary.settlement);
});

test("release requests and refusals are recorded", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" });
  assert.ok(events.some((e) => e.type === "release_requested"));
  assert.ok(events.some((e) => e.type === "release_refused"));
});

test("run manifest records which variant was used", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" }, { dispositionArm: "control" }, 1, { variant: "lenient" });
  const start = events.find((e) => e.type === "run_start");
  assert.equal(start.config.variant, "lenient");
});

test("paired brief/private-info lengths are compared within a level, not across", () => {
  const r = validatePack(fixturePack);
  for (const wmsg of r.warnings) {
    assert.doesNotMatch(wmsg, /eu-geneva=\d+, eu-brussels=/, "must not compare across levels");
  }
  const byLevel = {};
  for (const s of fixturePack.seats) (byLevel[s.level] ||= []).push(s);
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
  assert.ok(validatePack(pack).errors.every((e) => !/rounds/.test(e)), "no round-count error on the real pack");
  assert.ok(validatePack({ ...pack, rounds: 4 }).errors.some((e) => /rounds/.test(e)));
});

test("the engine flag name capitalSeesTable never appears literally in prompt text", () => {
  assert.deepEqual(validatePack(pack).errors.filter((e) => /capitalSeesTable/.test(e)), []);
});
