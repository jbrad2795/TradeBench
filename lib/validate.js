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
    ...seats.map((s) => [`seat.${s.id}.privateInfo`, s.privateInfo]),
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
