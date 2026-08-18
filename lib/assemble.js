// Block assembly, per the v0.1 prompts doc:
//
//   [BLOCK 1 - Facts]        identical for all seats, verbatim
//   [BLOCK 2 - Seat brief]   seat-specific
//   [BLOCK 3 - Disposition]  one sentence, or OMITTED ENTIRELY in the control arm
//   [BLOCK 4 - Rules]        identical for all seats, verbatim
//   [BLOCK 5 - Output schema] identical for all seats, verbatim
//
// Blocks 1, 4 and 5 come from single strings on the pack, so they are identical
// across seats by construction rather than by discipline.

/**
 * @param {object} pack
 * @param {object} seat
 * @param {string|null} disposition  key into pack.dispositions, or null for control
 * @param {"declaration"|"turn"} schemaKey
 */
export function assembleSeatPrompt(pack, seat, disposition, schemaKey) {
  const schema = pack.schemas[schemaKey];
  const blocks = [pack.facts, seat.brief];

  // Control arm: omit Block 3 entirely. No neutral filler - "you are balanced
  // and measured" would be a third disposition, not the absence of one.
  if (disposition) {
    const text = pack.dispositions[disposition];
    if (!text) throw new Error(`pack ${pack.id} has no disposition "${disposition}"`);
    blocks.push(text);
  }

  blocks.push(pack.rules);
  blocks.push(`${schema.note}\n\nReply with ONLY a JSON object in exactly this shape. No prose, no code fences.\n\n${schema.json}`);

  return blocks.join("\n\n");
}

/** The shared public record. Only public_message is ever visible to other seats. */
export function renderTranscript(pack, turns) {
  if (!turns.length) return "";
  return turns
    .map((t) => {
      const seat = pack.seats.find((s) => s.id === t.seatId);
      return `[Round ${t.round}] ${seat.partyName} - ${seat.label}:\n${t.publicMessage}`;
    })
    .join("\n\n");
}

/**
 * Settlement detection reads the structured proposal object, never the prose.
 * Per Block 4: all seats accept the same terms in the same round.
 */
export function detectSettlement(pack, roundProposals) {
  const seatIds = pack.seats.map((s) => s.id);
  const proposals = seatIds.map((id) => roundProposals[id]);
  if (proposals.some((p) => !p)) return { settled: false, reason: "missing proposal" };
  if (!proposals.every((p) => p.status === "accept")) {
    return { settled: false, reason: "not all seats accepted" };
  }
  for (const term of pack.proposal.settlementTerms) {
    const values = proposals.map((p) => p[term.key]);
    const first = JSON.stringify(values[0]);
    if (!values.every((v) => JSON.stringify(v) === first)) {
      return { settled: false, reason: `seats accepted different values for ${term.key}` };
    }
    if (values[0] === null || values[0] === undefined) {
      return { settled: false, reason: `term ${term.key} left unset` };
    }
  }
  return {
    settled: true,
    terms: Object.fromEntries(pack.proposal.settlementTerms.map((t) => [t.key, proposals[0][t.key]])),
  };
}
