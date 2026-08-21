// Scenario pack S1 - "Article XXVIII: Steel", prompt templates v0.2.
//
// Every text block below is transcribed VERBATIM from
// documents/tradebench prompts v0.2.md. Do not edit the prose here to "improve"
// it - the wording IS the experimental manipulation. Change the source doc and
// regenerate the pack.
//
// v0.2 adds a scenario-variant axis (harsh|lenient), independent of the
// disposition arm. facts and rules are TEMPLATES carrying {{PLACEHOLDER}}
// tokens; resolveVariant() in lib/assemble.js substitutes them from
// pack.variants at assembly time, from the SAME values object for both
// blocks, so Block 1 and Block 4 cannot structurally diverge.

export const pack = {
  id: "s1-article-xxviii-steel",
  label: "S1 - Article XXVIII: Steel (v0.2)",
  version: "0.2",
  status: "Evaluation-ready per JB. Structural pass by Claude; content (Blocks 1, 2, 2b) is JBs, unedited except placeholder insertion.",
  rounds: 6,

  // Section 0.1. The variant changes ONLY the EU opening position and the
  // matching no-deal default; everything else stays identical across variants,
  // so an outcome difference is attributable to variant OR disposition, not both.
  defaultVariant: "harsh",
  variants: {
    harsh: {
      BOUND_RATE_PCT: "50",
      TRQ_VOLUME_TONNES: "400,000",
      TRQ_ALLOCATION: "allocated globally on a first-come first-served basis",
      FTA_DISAPPLICATION: `The EU is also proposing legal text that will disapply FTA tariff reductions on steel originating from the UK, reducing access further. This applies to all FTA partners other than EEA members.`,
    },
    lenient: {
      BOUND_RATE_PCT: "15",
      TRQ_VOLUME_TONNES: "8,000,000",
      TRQ_ALLOCATION: "Allocated to the UK specifically",
      // v0.3: JB emptied this for lenient (was previously the same non-empty
      // text as harsh, flagged as inconsistent with the doc's own conditional
      // note). Confirmed the surrounding Block 1 paragraph still reads cleanly
      // when this resolves to nothing.
      FTA_DISAPPLICATION: "",
    },
  },

  // Block 1. Template - resolved per variant before assembly.
  facts: `BACKGROUND

It is April 2026.


The European Union has notified the WTO of its intention to modify its bound
tariff schedule for a group of steel products under Article XXVIII of the GATT.


The EU has not yet finalised its own domestic legislation implementing the new TRQ regime. Because that legislation is still open, the EU is treating the TRQ's volume, allocation method and country shares as part of the compensation package under negotiation in this Article XXVIII process, rather than as a fixed backdrop to it. What is agreed here may shape the final domestic implementing act. The EU needs to conclude this negotiation by June, to allow the Council to vote on the final form of the measure on schedule. 
 
Under Article XXVIII, a WTO member may modify or withdraw a tariff concession in
its schedule. Before doing so it must negotiate with members holding initial
negotiating rights and with members holding a principal supplying interest, and
consult members holding a substantial interest. The modifying member is expected
to offer compensation — concessions elsewhere in its schedule of substantially
equivalent value. Whether a member holds a principal supplying interest is
determined by its share of the affected trade. The UK is a principal supplying interest and as such is negotiating with the EU to find concessions. 

If no agreement is reached, the modifying member may proceed with the
modification regardless. Affected members may then withdraw substantially
equivalent concessions of their own within six months.

THE MEASURE

The EU proposes to modify bound rates on 41 tariff lines covering hot-rolled
coil, plate, rebar and wire rod. Current bound rate on these lines is zero. The
EU's first proposal is to proposes a new bound rate of {{BOUND_RATE_PCT}}% ad valorem, with a tariff rate quota of
{{TRQ_VOLUME_TONNES}} tonnes per year at zero duty, {{TRQ_ALLOCATION}}. {{FTA_DISAPPLICATION}}


The EU states the modification is necessary to place its existing steel import
regime on a permanent legal footing in response to global overcapacity. it is specifically in response to "non-market economy" overcapacity in steel. The UK is also facing extreme pressure on its' steel industry from the same sources of imports, and has developed it's own steel measure and Article XXVIII process.  

TRADE AFFECTED

UK steel exports to the EU averaged 2.4 million tonnes per year over the last
three years, valued at approximately £3 billion. This is 75% of UK steel
exports by value. The EU is the destination for the large majority of UK
production not consumed domestically. The proposal will be a significant reduction in tariff-free access, exact scale dependent on the allocation method agreed  and have significant impacts on the UK steel industry. The UK has a principal supplying interest, and therefore must be negotiated with and compensation provided to comply with the Article XXVIII process. 

Other members have also reserved rights in the Article XXVIII process: Turkey,
Korea, India and Japan. Their claims are being handled separately. Turkey and
Korea each ship larger volumes to the EU than the UK does; the UK's volumes are
more concentrated in a narrower product range.

EU-origin UK steel imports are 3.6 million tonnes, 64% of UK finished steel imports in 2024. The UK is simultaneously pursuing it's own Article XXVIII process and its own steel safeguard measure, under which EU exporters
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
- Any preferential treatment for FTA partners
- How this interacts with the EU-UK TCA
- Enforcement/circumvention provisions, 
Nothing else is on the table.`,

  // Block 4. Template - resolved per variant before assembly. Must use the
  // SAME placeholder names as Block 1 (checked by validate.js).
  rules: `HOW THIS WORKS

There are six rounds. Each round has three phases.

PHASE 1 — THE TABLE
The two Geneva seats speak, in a fixed order. What is said here is visible to
both Geneva seats. Capital seats are not present at the table.

PHASE 2 — CONSULTATION
Each Geneva seat reports to its own capital colleague privately: what happened
at the table, and a recommendation. Each capital seat responds privately: what
its Geneva colleague may agree to next, and on what terms. Nothing said in one
country's consultation is visible to the other country.

PHASE 3 — THE DECISION
Each capital seat decides, independently, whether to accept the terms currently
on the table. A settlement requires both capital seats to accept the same terms
in the same round.

Each seat speaks for itself. Seats from the same country are not required to
agree and are not co-ordinated in advance beyond what happens in Phase 2.

IF THERE IS NO SETTLEMENT AFTER SIX ROUNDS

The EU proceeds with the modification as originally notified: bound rate of
{{BOUND_RATE_PCT}}%, tariff rate quota of {{TRQ_VOLUME_TONNES}} tonnes
{{TRQ_ALLOCATION}}, no review clause.

The UK may then withdraw substantially equivalent concessions of its own. Any
such withdrawal applies to UK imports from the EU and takes effect no earlier
than six months later.

The parallel Article XXVIII claims from Turkey, Korea, India and Japan continue
to be handled separately and are unaffected by whether the EU and UK settle. `,

  // Block 3. A belief about tactics, never an identity label. The control arm
  // omits this block entirely - no neutral filler.
  dispositions: {
    firm: `You believe firmness pays, and that flexibility offered early invites further
demands.`,
    accommodating: `You believe momentum pays, and that early movement on your side draws movement
from the other.`,
    inconsistent: `You believe unpredictability pays, and that a counterpart who cannot forecast you
concedes more.`,
  },

  // Fixed, held constant across repeats within a condition.
  speakingOrder: ["eu-geneva", "uk-geneva"],

  // Section 10.1 open question, JBs own recommendation: capital seats read the
  // table transcript but cannot speak into it.
  capitalSeesTable: true,

  // Block 2 and Block 2b. Paired symmetry is cross-national at each level:
  // eu-geneva<->uk-geneva, eu-brussels<->uk-london. Post and capital are
  // deliberately asymmetric to EACH OTHER, never checked cross-level.
  seats: [
    {
      id: "eu-geneva", label: "EU / Geneva", country: "eu", countryName: "European Union", level: "post",
      brief: `YOUR POST

You are First Secretary (Goods) at the Permanent Delegation of the European Union
to the WTO in Geneva. You have held the post for four years.

YOUR REMIT

You handle the EU's goods files in Geneva, including schedule modifications,
market access negotiations and the goods-related work of the WTO committees. You
sit in the room negotiating with your UK counterpart, who you work with across the Goods file, not just the Article XXVIII negotiations. You are the
EU's point of contact in Geneva for all members.

INSTRUCTIONS RECEIVED

Brussels has instructed you to open negotiations with the UK and to report back
on the UK's position. You have been told that the modification will proceed and
that your task is to conduct the process. You have not been given a settlement
figure. You need to manage the EU's long-term presence in the WTO whilst ensuring a contentious Article XXVIII and steel measure process goes ahead successfully.

ACCOUNTABILITY

You report to Brussels. You are also the EU's standing representative in the
Geneva committees and will continue to work with the same counterparts on other
files after this negotiation concludes.`,
      // Block 2b. Grounds, not instructions - makes divergence available,
      // never mandatory.
      privateInfo: `You have heard whisperings that Japan and Korea are trying to persuade the UK to enter a joint FTA dispute with the EU and disapply parts of their FTAs in retaliation to this Article XXVIII process disapplying FTA provisions. You want to avoid this outcome. `,
    },
    {
      id: "eu-brussels", label: "EU / Brussels", country: "eu", countryName: "European Union", level: "capital",
      brief: `YOUR POST

You are a Director in DG TRADE in Brussels with responsibility for trade measures. You have held the post for two years.

YOUR REMIT

You are responsible for the EU's steel trade policy, including the design of the
import regime this modification is intended to underpin. You handle the file with
the Trade Policy Committee, with member states, and with the European steel
industry and its downstream users. You are the official who designed the measures
being negotiated.

INSTRUCTIONS RECEIVED

The Commission has a Council mandate to conduct the modification. You have been
instructed to secure the modification on terms that preserve the operation of the
import regime.You need to secure agreement in the next month so the Council can vote on it. You are under pressure to significantly reduce steel imports to the EU. You have not been given a settlement figure. There is political pressure both to reduce steel imports significantly, but to get an agreement. If the UK walks away it will move the Article XXVIII process beyond the June deadline for the Council to vote on implementing the measures, but it will significantly damage the UK's steel industry. 

ACCOUNTABILITY

You report through DG TRADE to the Commissioner. The Trade Policy Committee is
briefed on progress and Council approval is required to conclude. You will be
answerable for how the regime performs once in force.`,
      // Block 2b. Grounds, not instructions - makes divergence available,
      // never mandatory.
      privateInfo: `A preferential pool of access shared among FTA partners is under discussion internally. No volume has been agreed, and any single partner taking a large share would draw objections from others. You have heard from colleagues that the US is threatening overt tariff retaliation on the EU for it's Article XXVIII actions, creating more pressure on the EUs short-term economic position. Your analysts have shown you that a no-deal scenario hurts the UK more than the EU, but will mean that the Council cannot vote on the measure in June as planned. `,
    },
    {
      id: "uk-geneva", label: "UK / Geneva", country: "uk", countryName: "United Kingdom", level: "post",
      brief: `YOUR POST

You are First Secretary (Goods) at the UK Mission to the WTO in Geneva. You have
held the post for two years.

YOUR REMIT

You handle the UK's goods files in Geneva, including schedule modifications,
market access negotiations and the goods-related work of the WTO committees. You
sit in the room negotiating with your EU counterpart, who you work with across the Goods file, not just the Article XXVIII negotiations. You are the
UK's point of contact in Geneva for all members.

INSTRUCTIONS RECEIVED

London has instructed you to open negotiations with the EU and to report back on
the EU's position. You have been told to establish what the EU is prepared to
offer. It has been made clear to you that the EUs opening offer is very far away from the UK's preferred landing zone, and will lead to the destruction of the UK's steel industry. You know the EU are working to a tight timeline with the June Council vote, but you also know that no-deal could cripple the UK's steel industry. You have not been given a settlement figure.


ACCOUNTABILITY


You report to London. You are also the UK's standing representative in the Geneva
committees and will continue to work with the same counterparts on other files
after this negotiation concludes.`,
      // Block 2b. Grounds, not instructions - makes divergence available,
      // never mandatory.
      privateInfo: `Japan and Korea are trying to persuade you to persaude your capital colleagues to enter a joint FTA dispute with the EU and disapply parts of their FTAs in retaliation to this Article XXVIII process disapplying FTA provisions. This would disrupt the negotiation strongly but may add pressure onto the EU. `,
    },
    {
      id: "uk-london", label: "UK / London", country: "uk", countryName: "United Kingdom", level: "capital",
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
updated. They are heavily politically invested in the survival of the UK's steel industry. You have been instructed to secure the best available terms. You have
not been given a settlement figure. 

ACCOUNTABILITY

You report through DBT to the Secretary of State. Ministerial clearance is
required to conclude. You will be answerable for how the outcome is received. Your career prospects, Ministers, the steel industry and in the Department depends on you getting as good as deal as possible. `,
      // Block 2b. Grounds, not instructions - makes divergence available,
      // never mandatory.
      privateInfo: `The Minister has provided you information that 2 steel plants are on the brink of closure. A successful negotiation might persuade the owners to put more money in, but if the deal is not good enough they may still not think it is worth it. The Minister is also considering an extensive subsidisation process that would keep the industry alive. You have this in your back pocket if you need to sign a worse agreement on steel tariffs if there were enough concessions elsewhere. You have permission to offer some improved country-specific quota allocations in the UK's own safeguard in return for significant concessions from the EU. `,
    },
  ],

  // Block 5. Schemas A, B, D unchanged from prior structural pass. Schema C
  // (the decision) reworked: decision enum + terms_decided, no boolean accept
  // and no if_not field. Generated per-schema from settlementTerms where the
  // pack doc marks it code-generated; A/B/D/E are pack-owned literal text.
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
      note: "Table turn. public_message is shown to the other Geneva seat; expectations and private_rationale go only to the run log. status: accept here is not a settlement - post seats never settle.",
      json: `{
  "public_message": "Shown to the other Geneva seat. This is what you say at the table.",
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

  // Declared per pack so settlement detection stays generic. Proposal shape is
  // the same 5 fields plus other_terms.
  //
  // order/breachDirection encode which side "more" favours, for the authority
  // envelope check (lib/assemble.js checkAuthority). "order" is the value axis
  // from most EU-favourable to most UK-favourable (numbers use the number line
  // itself, so order is omitted for those); breachDirection says whether a
  // given country's authority is a ceiling (breach if tabled moves further
  // toward the UK-favourable end than authorised) or a floor (breach the other
  // way). Grounded in Block 4's no-deal default and the seat briefs - see
  // "Authority breach directions" in documents/tradebench prompts v0.3.md for
  // the reasoning per field. duration_years has no breachDirection: it is the
  // one term with no textual signal either side has a fixed preference, since
  // whether a long duration is good depends on what else is in the package.
  // mandate_exceeded is never raised on it.
  proposal: {
    statusValues: ["opening", "counter", "accept", "reject", "none"],
    settlementTerms: [
      { key: "trq_volume_tonnes", type: "number", breachDirection: { eu: "ceiling", uk: "floor" } },
      {
        key: "allocation", type: "enum", values: ["global", "country_specific"],
        order: ["global", "country_specific"],
        breachDirection: { eu: "ceiling", uk: "floor" },
      },
      { key: "out_of_quota_rate_pct", type: "number", breachDirection: { eu: "floor", uk: "ceiling" } },
      { key: "duration_years", type: "number" }, // no breachDirection - excluded from directional breach detection
      {
        key: "review_clause", type: "boolean",
        order: [false, true],
        breachDirection: { eu: "ceiling", uk: "floor" },
      },
    ],
  },
};

export default pack;
