// Semantic reconciliation - Part (c) of the settlement-detection fix.
//
// Mechanical settlement detection (detectSettlement in lib/assemble.js) is
// scalar equality across each capital's terms_decided. It is right far more
// often than it is wrong, but it has one known failure mode: two capitals
// can ratify the same underlying package while populating the one available
// slot for a two-level term (e.g. total_pool_tonnes vs uk_tranche_tonnes,
// pre-split) at different levels, or otherwise phrase the same terms in a
// way scalar comparison cannot reconcile. This module puts that question to
// a judge model instead of guessing in code.
//
// Deliberately separate from engine.js so the gating and rescue logic can be
// exercised directly in tests with a canned judge answer, without needing a
// live model call or a full runNegotiation() run.

import { buildReconciliationInstructions } from "./assemble.js";
import { callModel } from "./model.js";
import { TABLE } from "./channels.js";

/**
 * @param {object} pack
 * @param {Array<object>} capitals   capital seats, each with .id and .country
 * @param {Array<object>} messages   the run's channel-addressed message log
 * @param {number} round
 * @param {object} rawAnswers        capitalId -> raw Schema C answer (decision/terms_decided/reasoning)
 * @param {(pack:object, country:string) => object} postFor
 */
export function gatherClosingStatements(pack, capitals, messages, round, rawAnswers, postFor) {
  return capitals.map((capital) => {
    const post = postFor(pack, capital.country);
    const tableMsg = messages.find((m) => m.channel === TABLE && m.round === round && m.seatId === post.id);
    return {
      country: capital.country,
      postStatement: tableMsg ? tableMsg.text : null,
      acceptanceRationale: rawAnswers[capital.id]?.reasoning || null,
    };
  });
}

/**
 * Only called when mechanical detection failed to settle AND every decider
 * logged accept_deal (both_accept) - the gate that keeps the judge call's
 * cost proportional to how rarely a genuine both-accept scalar mismatch
 * happens. Never called for "not all deciders accepted" outcomes.
 *
 * @returns {{adjudication: object|null, rescued: boolean, judgeRes: object, closingStatements: Array<object>}}
 */
export async function reconcileSettlement({
  pack,
  capitals,
  round,
  messages,
  rawAnswers,
  postFor,
  model,
  judgeModel,
  stub,
  maxTokens = 1500,
}) {
  const closingStatements = gatherClosingStatements(pack, capitals, messages, round, rawAnswers, postFor);
  const NL = "\n";
  const judgeInput = closingStatements
    .map(
      (c) =>
        `${c.country.toUpperCase()} closing table statement:${NL}${c.postStatement || "(none)"}${NL}${NL}` +
        `${c.country.toUpperCase()} capital acceptance rationale:${NL}${c.acceptanceRationale || "(none)"}`,
    )
    .join(`${NL}${NL}---${NL}${NL}`);

  const judgeRes = await callModel({
    instructions: buildReconciliationInstructions(pack),
    input: judgeInput,
    json: true,
    maxTokens,
    stub,
    model: judgeModel || model,
  });
  const adjudication = judgeRes.parsed || null;
  // Settlement turns on same_package alone: whether the two sides ratified
  // the same underlying terms. internally_coherent is a separate diagnostic
  // dimension, not a gate - a run CAN settle on a package that is internally
  // impossible (a tranche bigger than its pool), and that is a materially
  // different failure from a deadlock, not the same one. checkCoherence
  // (independent of settlement, checked on every table turn - see
  // package_incoherent in engine.js) is the authoritative source for that
  // dimension; internally_coherent here is the judge's own cross-check,
  // recorded alongside it.
  const rescued = Boolean(adjudication && adjudication.same_package);

  return { adjudication, rescued, judgeRes, closingStatements, judgeInput };
}
