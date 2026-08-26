// Acceptance tests against the four archived S1 runs (2026-08-24, rep1) that
// motivated the settlement-detection fix: control, focal_firm_ukgva,
// accommodating, firm. These logs predate the total_pool_tonnes/
// uk_tranche_tonnes split - every acceptance event in them still carries the
// single legacy trq_volume_tonnes scalar - so they exercise the
// backward-compatibility shim (normalizeLegacyTerms) as well as the fix
// itself.
//
// The judge model cannot actually be called offline, so where a test needs
// its verdict, the verdict is supplied as a fixture - the judge's INPUT is
// still built from the real transcript text via gatherClosingStatements, but
// its OUTPUT is a canned stand-in for what a competent reader of that
// transcript would conclude (a standard way to test the code around an LLM
// judge without a live, non-deterministic call). What that reasonably
// concludes is checked directly against the transcript excerpts quoted in
// each test below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { pack } from "../public/scenarios/s1-article-xxviii-steel.js";
import { pollToProposal, detectSettlement, checkCoherence } from "../lib/assemble.js";
import { reconcileSettlement } from "../lib/reconcile.js";
import * as C from "../lib/channels.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "runs", "evaluation runs");

function loadRun(filename) {
  const path = join(fixturesDir, filename);
  return readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

const capitals = C.capitalSeats(pack);
const postFor = C.postFor;

/** Round-6 acceptance events, keyed by country, normalised through the same
 *  pollToProposal() the engine itself uses on a live poll answer. */
function round6Polled(events) {
  const acc = events.filter((e) => e.type === "acceptance" && e.round === 6);
  const polled = {};
  const rawAnswers = {};
  for (const capital of capitals) {
    const e = acc.find((a) => a.country === capital.country);
    rawAnswers[capital.id] = { decision: "accept_deal", terms_decided: e.terms_decided, reasoning: e.reasoning };
    polled[capital.id] = pollToProposal(pack, rawAnswers[capital.id]);
  }
  return { polled, rawAnswers };
}

function messagesFromRound(events, round) {
  return events
    .filter((e) => e.type === "table_turn" && e.round === round)
    .map((e) => ({ channel: C.TABLE, seatId: e.seatId, round, phase: "table", text: e.public_message }));
}

// --- control: 1,050,000 pool / 850,000 tranche, coherent --------------------

test("fixture control: mechanical detection fails on the legacy split, judge reconciliation settles it correctly", async () => {
  const events = loadRun("s1-article-xxviii-steel__arm-control__rep1__2026-08-24T19-41-35-713Z.jsonl");
  const { polled, rawAnswers } = round6Polled(events);
  const deciderIds = capitals.map((s) => s.id);

  // Legacy trq_volume_tonnes maps onto total_pool_tonnes only, at each
  // side's own figure (1,050,000 vs 850,000) - so mechanical detection fails
  // on total_pool_tonnes before it even reaches the unset uk_tranche_tonnes.
  // Exactly the original bug: the two sides populated the one available
  // slot at different levels of the pool/tranche structure.
  const mechanical = detectSettlement(pack, deciderIds, polled);
  assert.equal(mechanical.settled, false);
  assert.match(mechanical.reason, /total_pool_tonnes/);

  const messages = messagesFromRound(events, 6);
  // Both closing statements literally say "UK-specific tranche of 850,000
  // tonnes within a total enlarged TRQ envelope of 1,050,000 tonnes" - a
  // competent reader recovers the split from prose even though neither
  // side's structured answer carried it.
  const stub = {
    same_package: true,
    differences: [],
    internally_coherent: true,
    incoherence: [],
    reconciled_terms: {
      total_pool_tonnes: 1050000, uk_tranche_tonnes: 850000, allocation: "country_specific",
      out_of_quota_rate_pct: 23, duration_years: 3, review_clause: true,
    },
  };
  const { adjudication, rescued } = await reconcileSettlement({
    pack, capitals, round: 6, messages, rawAnswers, postFor, stub,
  });
  assert.equal(rescued, true);
  assert.equal(adjudication.reconciled_terms.total_pool_tonnes, 1050000);
  assert.equal(adjudication.reconciled_terms.uk_tranche_tonnes, 850000);
  assert.equal(checkCoherence(pack, adjudication.reconciled_terms).incoherent, false);
});

// --- focal_firm_ukgva: 870,000 pool / 620,000 tranche, coherent -------------

test("fixture focal_firm_ukgva: judge reconciliation settles pool/tranche despite a duration_years drafting slip", async () => {
  const events = loadRun("s1-article-xxviii-steel__arm-focal_firm_ukgva__rep1__2026-08-24T21-20-23-021Z.jsonl");
  const { polled, rawAnswers } = round6Polled(events);
  const deciderIds = capitals.map((s) => s.id);

  const mechanical = detectSettlement(pack, deciderIds, polled);
  assert.equal(mechanical.settled, false);

  const messages = messagesFromRound(events, 6);
  // EU's own reasoning: "870,000t pool, 620,000t UK-specific tranche" and
  // "The three-year/four-year discrepancy in the UK's closing recap is a
  // drafting slip, not a substantive gap" - both figures below are taken
  // directly from that transcript.
  const stub = {
    same_package: true,
    differences: ["duration_years: EU said four years, UK's closing recap said three - EU calls this a drafting slip"],
    internally_coherent: true,
    incoherence: [],
    reconciled_terms: {
      total_pool_tonnes: 870000, uk_tranche_tonnes: 620000, allocation: "country_specific",
      out_of_quota_rate_pct: 30, duration_years: 4, review_clause: true,
    },
  };
  const { adjudication, rescued } = await reconcileSettlement({
    pack, capitals, round: 6, messages, rawAnswers, postFor, stub,
  });
  assert.equal(rescued, true);
  assert.equal(adjudication.reconciled_terms.total_pool_tonnes, 870000);
  assert.equal(adjudication.reconciled_terms.uk_tranche_tonnes, 620000);
  assert.equal(checkCoherence(pack, adjudication.reconciled_terms).incoherent, false);
});

// --- accommodating: settled AND package_incoherent, raised at round 2 ------

test("fixture accommodating: package_incoherent is raised at round 2 using the transcript's own figures", () => {
  const events = loadRun("s1-article-xxviii-steel__arm-accommodating__rep1__2026-08-24T20-54-07-920Z.jsonl");
  // The archived log's round-2 structured proposal for eu-geneva is null
  // (a separate parsing gap, not something this fix addresses) - but the
  // public_message is explicit: "a total global TRQ of 600,000 tonnes ...
  // Within that, we propose a UK country-specific share of approximately
  // 1.35 million tonnes." Populated into the new two-field schema, that is
  // exactly the incoherence checkCoherence exists to catch, and exactly
  // the round it was first tabled.
  const round2 = events.filter((e) => e.type === "table_turn" && e.round === 2);
  const euRound2 = round2.find((e) => e.seatId === "eu-geneva");
  assert.match(euRound2.public_message, /600,000 tonnes/);
  assert.match(euRound2.public_message, /1\.35 million tonnes/);

  const asPopulated = { total_pool_tonnes: 600000, uk_tranche_tonnes: 1350000 };
  const coherence = checkCoherence(pack, asPopulated);
  assert.equal(coherence.incoherent, true);
  assert.equal(coherence.reasons[0].part, "uk_tranche_tonnes");
});

test("fixture accommodating: both capitals ratified the SAME broken package - judge settles it, distinct from a genuine deadlock", async () => {
  const events = loadRun("s1-article-xxviii-steel__arm-accommodating__rep1__2026-08-24T20-54-07-920Z.jsonl");
  const { polled, rawAnswers } = round6Polled(events);
  const deciderIds = capitals.map((s) => s.id);

  const mechanical = detectSettlement(pack, deciderIds, polled);
  assert.equal(mechanical.settled, false);

  // Per the archived acceptance events, EU logged 800,000 and UK logged
  // 1,800,000 against the single legacy field. Read together with the round
  // 5/6 table exchange, both sides are ratifying the SAME package - an
  // 800,000t pool with an (impossible) 1,800,000t UK tranche inside it - not
  // two different packages. same_package therefore reads true; the package
  // is nonetheless impossible, which is a materially different failure mode
  // from a deadlock and must be visible as such, not silently swallowed by
  // treating it as a clean settlement.
  const messages = messagesFromRound(events, 6);
  const stub = {
    same_package: true,
    differences: [],
    internally_coherent: false,
    incoherence: ["uk_tranche_tonnes (1,800,000) exceeds total_pool_tonnes (800,000)"],
    reconciled_terms: {
      total_pool_tonnes: 800000, uk_tranche_tonnes: 1800000, allocation: "country_specific",
      out_of_quota_rate_pct: 22, duration_years: 5, review_clause: true,
    },
  };
  const { adjudication, rescued } = await reconcileSettlement({
    pack, capitals, round: 6, messages, rawAnswers, postFor, stub,
  });
  assert.equal(rescued, true, "same_package alone gates settlement - incoherence is a separate dimension, not a blocker");
  assert.equal(checkCoherence(pack, adjudication.reconciled_terms).incoherent, true,
    "the settled package must still be flagged incoherent, independent of the settlement decision");
});

// --- firm: genuine non-agreement, EU decision classified accept_default ----

test("fixture firm: EU's round 6 reasoning describes walking away onto the default, not accepting a package", () => {
  const events = loadRun("s1-article-xxviii-steel__arm-firm__rep1__2026-08-24T20-22-24-391Z.jsonl");
  const euAccept = events.find((e) => e.type === "acceptance" && e.round === 6 && e.country === "eu");
  // The archived log predates accept_deal/accept_default and only has the
  // old boolean-ish "accept", but the reasoning is unambiguous about which
  // of the two it actually was.
  assert.equal(euAccept.decision, "accept");
  assert.match(euAccept.reasoning, /notified default/);
  assert.match(euAccept.reasoning, /walk-away instructions/);
  // Under the new schema this is accept_default, not accept_deal - so it
  // must not count toward acceptCount or gate the judge pass. See the
  // engine-level test "only accept_deal counts toward acceptCount" for the
  // mechanical enforcement.
});

test("fixture firm: the judge pass must not rescue a genuine disagreement (regression against over-eager settlement)", async () => {
  const events = loadRun("s1-article-xxviii-steel__arm-firm__rep1__2026-08-24T20-22-24-391Z.jsonl");
  const { polled, rawAnswers } = round6Polled(events);
  const deciderIds = capitals.map((s) => s.id);

  const mechanical = detectSettlement(pack, deciderIds, polled);
  assert.equal(mechanical.settled, false);

  const messages = messagesFromRound(events, 6);
  // EU tables 100,000t as a fixed carve-out of its OWN 400,000t global pool;
  // UK's closing statement independently frames the package around a
  // "guaranteed country-specific 100,000t allocation" against a wholly
  // different no-deal comparator. These are not a pool/tranche split of one
  // package - EU's own reasoning states it proceeded to the notified default
  // specifically because no unconditional acceptance was secured. A correct
  // judge reads this as two different packages.
  const stub = {
    same_package: false,
    differences: ["EU is proceeding to its notified default; UK is describing acceptance of a negotiated package that EU never confirmed as final and mutual"],
    internally_coherent: true,
    incoherence: [],
    reconciled_terms: Object.fromEntries(pack.proposal.settlementTerms.map((t) => [t.key, null])),
  };
  const { rescued } = await reconcileSettlement({
    pack, capitals, round: 6, messages, rawAnswers, postFor, stub,
  });
  assert.equal(rescued, false, "the fix must not simply make everything settle");
});
