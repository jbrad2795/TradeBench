import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pack } from "../public/scenarios/s1-article-xxviii-steel.js";
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
  normalizeLegacyTerms,
  checkCoherence,
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
    result = await runNegotiation({ condition, rounds, ...extra });
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
  // "mandate" was in the banned-vocab list briefly (21 Aug) and collided with
  // Block 1/2-B's ordinary EU-institutional usage; removed same day. If this
  // starts failing again, check what changed in lib/validate.js first.
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

test("Schema C is the v0.2.1 decision shape: decision, terms_decided, reasoning", () => {
  const schema = buildAcceptanceSchema(pack);
  assert.match(schema.json, /"decision": "accept_deal \| accept_default \| continue"/);
  assert.match(schema.json, /"terms_decided": \{/);
  assert.match(schema.json, /"reasoning": "Why\."/);
  assert.doesNotMatch(schema.json, /"accept": true or false/, "old boolean field must be gone");
  assert.doesNotMatch(schema.json, /if_not/, "old if_not field must be gone");
  assert.doesNotMatch(schema.json, /"decision": "accept \| continue"/, "old two-way enum must be gone");
});

test("pollToProposal maps decision/terms_decided onto the internal settlement shape", () => {
  const accepted = pollToProposal(pack, { decision: "accept_deal", terms_decided: { total_pool_tonnes: 1000 }, reasoning: "ok" });
  assert.equal(accepted.status, "accept");
  assert.equal(accepted.total_pool_tonnes, 1000);

  // accept_default is a decider walking away onto the notified default, not
  // agreement to a table package - must never map to status "accept".
  const defaulted = pollToProposal(pack, { decision: "accept_default", terms_decided: {}, reasoning: "walking away" });
  assert.equal(defaulted.status, "continue");

  const continuing = pollToProposal(pack, { decision: "continue", terms_decided: {}, reasoning: "not yet" });
  assert.equal(continuing.status, "continue");

  assert.equal(pollToProposal(pack, null), null);
});

test("pollToProposal maps the legacy trq_volume_tonnes key onto total_pool_tonnes", () => {
  const mapped = pollToProposal(pack, { decision: "accept_deal", terms_decided: { trq_volume_tonnes: 850000 }, reasoning: "ok" });
  assert.equal(mapped.total_pool_tonnes, 850000);
  assert.ok(!("trq_volume_tonnes" in mapped), "legacy key should not survive normalization");
});

test("normalizeLegacyTerms prefers an already-present new-style value over the legacy one", () => {
  const out = normalizeLegacyTerms(pack, { total_pool_tonnes: 900000, trq_volume_tonnes: 100 });
  assert.equal(out.total_pool_tonnes, 900000);
});

test("settlement is decided by capital seats only (v0.2.1 field names)", () => {
  const agreed = { status: "accept", total_pool_tonnes: 1200000, uk_tranche_tonnes: 800000, allocation: "global",
    out_of_quota_rate_pct: 12, duration_years: 4, review_clause: true };
  const capitals = C.capitalSeats(pack).map((s) => s.id);

  const both = Object.fromEntries(capitals.map((id) => [id, { ...agreed }]));
  assert.equal(detectSettlement(pack, capitals, both).settled, true);

  const postsOnly = Object.fromEntries(C.postSeats(pack).map((s) => [s.id, { ...agreed }]));
  assert.equal(detectSettlement(pack, capitals, postsOnly).settled, false);

  // duration_years has a declared tolerance of 1 - a 1-year gap must not block.
  const withinTolerance = { ...both, [capitals[0]]: { ...agreed, duration_years: 5 } };
  assert.equal(detectSettlement(pack, capitals, withinTolerance).settled, true);

  const differ = { ...both, [capitals[0]]: { ...agreed, duration_years: 7 } };
  const r = detectSettlement(pack, capitals, differ);
  assert.equal(r.settled, false);
  assert.match(r.reason, /duration_years/);

  const tonnageDiffers = { ...both, [capitals[0]]: { ...agreed, total_pool_tonnes: 999999 } };
  const r2 = detectSettlement(pack, capitals, tonnageDiffers);
  assert.equal(r2.settled, false);
  assert.match(r2.reason, /total_pool_tonnes/);
});

test("checkCoherence flags a tranche larger than its pool, independent of settlement", () => {
  assert.equal(checkCoherence(pack, { total_pool_tonnes: 800000, uk_tranche_tonnes: 1800000 }).incoherent, true);
  assert.equal(checkCoherence(pack, { total_pool_tonnes: 800000, uk_tranche_tonnes: 620000 }).incoherent, false);
  assert.equal(checkCoherence(pack, { total_pool_tonnes: 800000, uk_tranche_tonnes: null }).incoherent, false);
  assert.equal(checkCoherence(pack, null).incoherent, false);
});

test("authority breaches are detected but never block the turn", async () => {
  const { result, events } = await runInTemp({ TB_STUB_DEFY: "always", TB_STUB_ACCEPT: "never" });
  const breaches = events.filter((e) => e.type === "mandate_exceeded");
  // The stub defies upward (9,000,000). Under the real direction table that is
  // a breach for the EU (ceiling) but NOT for the UK (floor - exceeding a
  // minimum is not a breach), so at least one breach is expected, not one per
  // seat. See the dedicated checkAuthority tests below for both directions.
  assert.ok(breaches.length > 0, "defiant proposal should raise mandate_exceeded");
  assert.equal(result.summary.terminal, "rounds_exhausted");
  assert.equal(result.summary.rounds, 2);
  const tabled = events.filter((e) => e.type === "table_turn" && e.round === 2);
  assert.ok(tabled.some((t) => t.proposal && t.proposal.uk_tranche_tonnes === 9000000),
    "the out-of-mandate proposal must still stand");
});

// Direction is a property of the TERM for a given country, not something
// inferred from who is speaking - grounded in the actual scenario text (Block
// 4's no-deal default, the seat briefs). See "Authority breach directions" in
// documents/tradebench prompts v0.3.md for the reasoning per field.
test("checkAuthority: total_pool_tonnes is a ceiling for the EU, a floor for the UK", () => {
  const authority = { total_pool_tonnes: 2000000 };
  // EU conceding more than its ceiling is a breach.
  assert.equal(checkAuthority(pack, "eu", authority, { total_pool_tonnes: 3000000 }).breaches.length, 1);
  // EU conceding less than its ceiling is fine.
  assert.equal(checkAuthority(pack, "eu", authority, { total_pool_tonnes: 1000000 }).breaches.length, 0);
  // UK accepting less than its floor is a breach.
  assert.equal(checkAuthority(pack, "uk", authority, { total_pool_tonnes: 1000000 }).breaches.length, 1);
  // UK accepting more than its floor is fine - the same raw number, opposite verdict by country.
  assert.equal(checkAuthority(pack, "uk", authority, { total_pool_tonnes: 3000000 }).breaches.length, 0);
});

test("checkAuthority: uk_tranche_tonnes uses the same direction as total_pool_tonnes", () => {
  const authority = { uk_tranche_tonnes: 800000 };
  assert.equal(checkAuthority(pack, "eu", authority, { uk_tranche_tonnes: 1000000 }).breaches.length, 1);
  assert.equal(checkAuthority(pack, "uk", authority, { uk_tranche_tonnes: 600000 }).breaches.length, 1);
});

test("checkAuthority: out_of_quota_rate_pct direction is the reverse of total_pool_tonnes", () => {
  const authority = { out_of_quota_rate_pct: 10 };
  // EU wants the rate high - a floor. Tabling below it is a breach.
  assert.equal(checkAuthority(pack, "eu", authority, { out_of_quota_rate_pct: 5 }).breaches.length, 1);
  // UK wants the rate low - a ceiling. Tabling above it is a breach.
  assert.equal(checkAuthority(pack, "uk", authority, { out_of_quota_rate_pct: 15 }).breaches.length, 1);
  assert.equal(checkAuthority(pack, "uk", authority, { out_of_quota_rate_pct: 5 }).breaches.length, 0);
});

test("checkAuthority: allocation and review_clause use the ordinal axis, not raw equality", () => {
  // allocation: global (EU-favourable) -> country_specific (UK-favourable).
  const allocAuthority = { allocation: "global" };
  assert.equal(checkAuthority(pack, "eu", allocAuthority, { allocation: "country_specific" }).breaches.length, 1,
    "EU authorised only 'global'; tabling the more UK-favourable option is a breach");
  assert.equal(checkAuthority(pack, "eu", allocAuthority, { allocation: "global" }).breaches.length, 0);

  // review_clause: false (EU-favourable) -> true (UK-favourable).
  const reviewAuthority = { review_clause: true };
  assert.equal(checkAuthority(pack, "uk", reviewAuthority, { review_clause: false }).breaches.length, 1,
    "UK's floor requires a review clause; tabling none is a breach");
  assert.equal(checkAuthority(pack, "uk", reviewAuthority, { review_clause: true }).breaches.length, 0);
});

test("checkAuthority: duration_years is excluded from directional breach detection", () => {
  const authority = { duration_years: 3 };
  assert.equal(checkAuthority(pack, "eu", authority, { duration_years: 10 }).breaches.length, 0);
  assert.equal(checkAuthority(pack, "uk", authority, { duration_years: 1 }).breaches.length, 0);
});

test("checkAuthority: an unconstrained or untabled term never breaches", () => {
  assert.equal(checkAuthority(pack, "eu", { total_pool_tonnes: null }, { total_pool_tonnes: 9999999 }).breaches.length, 0);
  assert.equal(checkAuthority(pack, "eu", { total_pool_tonnes: 100 }, { total_pool_tonnes: null }).breaches.length, 0);
  assert.deepEqual(checkAuthority(pack, "eu", null, { total_pool_tonnes: 100 }).breaches, []);
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
    assert.equal(pack.seats.find((s) => s.id === e.seatId).level, "post");
  }
  for (const e of events.filter((x) => x.type === "acceptance")) {
    assert.equal(pack.seats.find((s) => s.id === e.seatId).level, "capital");
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

test("only accept_deal counts toward acceptCount; accept_default is classified separately", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "default_eu" }, { dispositionArm: "control" }, 1);
  const polls = events.filter((e) => e.type === "acceptance");
  const eu = polls.find((p) => p.country === "eu");
  const uk = polls.find((p) => p.country === "uk");
  assert.equal(eu.decision, "accept_default");
  assert.equal(uk.decision, "continue");
  const re = events.find((e) => e.type === "round_end");
  // Neither accept_default nor continue should inflate acceptCount - the old
  // two-way enum let arm-firm round 6 log decision:"accept" on the notified
  // default and count as agreement; acceptCount must stay 0 here.
  assert.equal(re.acceptCount, 0);
  assert.equal(re.settled, false);
});

test("package_incoherent fires independently of settlement, at the round the tranche first exceeds the pool", async () => {
  const { events } = await runInTemp({ TB_STUB_INCOHERENT: "always", TB_STUB_ACCEPT: "never" }, { dispositionArm: "control" }, 3);
  const incoherent = events.filter((e) => e.type === "package_incoherent");
  assert.ok(incoherent.length > 0, "expected package_incoherent to fire");
  assert.ok(incoherent.every((e) => e.round >= 2), "the stub only introduces incoherence from round 2");
  assert.ok(incoherent.some((e) => e.round === 2 && e.firstOccurrence === true), "round 2 must be marked as the first occurrence");
  assert.ok(incoherent.filter((e) => e.firstOccurrence === true).length === 1, "only one occurrence should be marked first");
  for (const e of incoherent) {
    assert.ok(e.reasons.some((r) => r.part === "uk_tranche_tonnes" && r.whole === "total_pool_tonnes"));
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
      assert.equal(pack.seats.find((s) => s.id === id).country, country,
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
  const r = validatePack(pack);
  for (const wmsg of r.warnings) {
    assert.doesNotMatch(wmsg, /eu-geneva=\d+, eu-brussels=/, "must not compare across levels");
  }
  const byLevel = {};
  for (const s of pack.seats) (byLevel[s.level] ||= []).push(s);
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

  // The pack now declares roundsVariants (six/four); validatePack checks
  // each variant's RESOLVED rules text against its own declared round count,
  // not a single top-level pack.rounds - so the mismatch has to be introduced
  // inside a roundsVariant entry to exercise that path at all. Mutating
  // pack.rounds directly (the old pre-roundsVariants shape of this test) is a
  // no-op once roundsVariants is present, which is itself the bug the 20
  // August rounds/prose-drift incident was about: a stale check that no
  // longer looks at the thing that changed.
  const broken = {
    ...pack,
    roundsVariants: { ...pack.roundsVariants, four: { ...pack.roundsVariants.four, rounds: 5 } },
  };
  assert.ok(
    validatePack(broken).errors.some((e) => /roundsVariant "four"/.test(e) && /rounds/.test(e)),
    "a roundsVariant whose declared rounds no longer matches its own resolved prose must be caught",
  );
});

test("validate.js's leak audit covers every roundsVariant, not just the default", () => {
  // Sweep finding: resolvedByVariant used to be built with resolveVariant(pack,
  // key) - no roundsVariantKey argument - so it always resolved against
  // pack.defaultRoundsVariant ("six"). Every check that iterates it (the
  // BANNED_VOCAB/capitalSeesTable leak audit, the unresolved-placeholder
  // check, the Block1/Block4 figure-consistency check) never once looked at
  // the "four" roundsVariant's actual resolved text. A banned term planted
  // only in a roundsVariant-specific placeholder would have passed silently.
  const broken = JSON.parse(JSON.stringify(pack));
  broken.roundsVariants.four = { ...broken.roundsVariants.four, ROUNDS_WORD: "BATNA" };
  const r = validatePack(broken);
  assert.ok(
    r.errors.some((e) => /banned vocabulary "BATNA"/.test(e) && /four/.test(e)),
    "a leak introduced only via a non-default roundsVariant must still be caught",
  );
  // The default roundsVariant's own text must be unaffected and stay clean.
  assert.ok(!validatePack(pack).errors.some((e) => /banned vocabulary/.test(e)));
});

test("the engine flag name capitalSeesTable never appears literally in prompt text", () => {
  assert.deepEqual(validatePack(pack).errors.filter((e) => /capitalSeesTable/.test(e)), []);
});

// EXPERIMENTAL (branch: caching-chronological-experiment) -----------------

test("historyBlocksFor: chronological rendering is append-only for a fixed seat", () => {
  // The whole caching design rests on this: history rendered at time T must
  // be an exact byte-prefix of history rendered at time T' > T, for the same
  // seat. If a future change to rendering breaks this (e.g. reintroducing
  // channel-grouped sections), this test catches it before it silently
  // corrupts cache hit rates.
  const viewer = pack.seats.find((s) => s.id === "eu-geneva");
  const timeline = [
    { channel: C.TABLE, seatId: "eu-geneva", round: 1, phase: "table", text: "opening position" },
    { channel: C.TABLE, seatId: "uk-geneva", round: 1, phase: "table", text: "counter" },
    { channel: C.consultChannel("eu"), seatId: "eu-geneva", round: 1, phase: "report", text: "report to brussels" },
    { channel: C.consultChannel("eu"), seatId: "eu-brussels", round: 1, phase: "instruct", text: "instruction back" },
    { channel: C.TABLE, seatId: "eu-geneva", round: 2, phase: "table", text: "round 2 move" },
  ];
  let prev = "";
  for (let i = 1; i <= timeline.length; i++) {
    const snapshot = historyBlocksFor(pack, timeline.slice(0, i), viewer);
    assert.ok(snapshot.startsWith(prev), `snapshot at step ${i} is not an extension of step ${i - 1}`);
    prev = snapshot;
  }
  assert.ok(prev.length > 0, "sanity: the final snapshot should be non-empty");
});

test("historyBlocksFor: every message carries its own inline channel label", () => {
  const viewer = pack.seats.find((s) => s.id === "eu-geneva");
  const messages = [
    { channel: C.TABLE, seatId: "eu-geneva", round: 1, phase: "table", text: "public statement" },
    { channel: C.consultChannel("eu"), seatId: "eu-brussels", round: 1, phase: "instruct", text: "private instruction" },
  ];
  const rendered = historyBlocksFor(pack, messages, viewer);
  assert.match(rendered, /AT THE TABLE/, "table message should be labelled as such");
  assert.match(rendered, /PRIVATE EXCHANGE/, "consult message should be labelled as such");
  // Order in the string should match chronological (array) order, not be
  // regrouped by channel.
  assert.ok(rendered.indexOf("public statement") < rendered.indexOf("private instruction"));
});

test("anthropicMessages: system prompt is always cache_control-tagged", async () => {
  const { anthropicMessages } = await import("../lib/model.js");
  const resolved = { modelId: "claude-sonnet-5", apiKey: "test", provider: { baseUrl: "https://api.anthropic.com/v1" } };
  const req = anthropicMessages(resolved, { instructions: "system text", input: "user text", maxTokens: 100 });
  assert.deepEqual(req.body.system, [{ type: "text", text: "system text", cache_control: { type: "ephemeral", ttl: "1h" } }]);
});

test("anthropicMessages: no cachedPrefix leaves the user turn as a plain string", async () => {
  const { anthropicMessages } = await import("../lib/model.js");
  const resolved = { modelId: "claude-sonnet-5", apiKey: "test", provider: { baseUrl: "https://api.anthropic.com/v1" } };
  const req = anthropicMessages(resolved, { instructions: "sys", input: "hello world", maxTokens: 100 });
  assert.equal(req.body.messages[0].content, "hello world");
});

test("anthropicMessages: a genuine cachedPrefix splits the user turn into two blocks that reconstruct the original text exactly", async () => {
  const { anthropicMessages } = await import("../lib/model.js");
  const resolved = { modelId: "claude-sonnet-5", apiKey: "test", provider: { baseUrl: "https://api.anthropic.com/v1" } };
  const input = "the stable history part" + "the new part this call";
  const cachedPrefix = "the stable history part";
  const req = anthropicMessages(resolved, { instructions: "sys", input, maxTokens: 100, cachedPrefix });
  const blocks = req.body.messages[0].content;
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, cachedPrefix);
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(blocks[1].cache_control, undefined, "the fresh tail must not itself be marked cacheable");
  assert.equal(blocks[0].text + blocks[1].text, input, "the two blocks must reconstruct the exact original input");
});

test("anthropicMessages: a cachedPrefix that is not an actual prefix of input is ignored, not silently truncated", async () => {
  const { anthropicMessages } = await import("../lib/model.js");
  const resolved = { modelId: "claude-sonnet-5", apiKey: "test", provider: { baseUrl: "https://api.anthropic.com/v1" } };
  const req = anthropicMessages(resolved, { instructions: "sys", input: "actual content", maxTokens: 100, cachedPrefix: "stale unrelated text" });
  assert.equal(req.body.messages[0].content, "actual content", "must fall back to the plain, complete input");
});

test("ask()'s cache bookkeeping never desyncs across a full run: offline run completes and every seat's history only grows", async () => {
  const { events } = await runInTemp({ TB_STUB_ACCEPT: "never" }, { dispositionArm: "control" }, 3);
  // Not a direct assertion on cache state (private to runNegotiation), but a
  // full run exercising every call site that now threads historyText through
  // ask() completing cleanly, with no parse/threading errors, is the
  // practical guard against the plumbing change breaking anything.
  assert.ok(events.some((e) => e.type === "table_turn"));
  assert.ok(events.every((e) => e.type !== "error"));
});
