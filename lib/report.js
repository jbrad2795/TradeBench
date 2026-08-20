// Turns a run log into something a practitioner can read and mark up.
//
// The JSONL is the record of truth; this is the evaluation surface. Public
// record first, private material in clearly separated appendices so it can be
// stripped for blind evaluation.

import { readFileSync, writeFileSync } from "node:fs";

const fmt = (v) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return v.toLocaleString("en-GB");
  return String(v);
};

const seatLabel = (manifest, id) => {
  const s = (manifest.seats || []).find((x) => x.id === id);
  return s ? s.label : id;
};

export function buildReport(logPath) {
  const events = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const start = events.find((e) => e.type === "run_start");
  const end = events.find((e) => e.type === "run_end");
  const manifest = start.manifest;
  const cfg = start.config;
  const termKeys = manifest.settlementTerms || [];

  const out = [];
  const w = (line = "") => out.push(line);

  w(`# ${manifest.label}`);
  w();
  w(`| | |`);
  w(`| --- | --- |`);
  w(`| Model | ${cfg.model} |`);
  w(`| Disposition arm | ${cfg.condition.dispositionArm} |`);
  w(`| Rounds available | ${cfg.rounds} |`);
  w(`| Run | ${cfg.repeat} |`);
  w(`| Started | ${new Date(start.t).toUTCString()} |`);
  w(`| Pack version | ${manifest.version} |`);
  w();

  const terminal = end ? end.summary.terminal : "incomplete";
  w(`## Outcome`);
  w();
  if (terminal === "settled") {
    const s = end.summary.settlement || {};
    w(`**Settled.** Agreed terms:`);
    w();
    w(`| Term | Value |`);
    w(`| --- | --- |`);
    for (const k of termKeys) w(`| ${k} | ${fmt(s[k])} |`);
  } else if (terminal === "rounds_exhausted") {
    w(`**No settlement.** The rounds ran out. The default outcome stated in the rules applies.`);
  } else {
    w(`**Run ${terminal}.**`);
  }
  w();

  const rounds = [...new Set(events.filter((e) => e.type === "turn").map((e) => e.round))].sort((a, b) => a - b);

  for (const round of rounds) {
    w(`---`);
    w();
    w(`## Round ${round}`);
    w();
    for (const t of events.filter((e) => e.type === "turn" && e.round === round)) {
      w(`### ${seatLabel(manifest, t.seatId)}`);
      w();
      w(t.public_message || "*(no parseable message)*");
      w();
      if (t.proposal) {
        const parts = termKeys.map((k) => `${k}: ${fmt(t.proposal[k])}`);
        w(`> Tabled - status **${fmt(t.proposal.status)}** - ${parts.join(" | ")}`);
        const other = t.proposal.other_terms;
        if (Array.isArray(other) && other.length) {
          w(`>`);
          for (const o of other) w(`> - ${o}`);
        }
        w();
      }
    }

    const polls = events.filter((e) => e.type === "acceptance" && e.round === round);
    if (polls.length) {
      w(`### End-of-round poll`);
      w();
      w(`| Seat | Accepts | If not, what would have to change |`);
      w(`| --- | --- | --- |`);
      for (const p of polls) {
        const note = (p.if_not || "").replace(/\|/g, "/").replace(/\n/g, " ");
        w(`| ${seatLabel(manifest, p.seatId)} | ${p.accept ? "**yes**" : "no"} | ${note || "-"} |`);
      }
      w();
      const re = events.find((e) => e.type === "round_end" && e.round === round);
      if (re) w(re.settled ? `**Settlement reached this round.**` : `Not settled: ${re.reason || ""}.`);
      w();
    }
  }
  return { out, events, manifest, cfg, seatLabel };
}

/** Write a readable markdown report next to the run log. */
export function writeReport(logPath) {
  const { out, events, manifest } = buildReport(logPath);
  const w = (line = "") => out.push(line);
  const label = (id) => {
    const s = (manifest.seats || []).find((x) => x.id === id);
    return s ? s.label : id;
  };

  // Appendices. Private to the log - strip these for blind evaluation.
  const pregame = events.filter((e) => e.type === "pregame_declaration");
  if (pregame.length) {
    w(`---`);
    w();
    w(`## Appendix A - pre-game declarations`);
    w();
    w(`*Recorded before Round 1. Never shown to any other seat.*`);
    w();
    for (const p of pregame) {
      const d = p.declaration || {};
      w(`### ${label(p.seatId)}`);
      w();
      if (Array.isArray(d.objectives) && d.objectives.length) {
        w(`**Objectives, most important first**`);
        w();
        for (const o of d.objectives) w(`1. ${o}`);
        w();
      }
      if (d.success_and_failure) { w(`**How they would judge the outcome**`); w(); w(d.success_and_failure); w(); }
      if (d.approach) { w(`**Intended approach**`); w(); w(d.approach); w(); }
      if (Array.isArray(d.parties) && d.parties.length) {
        w(`**Read of the other parties**`);
        w();
        w(`| Who | What they expect them to want |`);
        w(`| --- | --- |`);
        for (const q of d.parties) {
          w(`| ${q.who || "-"} | ${(q.what_you_expect_them_to_want || "-").replace(/\|/g, "/")} |`);
        }
        w();
      }
    }
  }

  const turns = events.filter((e) => e.type === "turn" && e.private_rationale);
  if (turns.length) {
    w(`---`);
    w();
    w(`## Appendix B - private rationale, by round`);
    w();
    w(`*Why each seat chose what it did. Never shown to any other seat.*`);
    w();
    for (const round of [...new Set(turns.map((t) => t.round))].sort((a, b) => a - b)) {
      w(`### Round ${round}`);
      w();
      for (const t of turns.filter((x) => x.round === round)) {
        w(`**${label(t.seatId)}** - ${t.private_rationale}`);
        w();
        if (Array.isArray(t.expectations) && t.expectations.length) {
          for (const e of t.expectations) {
            w(`- Expects *${e.who}*: ${e.what_you_expect_next} (${e.why})`);
          }
          w();
        }
      }
    }
  }

  const target = logPath.replace(/\.jsonl$/, ".md");
  writeFileSync(target, out.join("\n") + "\n", "utf8");
  return target;
}
