// Human-seat demo bridge (public/play.html). Lets one seat in a real
// runNegotiation() be answered by a person instead of a model, over the same
// kind of SSE stream the observation room already uses, plus one small HTTP
// endpoint the person's browser posts their answer to.
//
// Deliberately its own module, separate from server.js's real /api/run route
// (lib/log.js's default output, run.js, the shared run lock): this reuses
// runNegotiation() itself - via the humanSeatId/onHumanTurn hook in
// lib/engine.js - so a human plays under the exact same brief/rules/schema
// text a model would, but every session lives only in this module's memory
// (pending Map) and never touches the batch pipeline. skipLock: true means a
// play session cannot block, or be blocked by, a real evaluation batch.
//
// Session state does not survive a server restart - an in-flight play
// session is dropped, same as an in-flight observation-room run already is.

import { randomUUID } from "node:crypto";
import { runNegotiation } from "./engine.js";

/** runId -> { resolve, reject } for the one turn currently awaiting a human answer. */
const pending = new Map();

const seatSummary = (seat) =>
  seat && { id: seat.id, label: seat.label, country: seat.country, countryName: seat.countryName, level: seat.level };

/**
 * Streams a play session exactly like the observation room's /api/run, plus
 * a "human_turn" event whenever it's the human seat's turn, and a "run_id"
 * event first so the browser knows what to POST the answer back to.
 */
export async function streamPlayRun(req, res, url) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  const emit = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const runId = randomUUID();
  emit("run_id", { runId });

  let cancelled = false;
  req.on("close", () => {
    cancelled = true;
    const p = pending.get(runId);
    if (p) {
      pending.delete(runId);
      p.reject(new Error("connection closed while waiting for your turn"));
    }
  });

  const humanSeatId = url.searchParams.get("seat") || undefined;
  if (!humanSeatId) {
    emit("failed", { message: "no seat chosen to play" });
    return res.end();
  }

  try {
    const result = await runNegotiation({
      packId: url.searchParams.get("scenario") || undefined,
      condition: { dispositionArm: url.searchParams.get("arm") || "control" },
      model: url.searchParams.get("model") || undefined,
      variant: url.searchParams.get("variant") || undefined,
      roundsVariant: url.searchParams.get("roundsVariant") || undefined,
      repeat: 1,
      skipLock: true,
      humanSeatId,
      onHumanTurn: ({ seat, schema, input, kind }) =>
        new Promise((resolve, reject) => {
          if (cancelled) return reject(new Error("connection closed"));
          pending.set(runId, { resolve, reject });
          emit("human_turn", { seat: seatSummary(seat), kind, note: schema.note, input });
        }),
      onEvent: (e) => {
        if (cancelled) return;
        emit(e.type, { ...e, seat: seatSummary(e.seat) });
      },
    });
    emit("done", result);
  } catch (error) {
    emit("failed", { message: error.message });
  } finally {
    pending.delete(runId);
    res.end();
  }
}

/**
 * Resolves the turn currently pending for `runId` with the human's answer.
 * Shaped exactly like what callModel() returns, so the rest of the engine
 * cannot tell a human answered rather than a model - see the parity test
 * in test/engine.test.js.
 * @returns {boolean} false if no turn was actually pending (stale/duplicate
 *   submit, or the run already moved on) - the caller should 409, not 200.
 */
export function submitHumanTurn(runId, answer) {
  const p = pending.get(runId);
  if (!p) return false;
  pending.delete(runId);
  p.resolve({ text: JSON.stringify(answer), parsed: answer, demo: false, truncated: false, usage: null });
  return true;
}
