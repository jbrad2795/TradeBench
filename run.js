#!/usr/bin/env node
// Batch runner. Plays a scenario pack headlessly across disposition arms with
// repeats, writing one JSONL log per run.
//
//   node --env-file=.env run.js --repeats 3
//   node --env-file=.env run.js --arm firm --repeats 1
//   node --env-file=.env run.js --scenario s1-article-xxviii-steel --arm control

import { runNegotiation } from "./lib/engine.js";
import { packIndex, defaultPackId } from "./public/scenarios/index.js";
import { listModels } from "./lib/models.js";
import { isLive, modelName } from "./lib/model.js";

const ARMS = ["firm", "accommodating", "control"];

function parseArgs(argv) {
  const out = { repeats: 1, arm: "all", scenario: defaultPackId, list: false, models: false, model: undefined, rounds: undefined };
  for (let i = 2; i < argv.length; i++) {
    const [k, inline] = argv[i].replace(/^--/, "").split("=");
    const next = argv[i + 1];
    const v = inline ?? (next && !next.startsWith("--") ? argv[++i] : undefined);
    if (k === "repeats") out.repeats = Number(v) || 1;
    else if (k === "arm") out.arm = v;
    else if (k === "scenario") out.scenario = v;
    else if (k === "list") out.list = true;
    else if (k === "list-models") out.models = true;
    else if (k === "model") out.model = v;
    else if (k === "rounds") out.rounds = Number(v) || undefined;
  }
  return out;
}

const opts = parseArgs(process.argv);

if (opts.list) {
  console.log("Available scenario packs:");
  for (const p of packIndex()) {
    console.log(`  ${p.id}`);
    console.log(`      ${p.label} - ${p.seats} seats, ${p.rounds} rounds`);
    console.log(`      ${p.status}`);
  }
  process.exit(0);
}

if (opts.models) {
  console.log("Available models ([key] = API key present in .env):");
  for (const m of listModels()) {
    console.log(`  ${m.ready ? "[key]" : "[   ]"} ${m.spec.padEnd(34)} ${m.label.padEnd(24)} ${m.envKey}`);
  }
  console.log("");
  console.log("Any provider:model-id works, not just this list.");
  process.exit(0);
}

const arms = opts.arm === "all" ? ARMS : [opts.arm];
for (const a of arms) {
  if (!ARMS.includes(a)) {
    console.error(`Unknown arm "${a}". Expected one of: ${ARMS.join(", ")}`);
    process.exit(1);
  }
}

const total = arms.length * opts.repeats;
console.log("TradeBench batch runner");
console.log(`  scenario : ${opts.scenario}`);
console.log(`  mode     : ${isLive() ? `LIVE (${modelName()})` : "OFFLINE (stub responses, no API calls)"}`);
console.log(`  matrix   : ${arms.length} arm(s) x ${opts.repeats} repeat(s) = ${total} run(s)`);
console.log("");

const results = [];
let n = 0;
let warned = false;

for (const arm of arms) {
  for (let repeat = 1; repeat <= opts.repeats; repeat++) {
    n++;
    process.stdout.write(`[${n}/${total}] arm=${arm} rep=${repeat} ... `);
    const started = Date.now();
    try {
      const r = await runNegotiation({
        packId: opts.scenario,
        condition: { dispositionArm: arm },
        repeat,
        model: opts.model,
        rounds: opts.rounds,
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const outcome = r.summary.terminal === "settled"
        ? `SETTLED (${JSON.stringify(r.summary.settlement)})`
        : r.summary.terminal;
      console.log(`${outcome} - ${r.summary.turns} turns, ${secs}s`);
      results.push(r);
      if (!warned && r.summary.validationWarnings.length) {
        warned = true;
        console.log("");
        console.log("  pack validation warnings:");
        for (const w of r.summary.validationWarnings) console.log(`    - ${w}`);
        console.log("");
      }
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
    }
  }
}

console.log("");
console.log(`Wrote ${results.length}/${total} runs to runs/ (.jsonl log + .md transcript each)`);
const settled = results.filter((r) => r.summary.terminal === "settled").length;
console.log(`settled in ${settled}/${results.length} runs`);
