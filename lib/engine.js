// Headless negotiation over a scenario pack. Every seat is played by a model.
//
// Turn structure follows the v0.1 prompts doc: one pre-game declaration turn
// (Schema A), then N rounds (Schema B) in fixed speaking order. Settlement is
// read from the structured proposal object, never from the prose.

import { getPack, defaultPackId } from "../public/scenarios/index.js";
import { validatePack } from "./validate.js";
import { assembleSeatPrompt, renderTranscript, detectSettlement, pollToProposal } from "./assemble.js";
import { callModel, isLive, modelName } from "./model.js";
import { openRun } from "./log.js";
import { declarationStub, turnStub, acceptanceStub } from "./stubs.js";

/** Disposition is applied whole-table: every seat gets the same arm, or none. */
const dispositionFor = (condition) =>
  condition.dispositionArm === "control" ? null : condition.dispositionArm;

export async function runNegotiation({
  packId = defaultPackId,
  condition = { dispositionArm: "control" },
  repeat = 1,
  onEvent = () => {},
} = {}) {
  const pack = getPack(packId);
  if (!pack) throw new Error(`unknown scenario pack: ${packId}`);

  if (pack.placeholder) {
    throw new Error(`"${pack.label}" is a placeholder with no prompt text yet - nothing to run.`);
  }

  const check = validatePack(pack);
  if (!check.ok) throw new Error(`pack failed validation: ${check.errors.join("; ")}`);

  const disposition = dispositionFor(condition);
  const seats = pack.speakingOrder.map((id) => pack.seats.find((s) => s.id === id));

  const config = {
    scenarioId: pack.id,
    packVersion: pack.version,
    condition,
    repeat,
    model: modelName(),
    live: isLive(),
    rounds: pack.rounds,
  };

  const run = openRun(config, {
    id: pack.id,
    label: pack.label,
    version: pack.version,
    seats: pack.seats.map((s) => ({ id: s.id, label: s.label, party: s.party })),
    speakingOrder: pack.speakingOrder,
    settlementTerms: pack.proposal.settlementTerms.map((t) => t.key),
    validationWarnings: check.warnings,
  });
  await run.start();

  const turns = [];
  let terminal = "rounds_exhausted";
  let settlement = null;

  try {
    // Pre-game declaration: a separate turn, before Round 1.
    for (const seat of seats) {
      const res = await callModel({
        instructions: assembleSeatPrompt(pack, seat, disposition, "declaration"),
        input: "This is the pre-game declaration turn. Answer before the negotiation begins.",
        json: true,
        maxTokens: 3000,
        stub: declarationStub(pack, seat),
      });
      await run.log("pregame_declaration", {
        seatId: seat.id,
        declaration: res.parsed,
        truncated: Boolean(res.truncated),
        raw: res.parsed ? undefined : res.text,
        usage: res.usage,
      });
      onEvent({ type: "pregame", seat, declaration: res.parsed });
    }

    for (let round = 1; round <= pack.rounds; round++) {
      const roundProposals = {};

      for (const seat of seats) {
        const transcript = renderTranscript(pack, turns);
        const res = await callModel({
          instructions: assembleSeatPrompt(pack, seat, disposition, "turn"),
          input: transcript
            ? `Public record so far:\n\n${transcript}\n\nThis is Round ${round}. It is your turn.`
            : `This is Round ${round}. You speak first; there is nothing on the public record yet.`,
          json: true,
          maxTokens: 3500,
          stub: turnStub(pack, seat, round),
        });

        const t = res.parsed || {};
        const publicMessage = t.public_message || "(no parseable public message)";
        roundProposals[seat.id] = t.proposal || null;
        turns.push({ seatId: seat.id, round, publicMessage });

        // public_message goes to the shared record; the rest to the log only.
        await run.log("turn", {
          round,
          seatId: seat.id,
          public_message: publicMessage,
          proposal: t.proposal ?? null,
          expectations: t.expectations ?? null,
          private_rationale: t.private_rationale ?? null,
          parsed: Boolean(res.parsed),
          truncated: Boolean(res.truncated),
          raw: res.parsed ? undefined : res.text,
          usage: res.usage,
        });
        onEvent({ type: "turn", round, seat, publicMessage, proposal: t.proposal });
      }

      // Whether the tabled proposals happen to coincide. Recorded as a signal;
      // it is NOT what decides the game.
      const convergence = detectSettlement(pack, roundProposals);

      // End-of-round acceptance poll. This is what decides settlement: each seat
      // states independently whether it accepts the package now on the table.
      const polled = {};
      for (const seat of seats) {
        const transcript = renderTranscript(pack, turns);
        const res = await callModel({
          instructions: assembleSeatPrompt(pack, seat, disposition, "acceptance"),
          input: `Public record:

${transcript}

Round ${round} has closed. State whether you accept the package as it currently stands.`,
          json: true,
          maxTokens: 1500,
          stub: acceptanceStub(pack, seat),
        });
        const answer = res.parsed || null;
        polled[seat.id] = pollToProposal(answer);
        await run.log("acceptance", {
          round,
          seatId: seat.id,
          accept: answer ? answer.accept === true : null,
          terms: answer?.terms ?? null,
          if_not: answer?.if_not ?? null,
          parsed: Boolean(res.parsed),
          truncated: Boolean(res.truncated),
          raw: res.parsed ? undefined : res.text,
          usage: res.usage,
        });
      }

      const result = detectSettlement(pack, polled);
      await run.log("round_end", {
        round,
        settled: result.settled,
        reason: result.reason ?? null,
        terms: result.terms ?? null,
        acceptCount: Object.values(polled).filter((p) => p && p.status === "accept").length,
        proposalsAlreadyMatched: convergence.settled,
      });
      onEvent({ type: "round_end", round, ...result });

      if (result.settled) {
        terminal = "settled";
        settlement = result.terms;
        break;
      }
    }
  } catch (error) {
    terminal = "error";
    await run.log("error", { message: error.message });
    onEvent({ type: "error", message: error.message });
  }

  const summary = {
    terminal,
    settlement,
    rounds: turns.length ? Math.max(...turns.map((t) => t.round)) : 0,
    turns: turns.length,
    validationWarnings: check.warnings,
  };
  const path = await run.close(summary);
  return { runId: run.id, path, summary, pack: { id: pack.id, label: pack.label } };
}
