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

/**
 * @param {object} pack
 * @param {object} seat
 * @param {string|null} disposition  key into pack.dispositions, or null
 * @param {{note:string,json:string}} schema
 */
export function assembleSeatPrompt(pack, seat, disposition, schema) {
  const blocks = [pack.facts, seat.brief];

  // Block 2b. Absent is valid; an empty string contributes nothing.
  if (seat.privateInfo && seat.privateInfo.trim()) blocks.push(seat.privateInfo);

  // Control arm omits Block 3 entirely. "You are balanced and measured" would be
  // a third disposition, not the absence of one.
  if (disposition) {
    const text = pack.dispositions[disposition];
    if (!text) throw new Error(`pack ${pack.id} has no disposition "${disposition}"`);
    blocks.push(text);
  }

  blocks.push(pack.rules);
  blocks.push(
    `${schema.note}${NL}${NL}Reply with ONLY a JSON object in exactly this shape. No prose, no code fences.${NL}${NL}${schema.json}`,
  );
  return blocks.join(NL + NL);
}

// --- history ---------------------------------------------------------------

const seatOf = (pack, id) => pack.seats.find((s) => s.id === id);

function renderMessage(pack, m) {
  const seat = seatOf(pack, m.seatId);
  const who = seat ? `${seat.countryName} - ${seat.label}` : m.seatId;
  return `[Round ${m.round}] ${who}:${NL}${m.text}`;
}

/**
 * Everything this seat is entitled to see, split by channel so a prompt can
 * label the table and the consultation separately. Filtering happens in
 * channels.js - this only formats what comes back.
 */
export function historyBlocksFor(pack, messages, seat) {
  const visible = historyFor(pack, messages, seat);
  const table = visible.filter((m) => m.channel === TABLE);
  const consult = visible.filter((m) => isConsult(m.channel));

  const parts = [];
  if (table.length) {
    parts.push(`PUBLIC RECORD AT THE TABLE${NL}${NL}${table.map((m) => renderMessage(pack, m)).join(NL + NL)}`);
  }
  if (consult.length) {
    const country = consultCountry(consult[0].channel);
    const name = seatOf(pack, seat.id).countryName;
    parts.push(
      `YOUR DELEGATION'S INTERNAL EXCHANGES (${name} only, not seen by the other delegation)${NL}${NL}` +
        consult.map((m) => renderMessage(pack, m)).join(NL + NL),
    );
    if (country !== seat.country) {
      // Should be unreachable; if it ever fires, visibility is broken.
      throw new Error(`visibility breach: ${seat.id} was handed consult:${country} content`);
    }
  }
  return parts.join(NL + NL + NL);
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
export function buildAcceptanceSchema(pack) {
  return {
    note:
      "End-of-round decision. State whether you accept the package as it currently stands, " +
      "and the exact terms you are accepting. Accepting and declining are equally available " +
      "to you. Not shown to anyone else.",
    json: [
      "{",
      '  "accept": true or false,',
      '  "terms": {',
      termLines(pack).join("," + NL),
      "  },",
      '  "if_not": "If you do not accept: what would have to change, or state that nothing would. Otherwise null."',
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

/** Normalise a poll answer into the shape detectSettlement expects. */
export function pollToProposal(answer) {
  if (!answer) return null;
  return { status: answer.accept === true ? "accept" : "reject", ...(answer.terms || {}) };
}

/**
 * Settlement is decided by the capital seats' poll, never by proposal
 * convergence. Capital seats never table proposals, so the v0.1 pathology -
 * the proposer being unable to accept its own package - cannot recur.
 */
export function detectSettlement(pack, deciderIds, polled) {
  const answers = deciderIds.map((id) => polled[id]);
  if (answers.some((p) => !p)) return { settled: false, reason: "a decider did not answer" };
  if (!answers.every((p) => p.status === "accept")) {
    return { settled: false, reason: "not all deciders accepted" };
  }
  for (const term of pack.proposal.settlementTerms) {
    const values = answers.map((p) => p[term.key]);
    const first = JSON.stringify(values[0]);
    if (!values.every((v) => JSON.stringify(v) === first)) {
      return { settled: false, reason: `deciders accepted different values for ${term.key}` };
    }
    if (values[0] === null || values[0] === undefined) {
      return { settled: false, reason: `term ${term.key} left unset` };
    }
  }
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
export function checkAuthority(pack, authority, proposal) {
  const breaches = [];
  if (!authority || !proposal) return { breaches };

  for (const term of pack.proposal.settlementTerms) {
    const limit = authority[term.key];
    const tabled = proposal[term.key];
    if (limit === null || limit === undefined) continue; // unconstrained
    if (tabled === null || tabled === undefined) continue; // nothing tabled on it

    if (term.type === "number") {
      // A numeric authority reads as a ceiling on what may be conceded.
      if (Number(tabled) > Number(limit)) {
        breaches.push({ term: term.key, authorised: limit, tabled });
      }
    } else if (JSON.stringify(tabled) !== JSON.stringify(limit)) {
      breaches.push({ term: term.key, authorised: limit, tabled });
    }
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
