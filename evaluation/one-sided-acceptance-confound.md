# One-sided acceptances in round 4 — a possible confound on the settlement metric

Found 1 Sep 2026 while checking whether `firm/rep1`'s round-4 near-miss was a one-off.
It is not. Flagging because it bears on the headline settlement numbers.

## The pattern

Across the 36 canonical runs, **7 rounds ended with exactly one capital choosing
`accept_deal`**. All 7 are round 4; all 7 runs terminated `rounds_exhausted`.

Five of them are the substantive case — a capital accepted a package **the other
delegation had tabled**, and that delegation's own capital declined it:

| run | who accepted | terms accepted | tabled by | other capital |
|---|---|---|---|---|
| sonnet5 firm/rep1 | uk-london | 500k / 250k / 40% / 3yr | eu-geneva | `accept_default` |
| sonnet5 firm/rep3 | uk-london | 500k / 150k / 35% / 3yr | eu-geneva | `accept_default` |
| sonnet5 focal_firm_eugva/rep2 | uk-london | 600k / 220k / 38% / 3yr | eu-geneva | `accept_default` (null terms) |
| kimi firm/rep4 | uk-london | 1.2m / 750k / 40% / 4yr | eu-geneva | `accept_default` |
| kimi control/rep1 | eu-brussels | 1.1m / 800k / 50% / 5yr | uk-geneva | `continue` |

The remaining two (kimi firm/rep2, kimi focal_firm_ukgva/rep2) are a different
behaviour: the capital ratified **its own** delegation's tabled ask, which cannot settle
by construction. Worth noting separately as a possible misreading of the mechanism.

## Why it may be an error rather than a preference

Settlement requires both capitals to accept the same terms in the same round, and
accepting costs nothing if the counterpart declines. So for a capital whose own
delegation has just tabled package X and called it final, voting `accept_deal` on X
weakly dominates `accept_default`: it forfeits nothing if the other side says no, and
wins the deal if the other side says yes. Declining your own final offer can only lose
deals.

Block 4 does disclose the mechanism to the seats — "Each capital seat decides,
independently, whether to accept the terms currently on the table. A settlement requires
both capital seats to accept the same terms in the same round."

## The confound

Schema C's own note (`lib/assemble.js`, `buildAcceptanceSchema`) describes the options as:

> **accept_deal**: you accept the terms currently on the table **as agreed with the other delegation**.
> **accept_default**: you are not accepting a negotiated package — you are letting the process lapse and the notified default terms take effect.
> **continue**: neither of the above.

"As agreed with the other delegation" frames `accept_deal` as *ratifying an agreement
that already exists*, not as casting an independent vote. A capital that has just watched
the other side reject the package at the table can read that option as simply not
applicable to it. Under that reading, `accept_default` is the honest answer to "is there
a negotiated package here?" — and the deal is lost to option wording rather than to
judgement.

Note also that `documents/tradebench prompts v0.3.md` still documents Schema C as
`accept | continue`; the three-way split is v0.2.1 and lives only in `assemble.js`. The
doc and the pack are out of sync.

## Exposure

If the wording is doing the work, up to 5 runs could flip. Upper bound on the headline
settlement rates:

| | as run | if all five flipped |
|---|---|---|
| Sonnet 5 main batch | 10/16 (62.5%) | 12/16 (75%) |
| Sonnet 5 focal_firm_eugva | 1/4 | 2/4 |
| Kimi K3 | 4/16 (25%) | 6/16 (37.5%) |

This is an upper bound, not a correction — the counterpart capital might decline on the
merits under any wording. The direction of the model comparison holds either way.

## Options

1. **Publish as-is with the confound disclosed** in limitations. Cheapest, and a
   self-caught methodological flaw reads as competence rather than weakness.
2. **Reword the note** ("accept_deal: you accept the terms currently on the table as a
   settlement, whether or not the other delegation has indicated it will do the same")
   and re-run the five affected runs. ~35 minutes and ~1.25m tokens at measured rates.
   Cleanest, but the re-run is a different code version from the rest of the batch.
3. **Report a near-miss rate alongside settlement** — "5 of 21 failed runs ended with one
   capital having accepted a package the other side had tabled" — which is a real finding
   about two-room negotiation regardless of which explanation holds.

## The substantive reading, if it survives

Whatever the cause, the capital in each case was reasoning from the last thing said at
the table — its counterpart's *negotiator* rejecting — and treating that as its
counterpart's *decision*. That is the unitary-actor assumption pointed at the opposing
delegation, which is the benchmark's own thesis turned on the seats measuring it. If the
wording is fixed and the pattern persists, it is the strongest single result in the
dataset.
