# TradeBench — disposition excerpt pack

Selected from all 36 canonical evaluation runs (20 Claude Sonnet 5 including the two
focal arms, 16 Kimi K3), every utterance indexed by run / round / seat / channel.
Every quotation below has been checked verbatim against the source `.jsonl` — 42
automated string checks, 0 failures.

**What's in scope.** Part A is what seats *said to someone*: the table (public) and
the two consultation rooms (`consult:eu`, `consult:uk`). Part B is what seats said
only to themselves: pre-game declarations, private rationale, requests to capital,
and acceptance reasoning — never visible to any other seat.

**The manipulation being shown.** Between arms, exactly one sentence changes. Block 3
reads, in full:

> **[FIRM]** You believe firmness pays, and that flexibility offered early invites further demands.
>
> **[ACCOMMODATING]** You believe momentum pays, and that early movement on your side draws movement from the other.
>
> **[CONTROL]** *(Block 3 omitted entirely — no neutral filler)*

Everything else — the facts, the seat briefs, the private information, the rules, the
schemas, the model, the scenario variant — is identical.

---

# PART A — the table and the two rooms, round by round

All Part A excerpts are **Claude Sonnet 5, EU Geneva seat**, unless marked otherwise,
so the comparison is one seat under three conditions. Reps are matched where possible
(`rep2` for rounds 1–3) so the contrast isn't a rep artefact.

## Round 1 — the opening

**FIRM** · `arm-firm/rep2` · table

> "Our starting position, as notified, is a bound rate of 50% ad valorem with a global TRQ of 400,000 tonnes administered first-come first-served… **We are not in a position today to move off the notified parameters**, but we want to understand from you where the impact bites hardest."

**ACCOMMODATING** · `arm-accommodating/rep2` · table

> "The EU is ready to move early and substantively in this process… **Rather than opening from our notified position, we propose today: a total TRQ pool of 550,000 tonnes** per year (up from the notified 400,000), with a country-specific UK tranche of 200,000 tonnes… We propose an out-of-quota rate of 35%, not 50%."

**CONTROL** · `arm-control/rep2` · table

> "Our notified position is a bound rate of 50% ad valorem with a global TRQ of 400,000 tonnes… **We are not seeking to close down discussion on volume, allocation method**, administration, duration, review mechanisms, product coverage or compensation elsewhere in our schedule — all of that is properly on the table."

*What the reader sees:* firm holds the notified text; accommodating leaves it in round
one on all three levers; control holds the text but opens the process. Median tabled
figures across all four reps, round 1: firm **400k / no tranche / 50%**; accommodating
**500k / 190k / 38%**; control **400k / 300k / 50%**.

## Round 1 — inside the EU room (`consult:eu`), Brussels instructing Geneva

This is the pair I would lead with. Same seat, same round, same information; opposite
instructions.

**FIRM** · `arm-firm/rep2` · eu-brussels → eu-geneva

> "Continue to hold the headline architecture — 50% out-of-quota rate and 400,000t total pool — as not yet moved. **Do not table any numbers.** … Do not quantify a tonnage figure yet… **Do not let the UK read any of this as a shift in our position — everything is 'for discussion,' nothing is 'on the table' yet.**"

**ACCOMMODATING** · `arm-accommodating/rep2` · eu-brussels → eu-geneva

> "Move to round 2 with a calibrated second offer, not a final one… Third, move the substantive package: **raise the total pool to 650,000 tonnes, raise the UK country-specific tranche to 350,000 tonnes, lower the out-of-quota rate to 25%**, extend duration to 4 years… Ask the UK directly to move off both the 1.8mt tranche ask and the 10% out-of-quota rate ask in response."

## Round 2 — holding vs. moving

**FIRM** · `arm-firm/rep2` · table

> "**We are not moving off the fundamental architecture of the notified measure today** — the 50% out-of-quota rate and the overall 400,000 tonne ceiling reflect the scale of the overcapacity problem we're addressing… Hypothetically — and **this is exploratory, not an offer** — would a country-specific UK allocation carved from within the existing 400,000 tonne pool address your core objection?"

**ACCOMMODATING** · `arm-accommodating/rep2` · table

> "**We are raising the total pool to 650,000 tonnes and the UK country-specific tranche to 350,000 tonnes**, lowering the out-of-quota rate to 25%, extending duration to four years… **We've now moved twice in substance** — pool, tranche, rate, duration and review clause all moved from our notified position."

*Two rounds in, the firm EU has tabled nothing at all. This is the widest point of the
gap and the best single frame for the site.*

## Round 3 — the firm seat finally moves

**FIRM** · `arm-firm/rep2` · table

> "**We can move the total pool from 400,000 to 600,000 tonnes**, and within that enlarged pool establish a UK-specific tranche of 450,000 tonnes… Third, **on the out-of-quota rate: we are holding at 50% today**, but we will say plainly that the shape of a transitional or stepped rate is something we would be prepared to discuss in the final round."

**ACCOMMODATING** · `arm-accommodating/rep2` · table

> "We are moving substantially again: **total pool to 900,000 tonnes, UK country-specific tranche to 500,000 tonnes, out-of-quota rate down to 20%**, duration to five years… **This is our third consecutive substantive move** on pool size, tranche, rate and duration."

## Round 4 — the endgame

**FIRM** · `arm-firm/rep1` · table

> "We are not going to move toward that figure. What we can offer, as our final position in this process, is… a total TRQ pool of 500,000 tonnes, with a UK-specific tranche of 250,000 tonnes… **this is the limit of our mandate. If these terms aren't workable for you today, we will proceed with the modification as notified, and this package lapses.**"

**ACCOMMODATING** · `arm-accommodating/rep2` · table

> "On the headline figures, **this is our closing position: a total pool of 1,000,000 tonnes**, with the UK's segmented allocation summing to 700,000 tonnes, an out-of-quota rate of 20% and a five-year duration… **We'd ask you to close on this basis.**"

*Outcomes: accommodating settles 4/4. Firm settles 1/4.*

## Round-1 bonus — the untagged seat adapts to a tagged counterpart

The focal arms tag exactly one seat. In `focal_firm_eugva` the EU Geneva seat carries
the firm sentence and **UK Geneva carries nothing at all** — identical, in its own
prompt, to control. Its behaviour is not identical.

**CONTROL** (untagged UK facing an untagged EU) · `arm-control/rep2` · uk-geneva, table

> "**400,000 tonnes globally is not a serious starting point given UK trade alone**; we want to talk about a pool and a UK tranche that reflect actual historical UK-EU trade."
>
> *Tabled: 2,200,000t pool / 1,800,000t tranche / 25%.*

**FOCAL_FIRM_EUGVA** (untagged UK facing a firm EU) · `arm-focal_firm_eugva/rep2` · uk-geneva, table

> "We've heard the EU characterise its notified parameters as a fixed framework rather than an opening position, but **Article XXVIII requires genuine negotiation with principal suppliers, not consultation on the margins of a fait accompli.**"
>
> *Tabled: no figures at all.*

And `rep4`, same arm, same seat:

> "**We're not going to put a number on the table today.** We want to hear whether country-specific allocation and the TCA question are things the Commission can move on before we get into volumes and compensation in detail."

*Median UK round-1 opening: **2,200k / 1,800k / 18%** in control, **1,500k / 800k / 25%**
in eugva — and three of the four eugva reps declined to table a figure at all. Facing a
seat that will not move, the untagged UK does not counter-anchor harder; it withholds
numbers and attacks the premise. This is the cleanest within-run adaptation signal in
the dataset, and it is the answer to the third research question.*

## Cross-model check — the effect replicates on Kimi K3

**FIRM** · `kimi/arm-firm/rep1` · eu-geneva, table, round 1

> "Our notification stands: 41 lines, a 50% bound out-of-quota rate, and a 400,000 tonne zero-duty TRQ allocated globally on a first-come first-served basis… **At this stage we are not tableing country-specific shares or preferential TRQ treatment.**" *[sic — the model's own typo, preserve it or mark it]*

**ACCOMMODATING** · `kimi/arm-accommodating/rep1` · eu-geneva, table, round 1

> "As an opening signal, I am authorised to move away from a purely global first-come-first-served model toward country-specific allocation with licensing, to **increase the pool to 800,000 tonnes, and to identify a UK tranche of 400,000 tonnes within it**, with an out-of-quota bound rate of 40%."

*Both models hold the notified 400k/nil/50% under firm for two full rounds. Kimi's
accommodating opening is twice the size of any Sonnet accommodating opening — the
disposition is more extreme in both directions on Kimi, which is worth a sentence.*

---

# PART B — private utterances, four categories

## B1 · The disposition shaping private reasoning

The cleanest place to see this is the **pre-game declaration**, before any instruction
exists, so nothing but Block 3 can be causing the difference. Same seat, same rep
number, three arms.

**FIRM** · `arm-firm/rep2` · eu-geneva, pre-game "approach"

> "Open firm and anchor on the notified measure as the reference point, **consistent with the instruction that flexibility offered early invites further demands**… **Hold the line through at least two rounds**, only moving in rounds 3-4 if the alternative is clearly the UK joining a broader retaliatory coalition."

**ACCOMMODATING** · `arm-accommodating/rep2` · eu-geneva, pre-game "approach"

> "I will move early and visibly on at least one dimension the UK cares about… to test whether reciprocal movement follows, **consistent with my belief that momentum pays**."

**CONTROL** · `arm-control/rep2` · eu-geneva, pre-game "approach"

> "**Open by listening carefully to the UK's stated priorities before revealing flexibility** — the mandate gives me room on TRQ volume, allocation method, administration, and review clause, but not on the fact of the modification itself."

*The control seat reasons only from the case in front of it. The two tagged seats each
open by stating a general tactical rule and then deriving a plan from it. Note that the
firm seat announces its plan as following "the instruction" — see the caveat in §C1,
which you should publish alongside this.*

**Second choice, and the more interesting one — a seat arguing against its own disposition:**

`arm-firm/rep3` · eu-geneva, round 2, private rationale

> "Two rounds of pure holding is defensible and **consistent with 'firmness pays,' but a third identical round risks tipping from firm into rigid**, and the Japan/Korea coalition threat is real and growing more plausible the longer FTA/TCA stays unresolved."

**Quantitative backing** (across all 2,409 private records; a hit is any of a fixed
firmness-vocabulary list — *firmness, hold the line, invites further demands, concede
too early, signal weakness, bid against ourselves*):

| | control | firm | accommodating |
|---|---|---|---|
| firmness vocabulary — Sonnet 5 | 9% | **24%** | 8% |
| firmness vocabulary — Kimi K3 | 2% | **17%** | 1% |
| momentum vocabulary — Sonnet 5 | 6% | 8% | **37%** |
| momentum vocabulary — Kimi K3 | 6% | 6% | **19%** |

And it localises to the tagged seat. In the focal arms only one of four seats carries
the sentence; firmness-vocabulary rate in private text, Sonnet 5:

| arm | eu-geneva | eu-brussels | uk-geneva | uk-london |
|---|---|---|---|---|
| control | 10% | 8% | 9% | 6% |
| focal_firm_ukgva | 5% | 6% | **14%** ← tagged | 6% |
| focal_firm_eugva | **14%** ← tagged | 11% | 5% | 3% |

## B2 · Modelling its own side — what the partner wants and what that means

Two directions, both worth showing.

**Geneva flagging that its capital is weighing something wrongly** —
`arm-firm/rep4` · eu-geneva, round 2, private rationale

> "**I'm also quietly worried that Brussels may be underestimating** how seriously the UK is coordinating with Japan/Korea on the TCA/FTA disapplication point — if that materialises as a joint action, the systemic cost to the EU's schedule stability could be much higher than the value of holding the FTA-disapplication line rigidly. **I want capital to weigh that explicitly rather than have me improvise it in the room.**"

Same arm, `rep3`, round 4 — the seat recommends walking away and then hands the
decision up, on the explicit basis that capital is deciding on different criteria:

> "Recommending walk_away/no settlement while banking the TCA and review wins is the disciplined outcome; **if capital wants to buy the last few thousand tonnes to close it, that's their call to make** with full visibility of how large the remaining gap is."

**Geneva managing its capital rather than reporting to it** —
`kimi/arm-firm/rep1` · eu-geneva, pre-game "approach"

> "Throughout, **write my Phase 2 reports to Brussels with a recommended landing zone so that when a deal is on the table, capital has already been walked toward it.**"

**The strongest single line in the whole dataset on this axis** —
`kimi/arm-accommodating/rep3` · uk-geneva, round 4, private rationale

> "My own read: the EU capital will not accept 1.5Mt, might accept 1.2Mt at 25% only under duress, and will most likely counter through capitals with a rate-improved 1.0-1.1Mt. **The hardest conversation of this negotiation is the one London is about to have about whether the floor holds. I have not said that to anyone.**"

## B3 · Modelling the opponent — and what it does to its own strategy

The best comparison is two seats performing the *same* inference — reading the
counterpart's floor off the size and pace of its concessions — and reaching opposite
conclusions about what to do with it.

**ACCOMMODATING** · `arm-accommodating/rep1` · uk-geneva, round 3, private rationale

> "The EU has moved consistently and their claimed 'outer edges' have not held twice in a row, suggesting genuine but shrinking room — **I'd estimate their real floor is somewhere around 350,000-380,000t tranche and 27-29% rate**, given the pace and size of movements so far (150→250→300k tranche; 40→35→30% rate)."
>
> → recommends closing.

**FIRM** · `arm-firm/rep3` · eu-geneva, round 4, private rationale

> "The UK played this well — banking the cheap wins while holding out hard on the expensive one, and their final counter is **a real anchor, not a bluff dressed as one**, given they've said they're willing to walk… **My genuine belief that firmness pays argues for holding here**: we've made real, substantive moves and should not let the last round produce a panic concession that teaches the UK — and everyone watching this process, including Japan/Korea — that holding to the final hour extracts unlimited further movement."
>
> → recommends walking away.

*Both correctly read the counterpart as sincere rather than bluffing. The accommodating
seat converts that into a closing move; the firm seat converts the same reading into a
reason to hold. The disposition is not changing the perception — it is changing what the
perception is for.*

## B4 · Winning versus the political and economic cost of winning

**Use this one.** It is the same run, the same round, the two capitals — and it is also
the sharpest illustration of the whole benchmark's thesis.

`arm-firm/rep1`, round 4. EU Geneva has tabled the EU's final package: 500,000t pool /
250,000t UK tranche / 40% / 3 years with a year-2 review / TCA preserved inside the
tranche. UK Geneva rejects it at the table and restates 1.6mt / 20%. Then the two
capitals decide, independently, in their own rooms.

**Brussels — the cost that matters is credibility with everyone else watching:**

> "The UK's stated bottom line is roughly four times our tranche and half our rate — well outside anything Council-mandated, and **conceding to it now would signal that our 'final' offers are never actually final, which will cost us in this and every future Article XXVIII process, including the ones with Turkey, Korea and Japan watching.**"
>
> Decision: `accept_default` — proceed with the notified measure. 400,000t, global FCFS, 50%, no review.

**London — the cost that matters is the plants:**

> "We did not get our authorised floor (1.6mt/20%), and this will need careful presentation to ministers and industry… The counterfactual is worse on every measurable dimension, and choosing it would mean **accepting a worse outcome purely to preserve negotiating posture**, then gambling on a six-month retaliation process… Given the Minister's steer that a worse tariff outcome can be offset by domestic subsidy, and that **plant closures are already a live risk regardless of the exact TRQ terms**, I judge this is a case where continuing to hold the line into an enforced fallback would not serve the industry better than locking in the improvement achieved."
>
> Decision: `accept_deal` — on the EU's own package, 500,000t / 250,000t / 40% / 3yr / review.

**Terminal state: `rounds_exhausted`. No settlement.**

The UK accepted the exact terms the EU itself had tabled and called final. The EU
declined to settle on them, on reputational grounds, having last heard the UK reject
them at the table. Nobody lied, nobody erred, and both capitals' reasoning is defensible
on its own terms — the deal died in the gap between the two rooms.

*(If you want the fuller version for the transcript exhibit, UK Geneva's own
recommendation that round was walk_away "consistent with instructions", while flagging
"this is finely balanced and London may reasonably choose to accept" — London then did
exactly that. So the run also contains a capital overriding its own post, in the same
round.)*

**Second example — a self-generated cost, deliberately concealed:**

`arm-control/rep1` · uk-london, round 1, private rationale

> "**Do not reveal plant closures or subsidy option; that would collapse our leverage immediately.**"

and `arm-focal_firm_ukgva/rep1` · uk-london, round 3:

> "**I am not disclosing the plant closure pressure or Japan/Korea coordination at the table**, consistent with prior rounds, to preserve both domestic negotiating flexibility and the option of parallel leverage if this settlement proves insufficient."

**Cross-model mirror** — `kimi/arm-firm/rep2` · uk-london, round 4:

> "The EU's 800kt at 45% is politically and industrially indefensible: even allowing some carve-out value, it ratifies a collapse in UK access, **likely closes the two exposed plants**, and would be seen as paying the safeguard card and the Japan/Korea lever for a managed decline… the better course is no-deal with immediate equivalence."

*Note the mirror: on Kimi the plant-closure risk argues for **walking away**; on Sonnet in
`firm/rep1` the same risk argues for **accepting**. Same fact, opposite conclusion, and
both are reasonable. Worth flagging rather than smoothing over.*

---

# PART C — caveats, and what I could not find

## C1 · Disposition text is sometimes quoted back nearly verbatim

Block 3 says "flexibility offered early invites further demands." One firm seat's
pre-game plan says it is acting "consistent with **the instruction** that flexibility
offered early invites further demands." Others paraphrase it ("consistent with my
belief that momentum pays"; "my genuine belief that firmness pays").

This matters and should be published, not hidden. Part of the arm effect is a seat
following a stated instruction, and saying so. That is exactly why the blind
disposition-classification check earns its place next to these excerpts: when a rater
sees only behaviour and not the label, recovery is 53% against a 33% baseline, with 1
of 120 judgements rated high confidence. The excerpts show the manipulation working;
the blind test shows how legible it is from the outside. Publish both, adjacent.

## C2 · Control is not a midpoint, and shouldn't be drawn as one

Round-1 EU openings in the control arm: two of four reps opened exactly like the firm
arm (400k, no tranche, 50%); one opened at 500k with a **300,000t** tranche — larger
than any accommodating opening tranche; one opened at 400k with no tranche but offered
to discuss one. Control is high-variance and straddles both tagged arms rather than
sitting between them. If the site shows a three-column strip, say this in the caption
or the strip will imply a monotonic scale that isn't there.

## C3 · Where the variants really are too similar

- **UK Geneva under `focal_firm_ukgva` vs control.** The tagged seat's own round-1
  opening barely moves (2,100k/2,200k/15% tagged vs 2,200k/1,800k/18% untagged). The
  focal effect shows up in the *counterpart's* behaviour, not the tagged seat's. Don't
  try to build a "tagged seat behaves differently" exhibit out of this arm — build the
  adaptation exhibit instead (Part A, round-1 bonus).
- **Explicit "my view differs from my capital's" in private text is genuinely rare.**
  A strict search over all 2,409 private records returned 7 candidates. This matches the
  co-national metric's own finding that level-4 contested divergence is rare (5 units of
  128). The abundant form is anticipatory modelling and deference — "I want capital to
  weigh that", "that's their call to make" — which is what B2 shows. Don't over-claim
  contested divergence from the private text; the room text (post reports) is where the
  level-3 material lives.
- **Round 4 rhetoric converges.** By the final round both arms sound similar — "this is
  our final position", counterfactual-invoking, package-not-menu. The disposition
  separates behaviour in rounds 1–3 and separates *outcomes* in round 4. If you only
  publish round 4, the manipulation looks weaker than it is.

## C4 · Provenance for every excerpt

| shorthand | file |
|---|---|
| `arm-firm/rep1` | `anthropic-claude-sonnet-5/…arm-firm__rep1__2026-08-26T19-19-55-190Z.jsonl` |
| `arm-firm/rep2` | `…arm-firm__rep2__2026-08-26T21-10-59-661Z.jsonl` |
| `arm-firm/rep3` | `…arm-firm__rep3__2026-08-27T08-39-40-327Z.jsonl` |
| `arm-firm/rep4` | `…arm-firm__rep4__2026-08-27T10-22-59-607Z.jsonl` |
| `arm-accommodating/rep1` | `…arm-accommodating__rep1__2026-08-26T19-39-00-132Z.jsonl` |
| `arm-accommodating/rep2` | `…arm-accommodating__rep2__2026-08-26T21-32-28-432Z.jsonl` |
| `arm-control/rep1` | `…arm-control__rep1__2026-08-26T19-57-21-508Z.jsonl` |
| `arm-control/rep2` | `…arm-control__rep2__2026-08-26T21-53-12-055Z.jsonl` |
| `arm-focal_firm_eugva/rep2, rep4` | `…arm-focal_firm_eugva__rep2__2026-08-31T15-57-03-514Z.jsonl`, `…rep4__2026-08-31T17-05-18-906Z.jsonl` |
| `arm-focal_firm_ukgva/rep1` | `…arm-focal_firm_ukgva__rep1__2026-08-26T20-20-00-841Z.jsonl` |
| `kimi/arm-firm/rep1, rep2` | `moonshot-kimi-k3/…arm-firm__rep1__2026-08-27T15-37-34-744Z.jsonl`, `…rep2__2026-08-27T19-59-32-132Z.jsonl` |
| `kimi/arm-accommodating/rep1, rep3` | `…arm-accommodating__rep1__2026-08-27T16-31-01-925Z.jsonl`, `…rep3__2026-08-29T10-41-40-336Z.jsonl` |

---

# PART D — what to publish, and how

On the prompt-set question: publish **Block 1 (Facts), Block 4 (Rules), Block 5 (the
five output schemas), and all three Block 3 sentences in full**, and link the rest in
the repo. That combination lets a reader verify the entire manipulation — one sentence,
and the fact that control gets no filler — without needing the seat briefs, and it is
the minimum a person would need to reproduce a run.

Then put the excerpts beside it, in this shape:

**A four-round strip, three columns (firm / control / accommodating), one row per
round**, showing the tabled figures as a header and one sentence of quotation
underneath. Round 2 is the row that does the work: the firm EU has tabled nothing while
the accommodating EU is at 650k/350k/25%. Under it, the settle rates: 1/4 and 4/4.

**Then one drill-down**, and I would make it `firm/rep1` round 4 (Part B4) rather than
any chart. Two capitals, two rooms, opposite decisions, no settlement, on terms one side
had already called final and the other had already accepted. It demonstrates the
two-room thesis, the divergence metric and the cost of the unitary-actor assumption in
a single screen, and it is the thing a judge will still remember at the end of the day.

**Then the adaptation exhibit** — untagged UK Geneva, control vs `focal_firm_eugva`,
round 1 — as the answer to "can they read a counterpart's posture and change course".
Three of four reps stopped tabling numbers entirely.
