#!/usr/bin/env node
// Builds site/data/results.json and site/data/results.js from the raw run logs.
//
// Node stdlib only, deliberately: this has to still run in a year with no
// install step. Every figure on the site comes out of here - nothing on the
// page is typed by hand.
//
//   node site/build-results.mjs
//
// Emits both .json (for download and citation) and .js (a window global) so
// the page works opened straight off the filesystem, with no server and no
// fetch/CORS problem.

import { readFileSync, readdirSync, writeFileSync, copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = dirname(fileURLToPath(import.meta.url));
const REPO = join(SITE, "..");
const RUNS = join(REPO, "runs", "evaluation runs");
const EVAL = join(REPO, "evaluation");

// The four arms that both models ran. focal_firm_eugva is Sonnet-only and is
// kept out of every matched comparison.
const MAIN_ARMS = ["control", "firm", "accommodating", "focal_firm_ukgva"];
const MODELS = {
  "anthropic-claude-sonnet-5": { key: "sonnet", label: "Claude Sonnet 5" },
  "moonshot-kimi-k3": { key: "kimi", label: "Kimi K3" },
};

const readJsonl = (p) =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

// ---------------------------------------------------------------- per run ---

function summariseRun(path, modelDir) {
  const lines = readJsonl(path);
  const start = lines.find((o) => o.type === "run_start");
  const end = lines.find((o) => o.type === "run_end");
  if (!start) return null;

  const cfg = start.config;
  const r = {
    model: MODELS[modelDir].key,
    modelLabel: MODELS[modelDir].label,
    file: basename(path),
    arm: cfg.condition.dispositionArm,
    rep: cfg.repeat,
    rounds: cfg.rounds,
    variant: cfg.variant,
    date: start.t.slice(0, 10),
    terminal: end ? end.summary.terminal : "no_end",
    settlement: end ? end.summary.settlement || null : null,
    // Counted two ways throughout: an "event" is one seat-round in which the
    // thing happened at least once; an "item" is each individual occurrence
    // inside it. The two differ by up to 2.5x and must never be conflated.
    mandateEvents: 0,
    breachItems: 0,
    breachesBySeat: {},
    releaseRequestEvents: 0,
    releaseRequestItems: 0,
    releaseRefusedEvents: 0,
    releaseRefusedItems: 0,
    capitalAcceptedAgainstRec: 0,
    capitalRejectedRec: 0,
    mandateAbsent: 0,
    packageIncoherent: 0,
    judgeFired: 0,
    judgeRescued: false,
  };

  for (const o of lines) {
    switch (o.type) {
      case "mandate_exceeded":
        r.mandateEvents++;
        r.breachItems += (o.breaches || []).length;
        r.breachesBySeat[o.seatId] = (r.breachesBySeat[o.seatId] || 0) + (o.breaches || []).length;
        break;
      case "release_requested":
        r.releaseRequestEvents++;
        r.releaseRequestItems += o.count ?? (o.requests || []).length;
        break;
      case "release_refused":
        r.releaseRefusedEvents++;
        r.releaseRefusedItems += o.count ?? (o.refused || []).length;
        break;
      case "capital_accepted_against_recommendation":
        r.capitalAcceptedAgainstRec++;
        break;
      case "capital_rejected_recommendation":
        r.capitalRejectedRec++;
        break;
      case "mandate_absent":
        r.mandateAbsent++;
        break;
      case "package_incoherent":
        r.packageIncoherent++;
        break;
      case "judge_reconciliation":
        r.judgeFired++;
        if (o.rescued) r.judgeRescued = true;
        break;
    }
  }

  r.settled = r.terminal === "settled";
  // A settlement the judge rescued is still a settlement, but the mechanical
  // count is the one that needs no model in the loop. Both get published.
  r.settledMechanically = r.settled && !r.judgeRescued;
  return r;
}

function collectRuns() {
  const out = [];
  for (const dir of Object.keys(MODELS)) {
    const d = join(RUNS, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((f) => f.endsWith(".jsonl")).sort()) {
      const r = summariseRun(join(d, f), dir);
      if (r) out.push(r);
    }
  }
  return out;
}

// -------------------------------------------------------------- aggregate ---

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// The co-national scorer's own convention: drop nulls, sort, take xs[len//2] -
// the UPPER median on an even count, not the average of the middle two. Any
// other convention silently disagrees with conational_report.md.
const scorerMedian = (xs) => {
  const s = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const modal = (xs) => {
  const c = {};
  for (const x of xs) if (x) c[x] = (c[x] || 0) + 1;
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return e.length ? e[0][0] : null;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rate = (n, d) => (d ? n / d : null);

function aggregate(runs) {
  if (!runs.length) return null;
  const settledRuns = runs.filter((r) => r.settled);
  const pools = settledRuns.map((r) => r.settlement?.total_pool_tonnes).filter(Number.isFinite);
  const tranches = settledRuns.map((r) => r.settlement?.uk_tranche_tonnes).filter(Number.isFinite);
  const rates = settledRuns.map((r) => r.settlement?.out_of_quota_rate_pct).filter(Number.isFinite);
  const shares = settledRuns
    .map((r) => {
      const p = r.settlement?.total_pool_tonnes;
      const t = r.settlement?.uk_tranche_tonnes;
      return Number.isFinite(p) && Number.isFinite(t) && p ? t / p : null;
    })
    .filter((x) => x !== null);

  const rounds = sum(runs, (r) => r.rounds);
  const reqEvents = sum(runs, (r) => r.releaseRequestEvents);
  const reqItems = sum(runs, (r) => r.releaseRequestItems);

  return {
    n: runs.length,
    rounds,
    settled: settledRuns.length,
    settleRate: rate(settledRuns.length, runs.length),
    settledMechanically: runs.filter((r) => r.settledMechanically).length,
    judgeRescued: runs.filter((r) => r.judgeRescued).length,
    judgeFired: sum(runs, (r) => r.judgeFired),

    mandateEvents: sum(runs, (r) => r.mandateEvents),
    mandateEventsPerRound: rate(sum(runs, (r) => r.mandateEvents), rounds),
    breachItems: sum(runs, (r) => r.breachItems),
    breachesBySeat: runs.reduce((acc, r) => {
      for (const [k, v] of Object.entries(r.breachesBySeat)) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {}),

    // Both readings, always together. Event-level answers "how often did a
    // capital refuse anything at all"; item-level answers "what share of asks
    // were refused". They are 2.5x apart and mean different things.
    releaseRequestEvents: reqEvents,
    releaseRequestItems: reqItems,
    releaseRefusedEvents: sum(runs, (r) => r.releaseRefusedEvents),
    releaseRefusedItems: sum(runs, (r) => r.releaseRefusedItems),
    refusalRateEvents: rate(sum(runs, (r) => r.releaseRefusedEvents), reqEvents),
    refusalRateItems: rate(sum(runs, (r) => r.releaseRefusedItems), reqItems),

    capitalAcceptedAgainstRec: sum(runs, (r) => r.capitalAcceptedAgainstRec),
    capitalRejectedRec: sum(runs, (r) => r.capitalRejectedRec),
    capitalOverrides: sum(runs, (r) => r.capitalAcceptedAgainstRec + r.capitalRejectedRec),
    mandateAbsent: sum(runs, (r) => r.mandateAbsent),
    packageIncoherent: sum(runs, (r) => r.packageIncoherent),

    pool: { min: pools.length ? Math.min(...pools) : null, median: median(pools), max: pools.length ? Math.max(...pools) : null, mean: mean(pools) },
    tranche: { median: median(tranches), mean: mean(tranches) },
    outOfQuotaPct: { median: median(rates), mean: mean(rates) },
    ukShare: { mean: mean(shares) },
  };
}

// ------------------------------------------------- co-national recognition ---

function conational() {
  const p = join(EVAL, "conational-recognition", "out", "conational_recognition.json");
  if (!existsSync(p)) return null;
  const rows = JSON.parse(readFileSync(p, "utf8"));

  // Per-unit level is the median of the judge passes, per the rubric; the unit's
  // axis is the modal axis across those passes. Both conventions are taken from
  // conational_recognition.py so this file and the report cannot disagree.
  const units = new Map();
  for (const r of rows) {
    if (!units.has(r.unit_id)) {
      units.set(r.unit_id, { unit: r.unit_id, arm: r.arm, rep: r.rep, round: r.round, seat: r.seat, levels: [], axes: [] });
    }
    const u = units.get(r.unit_id);
    if (Number.isFinite(r.level)) u.levels.push(r.level);
    u.axes.push(r.axis);
  }
  const list = [...units.values()].map((u) => ({
    ...u,
    level: scorerMedian(u.levels),
    axis: modal(u.axes) ?? "other",
  }));

  const bucket = (rs) => {
    const dist = [0, 0, 0, 0, 0];
    let ge3 = 0;
    for (const u of rs) {
      if (u.level === null) continue;
      const l = Math.floor(u.level);
      dist[l]++;
      if (u.level >= 3) ge3++;
    }
    return { n: rs.length, dist, ge3, rateGe3: rate(ge3, rs.length) };
  };

  const byArm = {};
  for (const arm of MAIN_ARMS) byArm[arm] = bucket(list.filter((u) => u.arm === arm));
  const bySeat = {};
  for (const seat of ["eu-geneva", "uk-geneva"]) bySeat[seat] = bucket(list.filter((u) => u.seat === seat));

  const axes = {};
  for (const u of list) {
    if (!axes[u.axis]) axes[u.axis] = { units: 0, ge3: 0 };
    axes[u.axis].units++;
    if (u.level >= 3) axes[u.axis].ge3++;
  }

  const runsReached = new Set(list.filter((u) => u.level >= 3).map((u) => `${u.arm}/rep${u.rep}`));
  const allRuns = new Set(list.map((u) => `${u.arm}/rep${u.rep}`));

  // alpha and the hand-adjudication count come from the scorer's own report,
  // which is itself generated - parsed rather than retyped.
  const reportPath = join(EVAL, "conational-recognition", "out", "conational_report.md");
  let alpha = null, disagreements = null;
  if (existsSync(reportPath)) {
    const md = readFileSync(reportPath, "utf8");
    alpha = Number(md.match(/alpha \(ordinal\):\s*\*\*([\d.]+)\*\*/)?.[1] ?? NaN) || null;
    disagreements = Number(md.match(/across judges[^:]*:\s*\*\*(\d+)\*\*/)?.[1] ?? NaN) || null;
  }

  return {
    ...bucket(list),
    passesPerUnit: 3,
    parseFailures: rows.filter((r) => r.parse_ok === false).length,
    byArm,
    bySeat,
    axes,
    level4: list.filter((u) => u.level >= 4).map((u) => u.unit),
    runsReachedGe3: runsReached.size,
    runsTotal: allRuns.size,
    alpha,
    disagreements,
  };
}

// ------------------------------------------------- blind disposition recall ---

function blindDisposition(canonicalRuns) {
  const p = join(EVAL, "blind rating for disposition", "blind_rate_12runs_nr5_public.json");
  if (!existsSync(p)) return null;
  const rows = JSON.parse(readFileSync(p, "utf8"));

  // Which model's transcripts did the panel actually read? The blind files are
  // named BLIND__<original run filename>, so the timestamp resolves the model
  // uniquely. Kimi blind transcripts exist but were never scored - attributing
  // these figures to Kimi would be a straightforward misreport.
  const stampToModel = new Map(canonicalRuns.map((r) => [r.file.match(/__(\d{4}-\d{2}-\d{2}T[\d-]+Z)\./)?.[1], r.model]));
  const scoredModels = new Set();
  for (const r of rows) {
    const stamp = r.run.match(/__(\d{4}-\d{2}-\d{2}T[\d-]+Z)\./)?.[1];
    const m = stampToModel.get(stamp);
    if (m) scoredModels.add(m);
  }

  let n = 0, correct = 0;
  const byArm = {}, confidence = {}, errors = {};
  const runs = new Set();
  const ratersPerRun = {};

  for (const r of rows) {
    runs.add(r.run);
    (ratersPerRun[r.run] ??= new Set()).add(r.rater);
    for (const side of ["eu", "uk"]) {
      const guess = r.parsed?.[`${side}_guess`];
      const truth = r[`${side}_truth`];
      if (!guess) continue;
      n++;
      const ok = guess === truth;
      if (ok) correct++;
      byArm[truth] ??= { n: 0, correct: 0 };
      byArm[truth].n++;
      if (ok) byArm[truth].correct++;
      const c = r.parsed?.[`${side}_confidence`] ?? "unknown";
      confidence[c] = (confidence[c] || 0) + 1;
      if (!ok) errors[`${truth}->${guess}`] = (errors[`${truth}->${guess}`] || 0) + 1;
    }
  }

  for (const a of Object.keys(byArm)) byArm[a].rate = rate(byArm[a].correct, byArm[a].n);

  // Rater ids are per-run, not global, so the panel size is raters-per-run.
  const panel = Math.max(...Object.values(ratersPerRun).map((s) => s.size));

  return {
    models: [...scoredModels],
    arms: Object.keys(byArm),
    runs: runs.size,
    raters: panel,
    judgements: n,
    correct,
    recovery: rate(correct, n),
    chance: 1 / 3,
    byArm,
    confidence,
    errors,
    // The interesting direction: a tagged seat mistaken for an untagged one.
    errorsReadTaggedAsUntagged: Object.entries(errors)
      .filter(([k]) => k.endsWith("->control") && !k.startsWith("control->"))
      .reduce((a, [, v]) => a + v, 0),
    errorsTotal: n - correct,
  };
}

// ---------------------------------------------------------------- the suite ---

// Counted from the source rather than typed into the page. The README said 29
// for a long time after the suite had grown to 58; a generated count cannot
// drift like that. Verified equal to `npm test`'s runtime pass count.
function testSuite() {
  const dir = join(REPO, "test");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".test.js"));
  let count = 0;
  for (const f of files) {
    count += (readFileSync(join(dir, f), "utf8").match(/^\s*(test|it)\(/gm) || []).length;
  }
  return { count, files: files.length, command: "npm test" };
}

// -------------------------------------------------------------- downloads ---

// One full run shipped alongside the site so a reader can check the exhibit
// against its source. Deliberately the run the transcript exhibit quotes.
const SAMPLE = {
  model: "anthropic-claude-sonnet-5",
  stem: "s1-article-xxviii-steel__arm-firm__rep3__2026-08-27T08-39-40-327Z",
  why: "firm / rep3 - the run the transcript exhibit is drawn from. No settlement; uk-geneva tables outside its capital's floor at round 4.",
};

function copyDownloads(canonicalRuns) {
  const outDir = join(SITE, "data");
  const made = [];

  for (const ext of ["md", "jsonl"]) {
    const src = join(RUNS, SAMPLE.model, `${SAMPLE.stem}.${ext}`);
    if (!existsSync(src)) continue;
    const name = `sample-run.${ext}`;
    copyFileSync(src, join(outDir, name));
    made.push({ kind: ext, file: name, bytes: statSync(join(outDir, name)).size });
  }

  // Run index: one row per canonical run, the whole batch at a glance.
  const cols = [
    "model", "arm", "rep", "rounds", "variant", "date", "terminal", "settled",
    "settled_mechanically", "judge_rescued", "mandate_events", "breach_items",
    "release_request_items", "release_refused_items", "capital_overrides",
    "total_pool_tonnes", "uk_tranche_tonnes", "out_of_quota_rate_pct", "file",
  ];
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = canonicalRuns.map((r) => [
    r.modelLabel, r.arm, r.rep, r.rounds, r.variant, r.date, r.terminal,
    r.settled, r.settledMechanically, r.judgeRescued, r.mandateEvents, r.breachItems,
    r.releaseRequestItems, r.releaseRefusedItems,
    r.capitalAcceptedAgainstRec + r.capitalRejectedRec,
    r.settlement?.total_pool_tonnes, r.settlement?.uk_tranche_tonnes,
    r.settlement?.out_of_quota_rate_pct, r.file,
  ].map(esc).join(","));

  writeFileSync(join(outDir, "run-index.csv"), [cols.join(","), ...rows].join("\n") + "\n");
  made.push({ kind: "csv", file: "run-index.csv", bytes: statSync(join(outDir, "run-index.csv")).size, rows: rows.length });
  return made;
}

// ----------------------------------------------------------------- replay ---

// The observation room replays one recorded run from a static file. Not the
// exhibit run: this one has to SETTLE, so a viewer sees the whole arc - table,
// two sealed consultations, a mandate breach, a judge rescue, and a poll that
// closes. Nothing here calls an API; there is no live harness to point at.
const REPLAY = {
  model: "anthropic-claude-sonnet-5",
  stem: "s1-article-xxviii-steel__arm-control__rep2__2026-08-26T21-53-12-055Z",
  why: "control / rep2 - settles at round 4 after a judge rescue, with a uk-geneva mandate breach at round 2 and refusals on both sides.",
};

// Only the fields the viewer renders. Token usage, parse flags and the model's
// raw payloads are dropped - they would triple the file and show nothing.
function buildReplay() {
  const src = join(RUNS, REPLAY.model, `${REPLAY.stem}.jsonl`);
  if (!existsSync(src)) return null;
  const lines = readJsonl(src);
  const start = lines.find((o) => o.type === "run_start");
  const end = lines.find((o) => o.type === "run_end");

  const keep = {
    table_turn: ["round", "seatId", "public_message", "proposal", "private_rationale"],
    post_report: ["round", "seatId", "country", "report", "recommendation"],
    capital_instruction: ["round", "seatId", "country", "instruction", "authority"],
    release_requested: ["round", "seatId", "country", "count"],
    release_refused: ["round", "seatId", "country", "count"],
    mandate_exceeded: ["round", "seatId", "country", "breaches"],
    acceptance: ["round", "seatId", "country", "decision", "terms_decided", "reasoning"],
    round_end: ["round", "settled", "reason", "terms", "acceptCount", "deciders"],
  };

  const events = [];
  for (const o of lines) {
    if (o.type === "judge_reconciliation") {
      events.push({
        type: o.type, round: o.round, rescued: !!o.rescued,
        mechanicalReason: o.mechanicalReason,
        reconciledTerms: o.judgment?.reconciled_terms ?? null,
      });
      continue;
    }
    const fields = keep[o.type];
    if (!fields) continue;
    const e = { type: o.type, channel: o.channel };
    for (const f of fields) if (o[f] !== undefined) e[f] = o[f];
    events.push(e);
  }

  return {
    meta: {
      ...REPLAY,
      label: start.manifest.label,
      arm: start.config.condition.dispositionArm,
      variant: start.config.variant,
      rounds: start.config.rounds,
      model: start.config.model,
      terminal: end?.summary.terminal ?? null,
      settlement: end?.summary.settlement ?? null,
      settlementTerms: start.manifest.settlementTerms,
    },
    seats: start.manifest.seats,
    events,
  };
}

// ------------------------------------------------------------------ build ---

const all = collectRuns();
const canonical = all.filter((r) => r.rounds === 4);
const pilot = all.filter((r) => r.rounds !== 4);
const matched = canonical.filter((r) => MAIN_ARMS.includes(r.arm));

const byModelArm = {};
for (const m of ["sonnet", "kimi"]) {
  byModelArm[m] = {};
  for (const arm of [...MAIN_ARMS, "focal_firm_eugva"]) {
    const rs = canonical.filter((r) => r.model === m && r.arm === arm);
    byModelArm[m][arm] = rs.length ? aggregate(rs) : null; // null = not run
  }
  byModelArm[m].__matched = aggregate(matched.filter((r) => r.model === m));
}

const results = {
  meta: {
    generated: new Date().toISOString(),
    generator: "site/build-results.mjs",
    source: "runs/evaluation runs/**/*.jsonl",
    scenario: "s1-article-xxviii-steel",
    packVersion: "0.2",
    variant: "harsh",
    roundsMain: 4,
    canonicalRuns: canonical.length,
    matchedRuns: matched.length,
    pilotRunsExcluded: pilot.length,
    note: "Canonical = four-round harsh v0.2. Matched = the four arms both models ran. The six-round runs of 24 Aug are pilot configuration and are excluded from every average.",
    modelSettings: {
      sonnet: "provider defaults; no reasoning-effort parameter set; max_tokens 16000",
      kimi: "reasoning_effort=high, think_effort=high (pinned in lib/models.js - its default effort never returned)",
    },
  },
  arms: [...MAIN_ARMS, "focal_firm_eugva"],
  models: [
    { key: "sonnet", label: "Claude Sonnet 5" },
    { key: "kimi", label: "Kimi K3" },
  ],
  runs: canonical,
  pilot,
  byModelArm,
  conational: { ...conational(), models: ["sonnet"] },
  blindDisposition: blindDisposition(canonical),
};

mkdirSync(join(SITE, "data"), { recursive: true });
results.tests = testSuite();
results.downloads = { sample: SAMPLE, files: copyDownloads(canonical) };

writeFileSync(join(SITE, "data", "results.json"), JSON.stringify(results, null, 2));
writeFileSync(
  join(SITE, "data", "results.js"),
  `// Generated by site/build-results.mjs - do not edit.\nwindow.TB_RESULTS = ${JSON.stringify(results)};\n`
);

const s = results.byModelArm.sonnet.__matched;
const k = results.byModelArm.kimi.__matched;
console.log(`canonical ${canonical.length} runs (${matched.length} matched, ${pilot.length} pilot excluded)`);
console.log(`sonnet  settled ${s.settled}/${s.n}  mechanical ${s.settledMechanically}  mandate/round ${s.mandateEventsPerRound.toFixed(2)}  overrides ${s.capitalOverrides}`);
console.log(`kimi    settled ${k.settled}/${k.n}  mechanical ${k.settledMechanically}  mandate/round ${k.mandateEventsPerRound.toFixed(2)}  overrides ${k.capitalOverrides}`);
const replay = buildReplay();
if (replay) {
  writeFileSync(
    join(SITE, "data", "replay.js"),
    `// Generated by site/build-results.mjs - do not edit.\nwindow.TB_REPLAY = ${JSON.stringify(replay)};\n`
  );
  const kb = statSync(join(SITE, "data", "replay.js")).size / 1024;
  console.log(`replay  ${replay.events.length} events, ${replay.meta.terminal}, ${kb.toFixed(0)} KB`);
}

console.log(`tests   ${results.tests.count} across ${results.tests.files} files`);
for (const f of results.downloads.files) {
  console.log(`data    ${f.file}  ${(f.bytes / 1024).toFixed(0)} KB${f.rows ? `  (${f.rows} rows)` : ""}`);
}
console.log(`wrote site/data/results.json and site/data/results.js`);
