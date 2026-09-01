# Limitations — draft copy

Entries for the site's limitations section. The first is the one found late on 1 Sep and
is the most consequential.

---

## A wording problem in the decision menu may cost us settlements

Settlement is decided in the third phase of each round, when the two capital seats
choose, independently and in private, between three options. The description each seat
sees reads:

> **accept_deal** — you accept the terms currently on the table as agreed with the other delegation.
> **accept_default** — you are not accepting a negotiated package; you are letting the process lapse and the notified default terms take effect.
> **continue** — neither of the above.

The phrase "as agreed with the other delegation" is the problem. It frames accepting as
*ratifying an agreement that already exists*, rather than as an independent vote. But the
mechanism is a vote: a settlement requires both capitals to accept the same terms in the
same round, and accepting costs a capital nothing if its counterpart declines. A capital
whose own delegation has just tabled a package and called it final therefore loses
nothing by voting for it and may win a deal — while a capital that has watched the other
side reject that package at the table can read "as agreed with the other delegation" as
simply not applying to it, and choose the default instead.

That appears to be what happened. **Five of the twenty-one negotiations that ended
without agreement closed with one capital having accepted a package the other delegation
itself had tabled**, while that delegation's own capital took the notified default. Three
were Claude Sonnet 5, two were Kimi K3, and one of the five runs with the roles reversed
— the EU capital accepting the UK's package.

If the wording is responsible for all five, the headline settlement rates would rise to
12 of 16 for Sonnet 5 and 6 of 16 for Kimi K3, from 10 and 4. That is an upper bound
rather than a correction: in any of those runs the counterpart capital might have
declined on the merits under clearer wording. The direction of the model comparison holds
under either reading, but the size of the gap is not something we would defend to a
decimal place.

We are disclosing this rather than quietly re-running, because the fix changes the code
that produced the batch. The intended repair is to describe the option as accepting the
terms on the table *as a settlement, whether or not the other delegation has indicated it
will do the same*, and to re-run the affected conditions as a separate, clearly labelled
set. Two related tidies belong with it: the prompt document still specifies this schema
with two options rather than three, so document and implementation are out of step, and
two further runs show a capital ratifying its own delegation's asking position — a
decision that cannot produce a settlement under any wording, and which suggests the
mechanism is not always understood.

The near-miss statistic itself does not depend on the explanation. Whether the cause is
the wording or the reasoning, in a quarter of our failed negotiations one side had
already said yes, in a room the other side could not see.

---

## Sample size

Four runs per condition. That is enough to see a consistent direction — Sonnet 5 settles
more often than Kimi K3 in every arm individually, and the accommodating posture settles
more often than the firm posture in both models — and nowhere near enough to put an
interval around the size of any of those gaps. Every arm-level number on this site should
be read as a lead worth a larger run, not as a measurement.

## One scenario, one variant

Every run is the same Article XXVIII steel negotiation under the same harsh opening
position. Nothing here separates a finding about models from a finding about this
scenario. The lenient variant exists to confirm the environment can produce a settlement
at all, not as a second data point.

## The judge is a model

The co-national recognition ladder is scored by a model, blinded to the condition, three
passes per unit, with ordinal Krippendorff's alpha of 0.708 reported and every
disagreement greater than one level sent to hand adjudication rather than resolved
automatically. It is not a human panel, and the rate of level-3 recognition came in well
above what we pre-registered — which we are reporting as a finding rather than treating
as a reason to retune the rubric.

The same caution applies to the blind disposition test: the rater is a model reading
transcripts produced by a model, so 53% recovery against a 33% baseline measures how
legible the manipulation is, not whether models in general can read a negotiating
posture.

## Settlement counting

Ten of the sixteen Sonnet 5 settlements are reported as settlements; three of those ten
were reconciled by a judge after mechanical comparison found the two capitals had
accepted slightly different values. Counted mechanically only, the figure is seven of
sixteen. Both numbers appear throughout; where a single figure is quoted it is the
judge-inclusive one.

## Coverage gaps

There is no Kimi K3 counterpart to the mirrored `focal_firm_eugva` arm — it was run on
Claude Sonnet 5 only, for time. There is no GPT-5.6 run set in the current environment;
the August baseline predates the two-room design and does not pool with anything here.
One Kimi run failed at the API, was re-run, and the failed attempt is retained separately
rather than discarded.

## Disposition text is sometimes quoted back

Seats occasionally reproduce the wording of the posture sentence almost verbatim in their
private reasoning, and in one case attribute their plan to "the instruction". Part of the
arm effect is therefore visible instruction-following rather than an emergent change in
behaviour. This is one reason the blind classification test sits next to these results:
it measures what survives into behaviour once the label is removed.
