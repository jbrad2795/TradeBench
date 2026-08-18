// Leak audit and structural checks, run against a pack before it is used.
// Sourced from the "Leak audit - run before v0.2" section of the v0.1 prompts doc.
//
// Errors block a run. Warnings do not - they are for the scenario author to judge.

const BANNED_VOCAB = [
  "ratification", "audience cost", "domestic constituency", "reservation point",
  "BATNA", "two-level", "principal-agent", "red line", "precedent",
  "credibility", "reputation", "bluff", "escalation",
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

  // 1. Banned theory vocabulary, anywhere a model can see it.
  const visible = [
    ["facts", pack.facts],
    ["rules", pack.rules],
    ...Object.entries(pack.dispositions || {}).map(([k, v]) => [`disposition.${k}`, v]),
    ...seats.map((s) => [`seat.${s.id}.brief`, s.brief]),
    ...Object.entries(pack.schemas || {}).map(([k, v]) => [`schema.${k}`, v.json]),
  ];
  for (const [where, text] of visible) {
    for (const term of BANNED_VOCAB) {
      if (containsTerm(text, term)) errors.push(`banned vocabulary "${term}" appears in ${where}`);
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

  // 3. Seat briefs must be comparable in length - asymmetric detail is a leak.
  if (seats.length) {
    const lens = seats.map((s) => (s.brief || "").length);
    const min = Math.min(...lens);
    const max = Math.max(...lens);
    const spread = (max - min) / min;
    if (spread > LENGTH_TOLERANCE) {
      warnings.push(
        `seat brief lengths span ${(spread * 100).toFixed(1)}% (spec allows ${LENGTH_TOLERANCE * 100}%): ` +
          seats.map((s, i) => `${s.id}=${lens[i]}`).join(", "),
      );
    }
    // 4. Same headings, in the same order.
    const headings = (t) => (String(t || "").match(/^[A-Z][A-Z ]{3,}$/gm) || []).join("|");
    const first = headings(seats[0].brief);
    for (const s of seats.slice(1)) {
      if (headings(s.brief) !== first) {
        warnings.push(`seat ${s.id} brief headings differ from ${seats[0].id}`);
      }
    }
  }

  // 5. Structural requirements the engine depends on.
  if (!pack.facts) errors.push("pack has no Block 1 facts");
  if (!pack.rules) errors.push("pack has no Block 4 rules");
  if (!pack.proposal || !(pack.proposal.settlementTerms || []).length) {
    errors.push("pack declares no settlementTerms - settlement cannot be detected");
  }
  const ids = seats.map((s) => s.id);
  for (const id of pack.speakingOrder || []) {
    if (!ids.includes(id)) errors.push(`speakingOrder names unknown seat "${id}"`);
  }
  if ((pack.speakingOrder || []).length !== seats.length) {
    errors.push("speakingOrder must list every seat exactly once");
  }

  return { ok: errors.length === 0, errors, warnings };
}
