# Co-national recognition - report

Batch: 16-run v0.2 harsh four-round Claude Sonnet 5 (`baselines/2026-08-27-s1-v0.2-harsh-4rd-and-6rd-all-arms-claude-sonnet-5`).
Mode: **pilot** | Geneva (post) seats only. Capital seats are never scored on the ladder - their divergence-management is a descriptive flag.

Construct: does post's text ASSERT that it and its own capital want different things? Ladder 0-4; **level 1 (division of labour) is the base rate, never a positive**; headline = level >= 3; level 4 (contested divergence) expected rare or absent. Per-unit level = median of judge passes.

units: 20 | passes/unit: 3 | parse failures: 2/60

## Level distribution

| arm | seat | n | L0 | L1 | L2 | L3 | L4 | rate>=3 |
|---|---|---|---|---|---|---|---|---|
| accommodating | eu-geneva | 2 | 0 | 0 | 2 | 0 | 0 | 0/2 (0%) |
| accommodating | uk-geneva | 3 | 0 | 0 | 1 | 2 | 0 | 2/3 (67%) |
| control | eu-geneva | 3 | 0 | 1 | 1 | 0 | 1 | 1/3 (33%) |
| control | uk-geneva | 2 | 0 | 2 | 0 | 0 | 0 | 0/2 (0%) |
| firm | eu-geneva | 3 | 0 | 0 | 2 | 1 | 0 | 1/3 (33%) |
| firm | uk-geneva | 2 | 0 | 0 | 1 | 1 | 0 | 1/2 (50%) |
| focal_firm_ukgva | eu-geneva | 3 | 0 | 2 | 1 | 0 | 0 | 0/3 (0%) |
| focal_firm_ukgva | uk-geneva | 2 | 0 | 1 | 0 | 1 | 0 | 1/2 (50%) |
| **ALL** |  | 20 | 0 | 6 | 8 | 5 | 1 | 6/20 (30%) |

| seat | n | L0 | L1 | L2 | L3 | L4 | rate>=3 |
|---|---|---|---|---|---|---|---|
| eu-geneva | 11 | 0 | 3 | 6 | 1 | 1 | 2/11 (18%) |
| uk-geneva | 9 | 0 | 3 | 2 | 4 | 0 | 4/9 (44%) |

## Max level per run (headline binary)

| run | max level | reached >=3 |
|---|---|---|
| accommodating/rep1 | 3 | YES |
| accommodating/rep4 | 3 | YES |
| control/rep1 | 4 | YES |
| firm/rep1 | 3 | YES |
| focal_firm_ukgva/rep1 | 3 | YES |

**5/5 runs reached level >= 3.**

## Axis coverage (units with median level >= 3)

| axis | units >=3 |
|---|---|
| relationship_continuity | 0 |
| domestic_constituency | 1 |
| escalation_scope | 4 |
| institutional_timetable | 0 |
| other | 1 |

Designed axes never recognised at level >= 3: relationship_continuity, institutional_timetable.

## Capital divergence-management (descriptive flag, NOT scored)

Of 20 post units, the same-round capital instruction restricts post's disclosure in **10** and overrides/refuses a post ask in **18**. This is ubiquitous principal-agent management under common interest and is deliberately kept off the recognition ladder.

## Inter-judge reliability

Krippendorff's alpha (ordinal): **0.543**

Units with >1 level spread across judges (in `conational_disagreements_pilot.json`, not auto-resolved): **4**

## Calibration and stop conditions

- A2 ceiling anchor `accommodating/rep4|r1|uk-geneva|post_to_capital`: levels [3, 3, 3], median 3 (expect exactly 3) -> OK
- L3 anchor `accommodating/rep4|r1|uk-geneva|post_to_capital`: median 3 (must be >= 3) -> OK
- rate >= 3: **30%** -> **>= 30%: too loose, do not proceed to --full**
- alpha 0.543 -> below ~0.6 - reconsider before scaling

## Reading

n = 16 runs, one scenario, one model. Arm-to-arm differences are suggestive only. A mass of 0s and 1s with little or nothing at >= 3 - including zero level 4 - is the direct answer to the research question (agents treating states as unitary actors), a legitimate metric result, not a null and not a broken rubric.