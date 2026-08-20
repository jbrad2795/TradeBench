// Turns a run log into something a practitioner can read and mark up.
//
// The JSONL is the record of truth; this is the evaluation surface. Channels are
// kept visually distinct: at the table, inside each delegation, and the capital
// decision. A reader who mistakes a consultation for a table intervention would
// draw the wrong conclusion about what each side actually said in the room.

import { readFileSync, writeFileSync } from "node:fs";

const fmt = (v) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return v.toLocaleString("en-GB");
  return String(v);
};

const clean = (s) => String(s || "").replace(/\|/g, "/").replace(/\n/g, " ");

export function writeReport(logPath) {
  const events = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const start = events.find((e) => e.type === "run_start");
  const end = events.find((e) => e.type === "run_end");
  const manifest = start.manifest;
  const cfg = start.config;
  const termKeys = manifest.settlementTerms || [];
  const seat = (id) => (manifest.seats || []).find((s) => s.id === id) || { label: id, level: "?" };

  const out = [];
  const w = (line = "") => out.push(line);

  w(`# ${manifest.label}`);
  w();
  w(`| | |`);
  w(`| --- | --- |`);
  w(`| Environment | ${cfg.environment || "single-table"} |`);
  w(`| Model | ${cfg.model} |`);
  w(`| Disposition arm | ${cfg.condition.dispositionArm} |`);
  const disp = cfg.condition.dispositions || {};
  const tagged = Object.entries(disp).filter(([, v]) => v);
  w(`| Seats tagged | ${tagged.length ? tagged.map(([k, v]) => `${seat(k).label}=${v}`).join(", ") : "none"} |`);
  w(`| Rounds available | ${cfg.rounds} |`);
  w(`| Capital sees table | ${cfg.capitalSeesTable ? "yes, read-only" : "no"} |`);
  w(`| Run | ${cfg.repeat} |`);
  w(`| Started | ${new Date(start.t).toUTCString()} |`);
  w();

  const terminal = end ? end.summary.terminal : "incomplete";
  w(`## Outcome`);
  w();
  if (terminal === "settled") {
    const s = end.summary.settlement || {};
    w(`**Settled** — both capitals accepted the same terms.`);
    w();
    w(`| Term | Value |`);
    w(`| --- | --- |`);
    for (const k of termKeys) w(`| ${k} | ${fmt(s[k])} |`);
  } else if (terminal === "rounds_exhausted") {
    w(`**No settlement.** The rounds ran out; the default outcome in the rules applies.`);
  } else {
    w(`**Run ${terminal}.**`);
  }
  w();

  // Divergence summary up front - it is the thing this environment exists to measure.
  const DIVERGENCE = [
    "capital_rejected_recommendation",
    "capital_accepted_against_recommendation",
    "mandate_exceeded",
    "mandate_absent",
    "release_requested",
    "release_refused",
  ];
  const divs = events.filter((e) => DIVERGENCE.includes(e.type));
  w(`## Divergence events`);
  w();
  if (!divs.length) {
    w(`None recorded.`);
  } else {
    w(`| Round | Event | Country | Detail |`);
    w(`| --- | --- | --- | --- |`);
    for (const d of divs) {
      let detail = "";
      if (d.type === "mandate_exceeded") {
        detail = d.breaches.map((b) => `${b.term}: authorised ${fmt(b.authorised)}, tabled ${fmt(b.tabled)}`).join("; ");
      } else if (d.type === "release_requested") detail = `${d.count} request(s)`;
      else if (d.type === "release_refused") detail = `${d.count} refused`;
      else if (d.recommendation) detail = `post recommended ${d.recommendation}`;
      w(`| ${d.round ?? "-"} | \`${d.type}\` | ${d.country || "-"} | ${clean(detail)} |`);
    }
  }
  w();

  const rounds = [...new Set(events.filter((e) => e.type === "table_turn").map((e) => e.round))].sort((a, b) => a - b);

  for (const round of rounds) {
    w(`---`);
    w();
    w(`# Round ${round}`);
    w();

    // Phase 1 - the table
    w(`## At the table`);
    w();
    w(`*Post seats only. Visible to both delegations.*`);
    w();
    for (const t of events.filter((e) => e.type === "table_turn" && e.round === round)) {
      w(`### ${seat(t.seatId).label}`);
      w();
      w(t.public_message || "*(no parseable message)*");
      w();
      if (t.proposal) {
        w(`> Tabled — status **${fmt(t.proposal.status)}** — ` +
          termKeys.map((k) => `${k}: ${fmt(t.proposal[k])}`).join(" | "));
        const other = t.proposal.other_terms;
        if (Array.isArray(other) && other.length) {
          w(`>`);
          for (const o of other) w(`> - ${o}`);
        }
        w();
      }
      const breach = events.find((e) => e.type === "mandate_exceeded" && e.round === round && e.seatId === t.seatId);
      if (breach) {
        w(`> **Outside the standing authority:** ` +
          breach.breaches.map((b) => `${b.term} authorised ${fmt(b.authorised)}, tabled ${fmt(b.tabled)}`).join("; "));
        w();
      }
    }

    // Phase 2 - consultations, one section per country, kept apart
    const reports = events.filter((e) => e.type === "post_report" && e.round === round);
    for (const rep of reports) {
      const ins = events.find((e) => e.type === "capital_instruction" && e.round === round && e.country === rep.country);
      const name = seat(rep.seatId).countryName || rep.country.toUpperCase();
      w(`## Inside the ${name} delegation`);
      w();
      w(`*Not visible to the other delegation.*`);
      w();
      w(`### ${seat(rep.seatId).label} reports`);
      w();
      w(rep.report || "*(no parseable report)*");
      w();
      if (rep.recommendation) {
        w(`**Recommends: ${rep.recommendation.action}.** ${rep.recommendation.reasoning || ""}`);
        w();
      }
      if ((rep.requests || []).length) {
        w(`**Asks capital for:**`);
        w();
        for (const r of rep.requests) w(`- ${r.what_you_are_asking_for} — *${r.why}*`);
        w();
      }
      if (ins) {
        w(`### ${seat(ins.seatId).label} instructs`);
        w();
        w(ins.instruction || "*(no parseable instruction)*");
        w();
        const auth = ins.authority || {};
        const set = termKeys.filter((k) => auth[k] !== null && auth[k] !== undefined);
        if (set.length) {
          w(`**Authority granted:**`);
          w();
          w(`| Term | Limit |`);
          w(`| --- | --- |`);
          for (const k of set) w(`| ${k} | ${fmt(auth[k])} |`);
          if (auth.notes) w(``), w(`*${auth.notes}*`);
          w();
        } else {
          w(`**Authority granted:** none — every term left unconstrained.`);
          w();
        }
        if ((ins.response_to_requests || []).length) {
          w(`**Response to requests:**`);
          w();
          for (const r of ins.response_to_requests) {
            w(`- ${r.granted ? "Granted" : "Refused"}: ${r.request} — *${r.why}*`);
          }
          w();
        }
      }
    }

    // Phase 3 - the decision
    const polls = events.filter((e) => e.type === "acceptance" && e.round === round);
    if (polls.length) {
      w(`## Decision`);
      w();
      w(`*Capital seats only. Each decides independently.*`);
      w();
      w(`| Seat | Accepts | If not, what would have to change |`);
      w(`| --- | --- | --- |`);
      for (const p of polls) {
        w(`| ${seat(p.seatId).label} | ${p.accept ? "**yes**" : "no"} | ${clean(p.if_not) || "-"} |`);
      }
      w();
      const re = events.find((e) => e.type === "round_end" && e.round === round);
      if (re) w(re.settled ? `**Settled this round.**` : `Not settled: ${re.reason || ""}.`);
      w();
    }
  }

  // Appendices. Private to the log - strip for blind evaluation.
  const pregame = events.filter((e) => e.type === "pregame_declaration");
  if (pregame.length) {
    w(`---`);
    w();
    w(`## Appendix A — pre-game declarations`);
    w();
    w(`*Recorded before Round 1. Never shown to any other seat.*`);
    w();
    for (const p of pregame) {
      const d = p.declaration || {};
      w(`### ${seat(p.seatId).label}`);
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
        for (const q of d.parties) w(`| ${clean(q.who)} | ${clean(q.what_you_expect_them_to_want)} |`);
        w();
      }
    }
  }

  const withRationale = events.filter(
    (e) => e.private_rationale && ["table_turn", "post_report", "capital_instruction"].includes(e.type),
  );
  if (withRationale.length) {
    w(`---`);
    w();
    w(`## Appendix B — private rationale`);
    w();
    w(`*Why each seat chose what it did. Never shown to anyone, including co-nationals.*`);
    w();
    for (const round of [...new Set(withRationale.map((e) => e.round))].sort((a, b) => a - b)) {
      w(`### Round ${round}`);
      w();
      for (const e of withRationale.filter((x) => x.round === round)) {
        const phase = { table_turn: "at the table", post_report: "reporting", capital_instruction: "instructing" }[e.type];
        w(`**${seat(e.seatId).label}** *(${phase})* — ${e.private_rationale}`);
        w();
      }
    }
  }

  const target = logPath.replace(/\.jsonl$/, ".md");
  writeFileSync(target, out.join("\n") + "\n", "utf8");
  return target;
}
