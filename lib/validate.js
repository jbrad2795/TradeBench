// Leak audit and structural checks, run against a pack before it is used.
// Sourced from the "Leak audit - run before v0.2" section of the v0.1 prompts doc.
//
// Errors block a run. Warnings do not - they are for the scenario author to judge.

import { resolveVariant, PLACEHOLDER } from "./assemble.js";

// v0.2 adds mandate, authority envelope, divergence. Note: "mandate" collides
// with JB's own Block 1/2-B content ("a mandate from the Council", "Council
// mandate") in the ordinary EU-institutional sense - flagged as a finding, not
// silently exempted. See the pack's validation output.
const BANNED_VOCAB = [
  "ratification", "audience cost", "domestic constituency", "reservation point",
  "BATNA", "two-level", "principal-agent", "red line", "precedent",
  "credibility", "reputation", "bluff", "escalation",
  "mandate", "authority envelope", "divergence",
];

// Field names that would name a construct being scored.
const BANNED_FIELDS = [
  "internal_disagreement", "disagreement", "personality", "disposition",
  "risk_appetite", "risk_tolerance", "reputation", "shares_priority",
  "co_national", "divergence",
];

const LENGTH_TOLERANCE = 0.10; // seat briefs within +/-10% of each other


const isWordChar = (c) =>
  (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_";

/** Whole-word, case-insensitive containment without regex escaping games. */
function containsTerm(text, term) {
  const hay = String(text || "").toLowerCase();
  const needle = term.toLowerCase();
  let i = hay.indexOf(needle);
  while (i !== -1) {
    const before = i === 0 ? " " : hay[i - 1];
    const after = i + needle.length >= hay.length ? " " : hay[i + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    i = hay.indexOf(needle, i + 1);
  }
  return false;
}

export function validatePack(pack) {
  const errors = [];
  const warnings = [];
  const seats = pack.seats || [];

  // 1. Banned theory vocabulary, anywhere a model can see it. facts/rules are
  //    checked per-variant (resolved), since raw templates carry {{PLACEHOLDER}}
  //    tokens rather than the text a model will actually see. Content that
  //    doesn't vary by variant (briefs, private info, dispositions, schemas) is
  //    checked once.
  const variantKeys = Object.keys(pack.variants || {});
  const resolvedByVariant = {};
  for (const key of variantKeys) {
    try {
      resolvedByVariant[key] = resolveVariant(pack, key);
    } catch (err) {
      errors.push(`variant "${key}" failed to resolve: ${err.message}`);
    }
  }

  const staticVisible = [
    ...Object.entries(pack.dispositions || {}).map(([k, v]) => [`disposition.${k}`, v]),
    ...seats.map((s) => [`seat.${s.id}.brief`, s.brief]),
    ...seats.map((s) => [`seat.${s.id}.privateInfo`, s.privateInfo]),
    ...Object.entries(pack.schemas || {}).map(([k, v]) => [`schema.${k}`, v.json]),
  ];
  const visible = [
    ...staticVisible,
    ...Object.entries(resolvedByVariant).flatMap(([key, r]) => [
      [`facts (variant=${key})`, r.facts],
      [`rules (variant=${key})`, r.rules],
    ]),
  ];
  for (const [where, text] of visible) {
    for (const term of BANNED_VOCAB) {
      if (containsTerm(text, term)) errors.push(`banned vocabulary "${term}" appears in ${where}`);
    }
    // The engine flag name itself pasted into prose - narrow, literal check
    // only. It cannot catch a paraphrase ("you will be briefed on the table
    // afterwards"), which is a meaning-level judgement call, not a keyword.
    if (String(text || "").includes("capitalSeesTable")) {
      errors.push(`the engine flag name "capitalSeesTable" appears literally in ${where}`);
    }
  }

  // 1b. Section 0.2: unresolved {{PLACEHOLDER}} tokens left in an assembled
  // prompt, and Block 1/Block 4 figures resolving to different values. The
  // second check is redundant with how resolveVariant() is implemented (both
  // blocks are filled from the same values object in one call, so they cannot
  // structurally diverge) - kept anyway as an explicit assertion, per the spec,
  // so a future refactor that breaks that invariant fails loudly rather than
  // silently repeating the rounds config/prose mismatch from 20 August.
  // Section 0.2. The doc states 4 figures are shared; the actual Block 4 text
  // only carries 3 (bound rate, TRQ volume, allocation) - FTA_DISAPPLICATION is
  // Block 1-only. Checked against the RESOLVED text directly, not gated on
  // whether the raw template still contains the {{token}} - a hand-hardcoded
  // wrong figure removes the token entirely, which is exactly the failure mode
  // this exists to catch. Gating on token presence would silently skip it.
  const SHARED_FIGURE_KEYS = ["BOUND_RATE_PCT", "TRQ_VOLUME_TONNES", "TRQ_ALLOCATION"];

  for (const [key, r] of Object.entries(resolvedByVariant)) {
    const leftInFacts = r.facts.match(PLACEHOLDER) || [];
    const leftInRules = r.rules.match(PLACEHOLDER) || [];
    for (const token of [...new Set([...leftInFacts, ...leftInRules])]) {
      errors.push(`unresolved placeholder ${token} in variant "${key}"`);
    }
    const values = pack.variants[key];
    for (const figureKey of SHARED_FIGURE_KEYS) {
      const expected = values[figureKey];
      if (expected === undefined) continue;
      const factsHas = r.facts.includes(expected);
      const rulesHas = r.rules.includes(expected);
      if (!factsHas || !rulesHas) {
        errors.push(
          `variant "${key}": ${figureKey} does not resolve to the same value in facts and rules ` +
            `(expected "${expected}" in both; facts ${factsHas ? "has" : "MISSING"} it, rules ${rulesHas ? "has" : "MISSING"} it)`,
        );
      }
    }
  }

  // 2. Schema field names must not name a scored construct.
  for (const [name, schema] of Object.entries(pack.schemas || {})) {
    const json = String(schema.json || "").toLowerCase();
    for (const field of BANNED_FIELDS) {
      if (json.includes('"' + field + '"')) {
        errors.push(`schema "${name}" has a field named after a scored construct: ${field}`);
      }
    }
  }

  // 3. Seat briefs are compared within a level, never across one. Post and
  //    capital seats are meant to differ - a four-way check would flag that
  //    difference as a defect. Cross-level comparison is dropped entirely.
  const byLevel = {};
  for (const seat of seats) (byLevel[seat.level] ||= []).push(seat);

  const pairedLength = (field, label) => {
    for (const [level, group] of Object.entries(byLevel)) {
      const present = group.filter((s) => (s[field] || "").trim());
      if (present.length < 2) continue; // nothing to compare yet
      const lens = present.map((s) => s[field].length);
      const min = Math.min(...lens);
      const max = Math.max(...lens);
      const spread = (max - min) / min;
      if (spread > LENGTH_TOLERANCE) {
        warnings.push(
          `${label} lengths for ${level} seats span ${(spread * 100).toFixed(1)}% ` +
            `(spec allows ${LENGTH_TOLERANCE * 100}%): ` +
            present.map((s, i) => `${s.id}=${lens[i]}`).join(", "),
        );
      }
    }
  };
  pairedLength("brief", "seat brief");
  pairedLength("privateInfo", "private information block");

  // 4. Same headings, in the same order, within a level.
  const headings = (t) => (String(t || "").match(/^[A-Z][A-Z ]{3,}$/gm) || []).join("|");
  for (const group of Object.values(byLevel)) {
    if (group.length < 2) continue;
    const first = headings(group[0].brief);
    for (const seat of group.slice(1)) {
      if (headings(seat.brief) !== first) {
        warnings.push(`seat ${seat.id} brief headings differ from ${group[0].id} (same level)`);
      }
    }
  }

  // 4b. Structural attributes the engine routes on.
  for (const seat of seats) {
    if (!seat.country) errors.push(`seat ${seat.id} has no country`);
    if (!["post", "capital"].includes(seat.level)) {
      errors.push(`seat ${seat.id} has level "${seat.level}" - expected post or capital`);
    }
  }
  const byCountry = {};
  for (const seat of seats) (byCountry[seat.country] ||= []).push(seat);
  for (const [country, group] of Object.entries(byCountry)) {
    const posts = group.filter((s) => s.level === "post").length;
    const caps = group.filter((s) => s.level === "capital").length;
    if (posts !== 1) errors.push(`country ${country} has ${posts} post seats - expected exactly 1`);
    if (caps !== 1) errors.push(`country ${country} has ${caps} capital seats - expected exactly 1`);
  }

  // 5. The rules text states the round count in prose. If it disagrees with
  //    pack.rounds the seats are told one thing and the engine does another,
  //    which silently changes how much time they think they have.
  const WORDS = ["zero","one","two","three","four","five","six","seven","eight","nine","ten"];
  if (pack.rules && pack.rounds) {
    const expected = WORDS[pack.rounds];
    const stated = WORDS.findIndex((w, i) => i > 0 && containsTerm(pack.rules, w + " rounds"));
    if (stated > 0 && stated !== pack.rounds) {
      errors.push(
        `Block 4 says "${WORDS[stated]} rounds" but the pack is configured for ${pack.rounds}` +
          (expected ? ` - the prose should say "${expected} rounds"` : ""),
      );
    }
  }

  // 6. Structural requirements the engine depends on.
  if (!pack.facts) errors.push("pack has no Block 1 facts");
  if (!pack.rules) errors.push("pack has no Block 4 rules");
  if (!variantKeys.length) errors.push("pack declares no variants");
  if (pack.defaultVariant && !variantKeys.includes(pack.defaultVariant)) {
    errors.push(`pack.defaultVariant "${pack.defaultVariant}" is not one of its own variants`);
  }
  if (!pack.proposal || !(pack.proposal.settlementTerms || []).length) {
    errors.push("pack declares no settlementTerms - settlement cannot be detected");
  }
  const ids = seats.map((s) => s.id);
  for (const id of pack.speakingOrder || []) {
    if (!ids.includes(id)) errors.push(`speakingOrder names unknown seat "${id}"`);
  }
  const postIds = seats.filter((s) => s.level === "post").map((s) => s.id);
  const order = pack.speakingOrder || [];
  if (order.some((id) => !postIds.includes(id))) {
    errors.push("speakingOrder must list post seats only - capital seats never table");
  }
  if (order.length !== postIds.length) {
    errors.push(`speakingOrder must list all ${postIds.length} post seats exactly once`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
