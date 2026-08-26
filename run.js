#!/usr/bin/env node
// Batch runner. Plays a scenario pack headlessly across disposition arms with
// repeats, writing one JSONL log per run.
//
//   node --env-file=.env run.js --repeats 3
//   node --env-file=.env run.js --variant lenient --arm control --repeats 1
//   node run.js --list-variants
//   node --env-file=.env run.js --arm firm --repeats 1
//   node --env-file=.env run.js --scenario s1-article-xxviii-steel --arm control
//   node --env-file=.env run.js --rounds-variant four --arm control --repeats 1
//   node run.js --list-rounds-variants

import { runNegotiation } from "./lib/engine.js";
import { packIndex, defaultPackId } from "./public/scenarios/index.js";
import { listModels } from "./lib/models.js";
import { ARMS, ARM_KEYS } from "./lib/arms.js";
import { isLive, modelName } from "./lib/model.js";



function parseArgs(argv) {
  const out = {
    repeats: 1, arm: "all", scenario: defaultPackId, variant: undefined, roundsVariant: undefined,
    list: false, models: false, arms: false, variants: false, roundsVariants: false,
    model: undefined, judgeModel: undefined, rounds: undefined,
  };
  for (let i = 2; i < argv.length; i++) {
    const [k, inline] = argv[i].replace(/^--/, "").split("=");
    const next = argv[i + 1];
    const v = inline ?? (next && !next.startsWith("--") ? argv[++i] : undefined);
    if (k === "repeats") out.repeats = Number(v) || 1;
    else if (k === "arm") out.arm = v;
    else if (k === "scenario") out.scenario = v;
    else if (k === "list") out.list = true;
    else if (k === "list-models") out.models = true;
    else if (k === "list-arms") out.arms = true;
    else if (k === "model") out.model = v;
    else if (k === "judge-model") out.judgeModel = v;
    // Raw --rounds still exists for tests, which run on stubs and never read
    // the resolved prompt text (see the note above resolveVariant() in
    // lib/engine.js) - it only ever changes the engine's loop bound. For a
    // live run, --rounds-variant is the only safe way to change how many
    // rounds a run gets: it drives both the loop bound and what Block 4
    // tells the seats their round limit is, from the same resolveVariant()
    // call, so the two cannot drift apart the way a raw --rounds override
    // would (the exact failure mode from 20 August). Sweep finding: this
    // flag never actually existed before, despite the pack and engine
    // already supporting roundsVariant end to end - only the raw --rounds
    // override was reachable from the CLI.
    else if (k === "rounds") out.rounds = Number(v) || undefined;
    else if (k === "rounds-variant") out.roundsVariant = v;
    else if (k === "variant") out.variant = v;
    else if (k === "list-variants") out.variants = true;
    else if (k === "list-rounds-variants") out.roundsVariants = true;
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

if (opts.arms) {
  console.log("Disposition arms:");
  for (const [k, a] of Object.entries(ARMS)) {
    console.log(`  ${k.padEnd(20)} ${a.label}`);
    console.log(`  ${"".padEnd(20)} ${a.description}`);
  }
  process.exit(0);
}

if (opts.variants) {
  const { getPack } = await import("./public/scenarios/index.js");
  const pack = getPack(opts.scenario);
  if (!pack || !pack.variants) {
    console.log(`No variants declared for scenario "${opts.scenario}".`);
  } else {
    console.log(`Scenario variants for ${opts.scenario} (default: ${pack.defaultVariant}):`);
    for (const key of Object.keys(pack.variants)) {
      console.log(`  ${key}${key === pack.defaultVariant ? "  (default)" : ""}`);
    }
  }
  process.exit(0);
}

if (opts.roundsVariants) {
  const { getPack } = await import("./public/scenarios/index.js");
  const pack = getPack(opts.scenario);
  if (!pack || !pack.roundsVariants) {
    console.log(`No roundsVariants declared for scenario "${opts.scenario}" (rounds is fixed at ${pack?.rounds ?? "?"}).`);
  } else {
    console.log(`Rounds variants for ${opts.scenario} (default: ${pack.defaultRoundsVariant}):`);
    for (const [key, rv] of Object.entries(pack.roundsVariants)) {
      console.log(`  ${key}${key === pack.defaultRoundsVariant ? "  (default)" : ""} - ${rv.rounds} rounds`);
    }
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

const arms = opts.arm === "all" ? ARM_KEYS : [opts.arm];
for (const a of arms) {
  if (!ARM_KEYS.includes(a)) {
    console.error(`Unknown arm "${a}". Expected one of: ${ARM_KEYS.join(", ")}`);
    process.exit(1);
  }
}

const total = arms.length * opts.repeats;
console.log("TradeBench batch runner");
console.log(`  scenario : ${opts.scenario}`);
console.log(`  variant  : ${opts.variant || "(pack default)"}`);
console.log(`  rounds   : ${opts.roundsVariant || "(pack default)"}`);
console.log(`  mode     : ${isLive(opts.model) ? `LIVE (${modelName(opts.model)})` : "OFFLINE (stub responses, no API calls)"}`);
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
        judgeModel: opts.judgeModel,
        rounds: opts.rounds,
        roundsVariant: opts.roundsVariant,
        variant: opts.variant,
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const outcome = r.summary.terminal === "settled"
        ? `SETTLED (${JSON.stringify(r.summary.settlement)})`
        : r.summary.terminal;
      console.log(`${outcome} - ${r.summary.tableTurns} turns, ${secs}s`);
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
const runsDirLabel = process.env.TB_RUNS_DIR || "runs/";
console.log(`Wrote ${results.length}/${total} runs to ${runsDirLabel} (.jsonl log + .md transcript each)`);
const settled = results.filter((r) => r.summary.terminal === "settled").length;
console.log(`settled in ${settled}/${results.length} runs`);
