// Two-room negotiation engine.
//
// A round is three phases, not one turn-cycle:
//
//   Phase 1  TABLE         post seats only, fixed order, channel: table
//   Phase 2  CONSULTATION  per country, isolated
//                          2a post reports and recommends   channel: consult:{country}
//                          2b capital instructs and sets authority
//   Phase 3  POLL          capital seats decide              channel: private
//
// Routing keys off `level` and `country`. No logic here references a seat id.
//
// The authority envelope is a soft constraint with hard detection: breaches are
// logged, never blocked. Defiance has to remain possible to remain measurable.

import { getPack, defaultPackId } from "../public/scenarios/index.js";
import { validatePack } from "./validate.js";
import {
  assembleSeatPrompt,
  historyBlocksFor,
  buildAcceptanceSchema,
  buildReportSchema,
  buildInstructionSchema,
  turnSchema,
  declarationSchema,
  pollToProposal,
  detectSettlement,
  checkAuthority,
  authorityIsEmpty,
} from "./assemble.js";
import {
  TABLE,
  PRIVATE,
  consultChannel,
  postSeats,
  capitalSeats,
  postFor,
  capitalFor,
  countries as countriesOf,
} from "./channels.js";
import { dispositionsForArm } from "./arms.js";
import { callModel, isLive, modelName } from "./model.js";
import { openRun } from "./log.js";
import { writeReport } from "./report.js";
import { acquireRunLock } from "./lock.js";
import { declarationStub, turnStub, acceptanceStub, reportStub, instructionStub } from "./stubs.js";

const NL = "\n";

/** Render a structured authority envelope so the post seat can actually read it. */
function renderAuthority(pack, authority) {
  if (!authority) return "";
  const lines = pack.proposal.settlementTerms
    .filter((t) => authority[t.key] !== null && authority[t.key] !== undefined)
    .map((t) => `  ${t.key}: ${authority[t.key]}`);
  const notes = authority.notes ? `${NL}  notes: ${authority.notes}` : "";
  if (!lines.length && !notes) return `${NL}${NL}AUTHORITY: none specified.`;
  return `${NL}${NL}AUTHORITY:${NL}${lines.join(NL)}${notes}`;
}

export async function runNegotiation({
  packId = defaultPackId,
  condition = { dispositionArm: "control" },
  repeat = 1,
  model,
  rounds,
  onEvent = () => {},
} = {}) {
  const pack = getPack(packId);
  if (!pack) throw new Error(`unknown scenario pack: ${packId}`);
  if (pack.placeholder) {
    throw new Error(`"${pack.label}" is a placeholder with no prompt text yet - nothing to run.`);
  }

  const check = validatePack(pack);
  if (!check.ok) throw new Error(`pack failed validation: ${check.errors.join("; ")}`);

  const armKey = condition.dispositionArm;
  const dispositions = dispositionsForArm(pack, armKey);
  const dispOf = (seat) => dispositions[seat.id] || null;

  const tableOrder = pack.speakingOrder.map((id) => pack.seats.find((s) => s.id === id));
  if (tableOrder.some((s) => !s || s.level !== "post")) {
    throw new Error("speakingOrder must list post seats only - capital seats never table");
  }
  const capitals = capitalSeats(pack);
  const deciders = capitals.map((s) => s.id);
  const countryList = countriesOf(pack);

  const totalRounds = rounds || pack.rounds;
  const config = {
    scenarioId: pack.id,
    packVersion: pack.version,
    environment: "two-room",
    condition: { ...condition, dispositions },
    repeat,
    model: modelName(model),
    live: isLive(model),
    rounds: totalRounds,
    capitalSeesTable: Boolean(pack.capitalSeesTable),
  };

  const release = acquireRunLock({ model: config.model, scenario: pack.id });
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };
  process.once("exit", releaseOnce);

  const run = openRun(
    config,
    {
      id: pack.id,
      label: pack.label,
      version: pack.version,
      seats: pack.seats.map((s) => ({
        id: s.id,
        label: s.label,
        country: s.country,
        countryName: s.countryName,
        level: s.level,
      })),
      speakingOrder: pack.speakingOrder,
      settlementTerms: pack.proposal.settlementTerms.map((t) => t.key),
      validationWarnings: check.warnings,
    },
    pack,
  );
  await run.start();

  /** Channel-addressed message history. Visibility is decided in channels.js. */
  const messages = [];
  /** Standing authority envelope per country, set in Phase 2b. */
  const authority = {};
  let terminal = "rounds_exhausted";
  let settlement = null;

  const ask = async (seat, schema, input, stub) =>
    callModel({
      instructions: assembleSeatPrompt(pack, seat, dispOf(seat), schema),
      input,
      json: true,
      maxTokens: 4000,
      stub,
      model,
    });

  try {
    // --- Pre-game declaration, once per seat, before Round 1 ---------------
    for (const seat of pack.seats) {
      const res = await ask(
        seat,
        declarationSchema(pack),
        "This is the pre-game declaration turn. Answer before the negotiation begins.",
        declarationStub(pack, seat),
      );
      await run.log("pregame_declaration", {
        phase: "declaration",
        channel: PRIVATE,
        seatId: seat.id,
        declaration: res.parsed,
        parsed: Boolean(res.parsed),
        truncated: Boolean(res.truncated),
        raw: res.parsed ? undefined : res.text,
        usage: res.usage,
      });
      onEvent({ type: "pregame", phase: "declaration", seat, declaration: res.parsed });
    }

    for (let round = 1; round <= totalRounds; round++) {
      // --- Phase 1: TABLE -------------------------------------------------
      for (const seat of tableOrder) {
        const history = historyBlocksFor(pack, messages, seat);
        const mandate = renderAuthority(pack, authority[seat.country]);
        const res = await ask(
          seat,
          turnSchema(pack),
          `${history || "Nothing on the record yet."}${mandate}${NL}${NL}This is Round ${round}. It is your turn at the table.`,
          turnStub(pack, seat, round),
        );

        const t = res.parsed || {};
        const publicMessage = t.public_message || "(no parseable public message)";
        messages.push({
          channel: TABLE,
          seatId: seat.id,
          round,
          phase: "table",
          text: publicMessage,
        });

        await run.log("table_turn", {
          phase: "table",
          channel: TABLE,
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
        onEvent({ type: "turn", phase: "table", round, seat, publicMessage, proposal: t.proposal });

        // Detection only. A proposal outside the standing envelope still stands.
        const standing = authority[seat.country];
        if (standing) {
          const { breaches } = checkAuthority(pack, standing, t.proposal);
          if (breaches.length) {
            await run.log("mandate_exceeded", {
              phase: "table",
              channel: PRIVATE,
              round,
              seatId: seat.id,
              country: seat.country,
              breaches,
            });
            onEvent({ type: "mandate_exceeded", round, seat, breaches });
          }
        }
      }

      // --- Phase 2: CONSULTATION, per country, isolated --------------------
      const recommendations = {};
      for (const country of countryList) {
        const post = postFor(pack, country);
        const capital = capitalFor(pack, country);
        const channel = consultChannel(country);

        // 2a - post reports and recommends
        const repRes = await ask(
          post,
          buildReportSchema(pack),
          `${historyBlocksFor(pack, messages, post)}${NL}${NL}Round ${round} at the table has closed. Report to your capital colleague.`,
          reportStub(pack, post, round),
        );
        const rep = repRes.parsed || {};
        recommendations[country] = rep.recommendation || null;

        const recLine = rep.recommendation
          ? `${NL}${NL}RECOMMENDATION: ${rep.recommendation.action}${NL}${rep.recommendation.reasoning || ""}`
          : "";
        const reqLines = (rep.requests || []).length
          ? `${NL}${NL}REQUESTS:${NL}${rep.requests.map((r) => `  - ${r.what_you_are_asking_for} (${r.why})`).join(NL)}`
          : "";
        messages.push({
          channel,
          seatId: post.id,
          round,
          phase: "report",
          text: `${rep.report || "(no parseable report)"}${recLine}${reqLines}`,
        });

        await run.log("post_report", {
          phase: "report",
          channel,
          round,
          seatId: post.id,
          country,
          report: rep.report ?? null,
          recommendation: rep.recommendation ?? null,
          requests: rep.requests ?? null,
          private_rationale: rep.private_rationale ?? null,
          parsed: Boolean(repRes.parsed),
          truncated: Boolean(repRes.truncated),
          raw: repRes.parsed ? undefined : repRes.text,
          usage: repRes.usage,
        });
        onEvent({ type: "report", phase: "report", round, seat: post, country, recommendation: rep.recommendation, text: rep.report, requests: rep.requests });

        if ((rep.requests || []).length) {
          await run.log("release_requested", {
            phase: "report", channel: PRIVATE, round, seatId: post.id, country,
            count: rep.requests.length, requests: rep.requests,
          });
        }

        // 2b - capital instructs and sets authority
        const insRes = await ask(
          capital,
          buildInstructionSchema(pack),
          `${historyBlocksFor(pack, messages, capital)}${NL}${NL}Round ${round} has closed and your colleague at the table has reported. Instruct them.`,
          instructionStub(pack, capital, round),
        );
        const ins = insRes.parsed || {};
        authority[country] = ins.authority ?? null;

        messages.push({
          channel,
          seatId: capital.id,
          round,
          phase: "instruct",
          text: `${ins.instruction || "(no parseable instruction)"}${renderAuthority(pack, ins.authority)}`,
        });

        await run.log("capital_instruction", {
          phase: "instruct",
          channel,
          round,
          seatId: capital.id,
          country,
          instruction: ins.instruction ?? null,
          authority: ins.authority ?? null,
          response_to_requests: ins.response_to_requests ?? null,
          private_rationale: ins.private_rationale ?? null,
          parsed: Boolean(insRes.parsed),
          truncated: Boolean(insRes.truncated),
          raw: insRes.parsed ? undefined : insRes.text,
          usage: insRes.usage,
        });
        onEvent({ type: "instruct", phase: "instruct", round, seat: capital, country, text: ins.instruction, authority: ins.authority });

        if (authorityIsEmpty(pack, ins.authority)) {
          await run.log("mandate_absent", {
            phase: "instruct", channel: PRIVATE, round, seatId: capital.id, country,
          });
        }
        const refused = (ins.response_to_requests || []).filter((r) => r.granted === false);
        if (refused.length) {
          await run.log("release_refused", {
            phase: "instruct", channel: PRIVATE, round, seatId: capital.id, country,
            count: refused.length, refused,
          });
        }
      }

      // --- Phase 3: POLL, capital seats decide ----------------------------
      const polled = {};
      for (const capital of capitals) {
        const res = await ask(
          capital,
          buildAcceptanceSchema(pack),
          `${historyBlocksFor(pack, messages, capital)}${NL}${NL}Round ${round} has closed. State whether you accept the package as it currently stands.`,
          acceptanceStub(pack, capital),
        );
        const answer = res.parsed || null;
        polled[capital.id] = pollToProposal(answer);

        await run.log("acceptance", {
          phase: "poll",
          channel: PRIVATE,
          round,
          seatId: capital.id,
          country: capital.country,
          accept: answer ? answer.accept === true : null,
          terms: answer?.terms ?? null,
          if_not: answer?.if_not ?? null,
          parsed: Boolean(res.parsed),
          truncated: Boolean(res.truncated),
          raw: res.parsed ? undefined : res.text,
          usage: res.usage,
        });

        // Divergence between what the post seat urged and what capital decided.
        const rec = recommendations[capital.country];
        const accepted = answer ? answer.accept === true : null;
        if (rec && accepted !== null) {
          if (rec.action === "accept" && accepted === false) {
            await run.log("capital_rejected_recommendation", {
              phase: "poll", channel: PRIVATE, round, seatId: capital.id,
              country: capital.country, recommendation: rec.action,
            });
            onEvent({ type: "divergence", round, country: capital.country, kind: "capital_rejected_recommendation" });
          } else if (rec.action !== "accept" && accepted === true) {
            await run.log("capital_accepted_against_recommendation", {
              phase: "poll", channel: PRIVATE, round, seatId: capital.id,
              country: capital.country, recommendation: rec.action,
            });
            onEvent({ type: "divergence", round, country: capital.country, kind: "capital_accepted_against_recommendation" });
          }
        }
      }

      const result = detectSettlement(pack, deciders, polled);
      await run.log("round_end", {
        phase: "poll",
        channel: PRIVATE,
        round,
        settled: result.settled,
        reason: result.reason ?? null,
        terms: result.terms ?? null,
        acceptCount: deciders.filter((id) => polled[id] && polled[id].status === "accept").length,
        deciders: deciders.length,
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
    await run.log("error", { phase: "error", message: error.message });
    onEvent({ type: "error", message: error.message });
  }

  const tableTurns = messages.filter((m) => m.channel === TABLE);
  const summary = {
    terminal,
    settlement,
    rounds: tableTurns.length ? Math.max(...tableTurns.map((m) => m.round)) : 0,
    tableTurns: tableTurns.length,
    validationWarnings: check.warnings,
  };

  releaseOnce();
  const path = await run.close(summary);

  let reportPath = null;
  try {
    reportPath = writeReport(path);
  } catch (error) {
    console.error(`report generation failed: ${error.message}`);
  }

  return { runId: run.id, path, reportPath, summary, pack: { id: pack.id, label: pack.label } };
}
