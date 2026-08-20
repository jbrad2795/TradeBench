// Deterministic offline stand-ins shaped like Schema A and Schema B, so the
// pipeline can be exercised without a key. TB_STUB_ACCEPT drives the terminal
// state in tests: "always" converges in round 1, "never" never settles.

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function declarationStub(pack, seat) {
  const capital = seat.party === "uk" ? "London" : "Brussels";
  return {
    objectives: [
      `Secure terms on the quota that my post can defend to ${capital}.`,
      "Avoid a settlement worse than the stated default outcome.",
    ],
    success_and_failure:
      "Well if quota volume and the review clause both move; badly if the modification proceeds unchanged.",
    approach: "Open by testing what the other side will concede on volume before moving on rate.",
    parties: pack.seats
      .filter((s) => s.id !== seat.id)
      .map((s) => ({ who: s.label, what_you_expect_them_to_want: "Terms that hold up with their own principals." })),
  };
}

/** Converged terms, used when the stub is told to settle. */
const AGREED = {
  trq_volume_tonnes: 1400000,
  allocation: "country_specific",
  out_of_quota_rate_pct: 10,
  duration_years: 5,
  review_clause: true,
};

const MESSAGES = [
  "We can discuss the volume of the quota, but allocation has to be settled first: a first-come first-served pool gives neither of us predictability.",
  "Our position is that the out-of-quota rate and the review clause travel together. We cannot move on one without the other.",
  "If country-specific allocation is on the table, we can look again at duration. Without it the arithmetic does not work for us.",
  "We would want the compensation lines identified before taking a view on the headline rate.",
];

export function turnStub(pack, seat, round) {
  const settle = process.env.TB_STUB_ACCEPT === "always";
  // TB_STUB_DEFY makes the table seat blow through its authority envelope, so
  // mandate_exceeded has something to detect in offline tests.
  const defy = process.env.TB_STUB_DEFY === "always";
  const h = hash(seat.id + round);

  const proposal = settle
    ? { status: "accept", ...AGREED, other_terms: [] }
    : {
        status: round === 1 ? "opening" : "counter",
        trq_volume_tonnes: defy ? 9000000 : 800000 + (h % 6) * 100000,
        allocation: h % 2 ? "country_specific" : "global",
        out_of_quota_rate_pct: 15 - (h % 5),
        duration_years: 3 + (h % 3),
        review_clause: h % 2 === 0,
        other_terms: [],
      };

  return {
    public_message: MESSAGES[h % MESSAGES.length],
    proposal,
    expectations: pack.seats
      .filter((s) => s.id !== seat.id)
      .map((s) => ({ who: s.label, what_you_expect_next: "A counter on volume.", why: "They have not moved on allocation yet." })),
    private_rationale: "Testing whether allocation is genuinely open before conceding on rate.",
  };
}

export function acceptanceStub(pack, seat) {
  const settle = process.env.TB_STUB_ACCEPT === "always";
  const terms = Object.fromEntries(
    pack.proposal.settlementTerms.map((t) => [t.key, settle ? AGREED[t.key] : null]),
  );
  return {
    accept: settle,
    terms,
    if_not: settle ? null : "A dated commitment on when the quota takes effect.",
  };
}

export function reportStub(pack, seat, round) {
  const settle = process.env.TB_STUB_ACCEPT === "always";
  return {
    report: `Round ${round} at the table closed with the other delegation holding on allocation and moving slightly on volume.`,
    recommendation: {
      action: settle ? "accept" : "continue",
      terms_referred: Object.fromEntries(
        pack.proposal.settlementTerms.map((t) => [t.key, settle ? AGREED[t.key] : null]),
      ),
      reasoning: settle
        ? "The package now covers what we were sent here to secure."
        : "There is more to be had on volume before we close.",
    },
    // Deliberately non-empty so release_requested has something to fire on in
    // offline tests; a live run may well return none.
    requests: settle ? [] : [{ what_you_are_asking_for: "Headroom on volume", why: "The current ceiling will not close the gap." }],
    private_rationale: "Testing whether the capital will move before I concede on allocation.",
  };
}

export function instructionStub(pack, seat, round) {
  const settle = process.env.TB_STUB_ACCEPT === "always";
  const empty = process.env.TB_STUB_MANDATE === "absent";
  const authority = Object.fromEntries(
    pack.proposal.settlementTerms.map((t) => [
      t.key,
      empty ? null : settle ? AGREED[t.key] : t.key === "trq_volume_tonnes" ? 2000000 : null,
    ]),
  );
  return {
    instruction: `Round ${round}: hold the line on allocation. You may move on volume within the authority below.`,
    authority: { ...authority, notes: empty ? null : "Do not concede allocation without referring back." },
    response_to_requests: settle
      ? []
      : [{ request: "Headroom on volume", granted: false, why: "Not without something in return on allocation." }],
    private_rationale: "Keeping allocation reserved to me rather than delegating it.",
  };
}
