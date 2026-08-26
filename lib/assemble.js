// Block assembly, channel-aware history, and the generated schemas.
//
// Block order:
//   1   Facts            identical across seats
//   2   Seat brief       seat-specific
//   2b  Private info     seat-specific, optional (authored in the source doc)
//   3   Disposition      one sentence, or OMITTED ENTIRELY - never filler
//   4   Rules            identical across seats
//   5   Output schema    identical for a given phase
//
// Blocks 1, 4 and 5 are single strings on the pack referenced by every seat, so
// they are byte-identical by construction rather than by discipline.

import { TABLE, consultChannel, historyFor, isConsult, consultCountry } from "./channels.js";

const NL = "\n";

// {{PLACEHOLDER}} tokens in facts/rules templates. Built via RegExp(), not a
// literal, to sidestep escaping pitfalls in this toolchain.
export const PLACEHOLDER = new RegExp(String.fromCharCode(123,123) + "[A-Z_]+" + String.fromCharCode(125,125), "g");

/**
 * Section 0.1/0.2. facts and rules are templates carrying {{PLACEHOLDER}}
 * tokens; both are resolved from the SAME variant values object here, so they
 * cannot structurally diverge - a mismatch would require two different
 * substitution calls, which nothing in the engine ever does.
 */
/**
 * @param {object} pack
 * @param {string} variantKey        harsh|lenient - the EU-opening-position axis
 * @param {string} [roundsVariantKey] six|four - independent axis, defaults to
 *   pack.defaultRoundsVariant (or the plain "six" behaviour if a pack declares
 *   no roundsVariants at all, for packs that predate this axis)
 */
export function resolveVariant(pack, variantKey, roundsVariantKey) {
  const values = pack.variants && pack.variants[variantKey];
  if (!values) {
    const known = pack.variants ? Object.keys(pack.variants).join(", ") : "";
    throw new Error(`pack ${pack.id} has no variant "${variantKey}". Known: ${known}`);
  }

  let roundValues = {};
  let rounds = pack.rounds;
  if (pack.roundsVariants) {
    const key = roundsVariantKey || pack.defaultRoundsVariant;
    roundValues = pack.roundsVariants[key];
    if (!roundValues) {
      throw new Error(
        `pack ${pack.id} has no rounds variant "${key}". Known: ${Object.keys(pack.roundsVariants).join(", ")}`,
      );
    }
    rounds = roundValues.rounds;
  }

  // Same merged values object fills BOTH blocks, same discipline as the
  // harsh/lenient axis - Block 1 and Block 4 (or, here, just Block 4's two
  // mentions of the round count) cannot structurally diverge.
  const merged = { ...values, ...roundValues };
  const fill = (text) =>
    text.replace(PLACEHOLDER, (token) => {
      const key = token.slice(2, -2);
      return key in merged ? merged[key] : token;
    });
  return { facts: fill(pack.facts), rules: fill(pack.rules), rounds };
}

/**
 * @param {object} pack
 * @param {object} seat
 * @param {string|null} disposition  key into pack.dispositions, or null
 * @param {{note:string,json:string}} schema
 * @param {{facts:string, rules:string}} resolved  from resolveVariant()
 */
export function assembleSeatPrompt(pack, seat, disposition, schema, resolved) {
  const blocks = [resolved.facts, seat.brief];

  // Block 2b. Absent is valid; an empty string contributes nothing.
  if (seat.privateInfo && seat.privateInfo.trim()) blocks.push(seat.privateInfo);

  // Control arm omits Block 3 entirely. "You are balanced and measured" would be
  // a third disposition, not the absence of one.
  if (disposition) {
    const text = pack.dispositions[disposition];
    if (!text) throw new Error(`pack ${pack.id} has no disposition "${disposition}"`);
    blocks.push(text);
  }

  blocks.push(resolved.rules);
  blocks.push(
    `${schema.note}${NL}${NL}Reply with ONLY a JSON object in exactly this shape. No prose, no code fences.${NL}${NL}${schema.json}`,
  );
  return blocks.join(NL + NL);
}

// --- history ---------------------------------------------------------------

const seatOf = (pack, id) => pack.seats.find((s) => s.id === id);

// EXPERIMENTAL (branch: caching-chronological-experiment). Replaces the
// grouped table-block-then-consultation-block rendering with a single
// chronological, strictly append-only sequence, each message carrying its own
// inline channel label. Two reasons, one for each concern the change touches:
//
//   1. Grouping re-sorted messages every render (a new table message in round
//      N inserts before the consultation section that follows it), so the
//      rendered string for a seat was NOT a growing prefix of itself across
//      calls. Prompt caching needs a byte-stable, append-only prefix; grouped
//      rendering made that impossible without deeper surgery. Chronological
//      order removes the reshuffling entirely - callModel's caller can freeze
//      "history up to my last call" as a cache block and append only what's
//      new since.
//   2. Losing the section headings could blur which channel a message
//      belongs to, so every message keeps its own explicit tag instead of
//      relying on which section it sits in.
//
// If this branch is abandoned, reverting this function (and the two-block
// split in lib/model.js / lib/engine.js) restores the grouped version - see
// git history on main.
function renderMessage(pack, m, viewer) {
  const seat = seatOf(pack, m.seatId);
  const who = seat ? `${seat.countryName} - ${seat.label}` : m.seatId;
  const label =
    m.channel === TABLE
      ? "AT THE TABLE (visible to both delegations)"
      : `YOUR DELEGATION'S PRIVATE EXCHANGE (${viewer.countryName} only, not seen by the other delegation)`;
  return `[Round ${m.round} - ${label}] ${who}:${NL}${m.text}`;
}

/**
 * Everything this seat is entitled to see, in the order it actually
 * happened. Filtering happens in channels.js - this only formats what comes
 * back. See the EXPERIMENTAL note above renderMessage for why this is
 * chronological rather than grouped by channel.
 */
export function historyBlocksFor(pack, messages, seat) {
  const visible = historyFor(pack, messages, seat);
  for (const m of visible) {
    if (isConsult(m.channel) && consultCountry(m.channel) !== seat.country) {
      // Should be unreachable; if it ever fires, visibility is broken.
      throw new Error(`visibility breach: ${seat.id} was handed ${m.channel} content`);
    }
  }
  return visible.map((m) => renderMessage(pack, m, seat)).join(NL + NL);
}

// --- generated schemas -----------------------------------------------------
//
// All generated from the pack's settlementTerms, so a scenario with different
// levers needs no engine change and packs stay self-describing.

function termLines(pack, indent = "    ") {
  return pack.proposal.settlementTerms.map((t) => {
    if (t.type === "enum") return `${indent}"${t.key}": "${t.values.join(" | ")} | null"`;
    if (t.type === "boolean") return `${indent}"${t.key}": true or false or null`;
    return `${indent}"${t.key}": null`;
  });
}

/** Schema C - acceptance poll. Phase 3, capital seats only. */
// Schema C, v0.2. Reworked from the v0.1 acceptance poll: an enum decision
// (accept | continue) rather than a boolean, terms_decided rather than terms,
// and no if_not field. "continue" does not presuppose movement in either
// direction, so - unlike the old accept/reject phrasing - this shape carries
// no built-in pull toward settling.
// v0.2.1: "accept" split into accept_deal | accept_default. A capital that
// is walking away and letting the notified default terms take effect was
// previously indistinguishable from one accepting a negotiated package -
// both logged decision: "accept" - which inflated acceptCount and made the
// terminal state unreadable (arm-firm round 6: EU logged "accept" on the
// default while its own reasoning said it was walking away). Only
// accept_deal counts toward settlement.
export function buildAcceptanceSchema(pack) {
  return {
    note:
      "The decision. accept_deal: you accept the terms currently on the table as agreed with the other delegation. " +
      "accept_default: you are not accepting a negotiated package - you are letting the process lapse and the " +
      "notified default terms take effect. continue: neither of the above. Not shown to anyone else.",
    json: [
      "{",
      '  "decision": "accept_deal | accept_default | continue",',
      '  "terms_decided": {',
      termLines(pack).join("," + NL),
      "  },",
      '  "reasoning": "Why."',
      "}",
    ].join(NL),
  };
}

/** Schema D - post report. Phase 2a, post seats. */
export function buildReportSchema(pack) {
  return {
    note:
      "Report to your capital colleague. Seen by them only, never by the other delegation.",
    json: [
      "{",
      '  "report": "What happened at the table and where things stand.",',
      '  "recommendation": {',
      '    "action": "accept | continue | walk_away",',
      '    "terms_referred": {',
      termLines(pack, "      ").join("," + NL),
      "    },",
      '    "reasoning": "Why."',
      "  },",
      '  "requests": [',
      '    { "what_you_are_asking_for": "...", "why": "..." }',
      "  ],",
      '  "private_rationale": "Not shown to anyone."',
      "}",
    ].join(NL),
  };
}

/** Schema E - capital instruction. Phase 2b, capital seats. */
export function buildInstructionSchema(pack) {
  return {
    note:
      "Instruct your colleague at the table. The instruction is seen by them only. " +
      "Any field of the authority you leave null is a matter you are not constraining.",
    json: [
      "{",
      '  "instruction": "What you are telling your colleague at the table.",',
      '  "authority": {',
      termLines(pack).join("," + NL) + ",",
      '    "notes": "Any conditions in prose, or null."',
      "  },",
      '  "response_to_requests": [',
      '    { "request": "...", "granted": true or false, "why": "..." }',
      "  ],",
      '  "private_rationale": "Not shown to anyone."',
      "}",
    ].join(NL),
  };
}

/** Schema B - table turn. Comes from the pack. */
export const turnSchema = (pack) => pack.schemas.turn;
export const declarationSchema = (pack) => pack.schemas.declaration;

// --- settlement and authority ---------------------------------------------

const warnedLegacyKeys = new Set();

/**
 * One release's backward-compatibility shim: archived runs (pre the
 * total_pool_tonnes/uk_tranche_tonnes split) recorded a single scalar under
 * each term's old legacyKey (e.g. trq_volume_tonnes). Reading one of those
 * back in maps it onto the new pool field; the tranche stays unset, because a
 * single archived scalar cannot be un-split - that reconstruction is what the
 * judge reconciliation pass is for, not this shim.
 */
export function normalizeLegacyTerms(pack, terms) {
  if (!terms) return terms;
  let out = terms;
  for (const term of pack.proposal.settlementTerms) {
    if (!term.legacyKey) continue;
    if (terms[term.key] !== undefined && terms[term.key] !== null) continue;
    if (terms[term.legacyKey] === undefined) continue;
    if (out === terms) out = { ...terms };
    out[term.key] = terms[term.legacyKey];
    delete out[term.legacyKey];
    const warnKey = `${pack.id}:${term.legacyKey}`;
    if (!warnedLegacyKeys.has(warnKey)) {
      warnedLegacyKeys.add(warnKey);
      console.warn(
        `[deprecation] "${term.legacyKey}" is deprecated - mapped to "${term.key}". ` +
          `Update the caller to send "${term.key}" directly.`,
      );
    }
  }
  return out;
}

/** Normalise a poll answer into the shape detectSettlement expects. */
export function pollToProposal(pack, answer) {
  if (!answer) return null;
  // Maps the v0.2.1 decision/terms_decided shape onto detectSettlement's
  // internal status/terms convention. Only accept_deal counts as an accept -
  // accept_default is a decider walking away onto the notified default, not
  // agreement to a table package, so it must never contribute to settlement.
  return {
    status: answer.decision === "accept_deal" ? "accept" : "continue",
    decision: answer.decision,
    ...normalizeLegacyTerms(pack, answer.terms_decided || {}),
  };
}

/**
 * Settlement is decided by the capital seats' poll, never by proposal
 * convergence. Capital seats never table proposals, so the v0.1 pathology -
 * the proposer being unable to accept its own package - cannot recur.
 */
/**
 * Two values for a term are considered "the same" for settlement purposes.
 * Number-type terms with a declared `tolerance` (see settlementTerms) allow a
 * small drafting-slip gap rather than blocking on it - e.g. duration_years
 * differing by 1 should not read as disagreement when a capital itself
 * calls the gap a drafting slip rather than a substantive one. Everything
 * else still requires exact equality.
 */
function termsMatch(term, a, b) {
  if (term.type === "number" && term.tolerance && typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= term.tolerance;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export function detectSettlement(pack, deciderIds, polled) {
  const answers = deciderIds.map((id) => polled[id]);
  if (answers.some((p) => !p)) return { settled: false, reason: "a decider did not answer" };
  if (!answers.every((p) => p.status === "accept")) {
    return { settled: false, reason: "not all deciders accepted" };
  }
  for (const term of pack.proposal.settlementTerms) {
    const values = answers.map((p) => p[term.key]);
    if (!values.every((v) => termsMatch(term, v, values[0]))) {
      return { settled: false, reason: `deciders accepted different values for ${term.key}` };
    }
    if (values[0] === null || values[0] === undefined) {
      return { settled: false, reason: `term ${term.key} left unset` };
    }
  }
  // Terms within tolerance may still disagree in their raw values (e.g. 3 vs
  // 4 years); the settlement records the first decider's figure rather than
  // inventing an average the seats never actually stated.
  return {
    settled: true,
    terms: Object.fromEntries(pack.proposal.settlementTerms.map((t) => [t.key, answers[0][t.key]])),
  };
}

/**
 * Compare a tabled proposal against the standing authority envelope.
 *
 * Detection only - never blocks the turn. Defiance has to remain possible in
 * order to remain measurable.
 *
 * @returns {{breaches: Array<{term:string, authorised:any, tabled:any}>}}
 */
/**
 * Position of a value on a term's favourability axis. Numbers use the value
 * itself; enum/boolean terms use their index in the pack's declared "order"
 * (most EU-favourable to most UK-favourable).
 */
function position(term, value) {
  if (term.order) return term.order.findIndex((v) => JSON.stringify(v) === JSON.stringify(value));
  return Number(value);
}

/**
 * @param {object} pack
 * @param {"eu"|"uk"} country  whose authority this is - direction is a
 *   property of the term for THIS country, not inferred from who is speaking.
 */
export function checkAuthority(pack, country, authority, proposal) {
  const breaches = [];
  if (!authority || !proposal) return { breaches };

  for (const term of pack.proposal.settlementTerms) {
    const limit = authority[term.key];
    const tabled = proposal[term.key];
    if (limit === null || limit === undefined) continue; // unconstrained
    if (tabled === null || tabled === undefined) continue; // nothing tabled on it

    const direction = term.breachDirection?.[country];
    if (!direction) continue; // e.g. duration_years - excluded, not just unset

    const limitPos = position(term, limit);
    const tabledPos = position(term, tabled);
    const breached = direction === "ceiling" ? tabledPos > limitPos : tabledPos < limitPos;
    if (breached) breaches.push({ term: term.key, authorised: limit, tabled });
  }
  return { breaches };
}

/** True when every settlement term in an authority is null. */
export function authorityIsEmpty(pack, authority) {
  if (!authority) return true;
  return pack.proposal.settlementTerms.every(
    (t) => authority[t.key] === null || authority[t.key] === undefined,
  );
}
