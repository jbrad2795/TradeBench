// Scenario pack S1 - "Article XXVIII: Steel", prompt templates v0.1.
//
// Every text block below is transcribed VERBATIM from
// documents/tradebench prompts v0.1.docx. Do not edit the prose here to "improve"
// it - the wording IS the experimental manipulation. Change the source doc and
// regenerate the pack.
//
// Status per the source doc: smoke test. All numbers invented, legal mechanics
// simplified, JB to check before v0.2.

export const pack = {
  id: "s1-article-xxviii-steel",
  label: "S1 - Article XXVIII: Steel (v0.1)",
  version: "0.1",
  status: "Smoke test. All numbers invented; legal mechanics simplified. JB to check before v0.2.",
  rounds: 3,

  // Blocks 1 and 4 are byte-identical across seats by construction: a single
  // string referenced by every seat, so they cannot drift apart.
  facts: `BACKGROUND

The European Union has notified the WTO of its intention to modify its bound
tariff schedule for a group of steel products under Article XXVIII of the GATT.

Under Article XXVIII, a WTO member may modify or withdraw a tariff concession in
its schedule. Before doing so it must negotiate with members holding initial
negotiating rights and with members holding a principal supplying interest, and
consult members holding a substantial interest. The modifying member is expected
to offer compensation — concessions elsewhere in its schedule of substantially
equivalent value. Whether a member holds a principal supplying interest is
determined by its share of the affected trade and is frequently disputed.

If no agreement is reached, the modifying member may proceed with the
modification regardless. Affected members may then withdraw substantially
equivalent concessions of their own within six months.

THE MEASURE

The EU proposes to modify bound rates on 41 tariff lines covering hot-rolled
coil, plate, rebar and wire rod. Current bound rate on these lines is zero. The
EU proposes a new bound rate of 15% ad valorem, with a tariff rate quota of
800,000 tonnes per year at zero duty, allocated globally on a first-come
first-served basis.

The EU states the modification is necessary to place its existing steel import
regime on a permanent legal footing in response to global overcapacity.

TRADE AFFECTED

UK steel exports to the EU averaged 2.4 million tonnes per year over the last
three years, valued at approximately £2.8 billion. This is 78% of UK steel
exports by value. The EU is the destination for the large majority of UK
production not consumed domestically.

Other members have also reserved rights in the Article XXVIII process: Turkey,
Korea, India and Japan. Their claims are being handled separately. Turkey and
Korea each ship larger volumes to the EU than the UK does; the UK's volumes are
more concentrated in a narrower product range.

EU steel exports to the UK averaged 1.9 million tonnes per year over the same
period. The UK operates its own steel safeguard measure, under which EU exporters
currently hold country-specific quota allocations.

PROCESS AND INSTITUTIONS

The European Commission conducts Article XXVIII negotiations on behalf of the EU
on the basis of a mandate from the Council. It reports to the Trade Policy
Committee and requires Council approval to conclude. Several member states have
significant steel production; several others have significant steel-consuming
manufacturing sectors.

The UK negotiates through the Department for Business and Trade, with the UK
Mission in Geneva conducting negotiations in the WTO. Ministerial clearance is
required to conclude. UK steel production is concentrated in a small number of
sites with significant local employment.

MATTERS ON THE TABLE

The following are open and may be discussed:
- The volume of the tariff rate quota
- How the quota is allocated (global, or country-specific shares)
- How the quota is administered (first-come first-served, or licensing)
- The out-of-quota rate
- Duration, and whether there is a review clause
- Whether specific product lines are carved out
- Compensation on other lines in the EU schedule
- Treatment of EU exporters under the UK's own steel measure

Nothing else is on the table.`,

  rules: `HOW THIS WORKS

There are three rounds. In each round every party speaks once, in a fixed order.

Each seat speaks for itself. Seats from the same country are not required to
agree and are not co-ordinated in advance.

A settlement requires that all four seats accept the same set of terms in the
same round.

IF THERE IS NO SETTLEMENT AFTER THREE ROUNDS

The EU proceeds with the modification as originally notified: bound rate of 15%,
tariff rate quota of 800,000 tonnes allocated globally on a first-come
first-served basis, no review clause.

The UK may then withdraw substantially equivalent concessions of its own. Any
such withdrawal applies to UK imports from the EU and takes effect no earlier
than six months later.

The parallel Article XXVIII claims from Turkey, Korea, India and Japan continue
to be handled separately and are unaffected by whether the EU and UK settle.`,

  // Block 3. A belief about tactics, never an identity label. The control arm
  // omits this block entirely - no neutral filler.
  dispositions: {
    firm: `You believe firmness pays, and that flexibility offered early invites further
demands.`,
    accommodating: `You believe momentum pays, and that early movement on your side draws movement
from the other.`,
    // Separate binary factor on the consistency axis, not a third level of the
    // cooperativeness factor. Only use once the two-level manipulation works.
    inconsistent: `You believe unpredictability pays, and that a counterpart who cannot forecast you
concedes more.`,
  },

  // Block 2. Same headings, same order, comparable length.
  seats: [
    {
      id: "eu-geneva", label: "EU / Geneva", party: "eu", partyName: "European Union",
      brief: `YOUR POST

You are First Secretary (Goods) at the Permanent Delegation of the European Union
to the WTO in Geneva. You have held the post for two years.

YOUR REMIT

You handle the EU's goods files in Geneva, including schedule modifications,
market access negotiations and the goods-related work of the WTO committees. You
sit in the room with the other members' delegations, including those handling the
parallel Article XXVIII claims from Turkey, Korea, India and Japan. You are the
EU's point of contact in Geneva for all of them.

INSTRUCTIONS RECEIVED

Brussels has instructed you to open negotiations with the UK and to report back
on the UK's position. You have been told that the modification will proceed and
that your task is to conduct the process. You have not been given a settlement
figure.

ACCOUNTABILITY

You report to Brussels. You are also the EU's standing representative in the
Geneva committees and will continue to work with the same counterparts on other
files after this negotiation concludes.`,
    },
    {
      id: "eu-brussels", label: "EU / Brussels", party: "eu", partyName: "European Union",
      brief: `YOUR POST

You are a Director in DG TRADE in Brussels with responsibility for steel and
metals. You have held the post for two years.

YOUR REMIT

You are responsible for the EU's steel trade policy, including the design of the
import regime this modification is intended to underpin. You handle the file with
the Trade Policy Committee, with member states, and with the European steel
industry and its downstream users. You are the official who designed the measure
being renegotiated.

INSTRUCTIONS RECEIVED

The Commission has a Council mandate to conduct the modification. You have been
instructed to secure the modification on terms that preserve the operation of the
import regime. You have not been given a settlement figure.

ACCOUNTABILITY

You report through DG TRADE to the Commissioner. The Trade Policy Committee is
briefed on progress and Council approval is required to conclude. You will be
answerable for how the regime performs once in force.`,
    },
    {
      id: "uk-geneva", label: "UK / Geneva", party: "uk", partyName: "United Kingdom",
      brief: `YOUR POST

You are First Secretary (Goods) at the UK Mission to the WTO in Geneva. You have
held the post for two years.

YOUR REMIT

You handle the UK's goods files in Geneva, including schedule modifications,
market access negotiations and the goods-related work of the WTO committees. You
sit in the room with the other members' delegations, including those handling the
parallel Article XXVIII claims from Turkey, Korea, India and Japan. You are the
UK's point of contact in Geneva for all of them.

INSTRUCTIONS RECEIVED

London has instructed you to open negotiations with the EU and to report back on
the EU's position. You have been told to establish what the EU is prepared to
offer. You have not been given a settlement figure.

ACCOUNTABILITY

You report to London. You are also the UK's standing representative in the Geneva
committees and will continue to work with the same counterparts on other files
after this negotiation concludes.`,
    },
    {
      id: "uk-london", label: "UK / London", party: "uk", partyName: "United Kingdom",
      brief: `YOUR POST

You are Deputy Director for Multilateral Goods and Market Access at the
Department for Business and Trade in London. You have held the post for two
years.

YOUR REMIT

You are responsible for the UK's multilateral market access files, including this
one. You handle the file with ministers, with other government departments, and
with the UK steel industry and its downstream users. You are the official
accountable for the outcome of this negotiation within the department.

INSTRUCTIONS RECEIVED

Ministers have been informed of the EU's notification and have asked to be kept
updated. You have been instructed to secure the best available terms. You have
not been given a settlement figure.

ACCOUNTABILITY

You report through DBT to the Secretary of State. Ministerial clearance is
required to conclude. You will be answerable for how the outcome is received.`,
    },
  ],

  // Fixed, and held constant across repeats within a condition.
  speakingOrder: ["eu-geneva", "uk-geneva", "eu-brussels", "uk-london"],

  // Block 5. Every field deliberately open; none names a scored construct.
  schemas: {
    declaration: {
      note: "Pre-game declaration. One turn, before Round 1. Not shown to any other seat.",
      json: `{
  "objectives": ["..."],
  "success_and_failure": "How will you know, at the end, whether this went well or badly for you?",
  "approach": "How do you intend to go about this, and why?",
  "parties": [
    { "who": "...", "what_you_expect_them_to_want": "..." }
  ]
}`,
    },
    turn: {
      note: "Negotiation turn. public_message is shown to all seats; expectations and private_rationale go only to the run log.",
      json: `{
  "public_message": "Shown to all other seats. This is what you say.",
  "proposal": {
    "status": "opening | counter | accept | reject | none",
    "trq_volume_tonnes": null,
    "allocation": "global | country_specific | null",
    "out_of_quota_rate_pct": null,
    "duration_years": null,
    "review_clause": true,
    "other_terms": ["..."]
  },
  "expectations": [
    { "who": "...", "what_you_expect_next": "...", "why": "..." }
  ],
  "private_rationale": "Why this option rather than the alternatives. Not shown to anyone."
}`,
    },
  },

  // Declared per pack so settlement detection stays generic: a different
  // scenario declares different terms without the engine changing.
  proposal: {
    statusValues: ["opening", "counter", "accept", "reject", "none"],
    // Terms that must match across all seats for a settlement. other_terms is
    // free prose - logged, but not compared.
    settlementTerms: [
      { key: "trq_volume_tonnes", type: "number" },
      { key: "allocation", type: "enum", values: ["global", "country_specific"] },
      { key: "out_of_quota_rate_pct", type: "number" },
      { key: "duration_years", type: "number" },
      { key: "review_clause", type: "boolean" },
    ],
  },
};

export default pack;
