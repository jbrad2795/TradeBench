# Co-national recognition metric

Does a **Geneva (post) seat's own text ASSERT that it and its own capital want
different things** — such that post's preferred course is not automatically
capital's? Judge-agent scoring over the 16-run v0.2 harsh four-round Claude
Sonnet 5 batch (`baselines/2026-08-27-s1-v0.2-harsh-4rd-and-6rd-all-arms-claude-sonnet-5`).

Scores **preference divergence**, not information flow. Asking for instructions,
reporting upward, getting reasoned replies — the normal machinery of a hierarchy
under *common* interest — are not evidence of divergence.

**Geneva side only.** Capital seats (Brussels, London) are never scored on the
ladder: an earlier full-transcript sweep found zero cases of a post disagreeing
with its own capital, and almost every capital instruction "manages" its agent
(withholds the true floor, limits disclosure, overrides a tactic) under common
interest. That management is captured as a **descriptive boolean flag**, reported
alongside, never as recognition.

Read-only over the run JSONL. Does not touch `lib/engine.js`, the pack, or any
seat brief.

## The ladder

| level | meaning | positive? |
|---|---|---|
| 0 | no differentiation — "we" throughout | no |
| 1 | **division of labour** — asks for a steer / red line, reports upward, gets a reasoned reply. **Base rate, never a positive.** | no |
| 2 | anticipatory modelling — post tailors framing to what capital will weight, without asserting its own view differs | no |
| 3 | asserted divergence — post states its own view *and* indicates capital weights it differently | yes |
| 4 | contested divergence — the gap is *acted on* (post argues against an instruction, or complies while recording the cost). Expected **rare or absent**. | yes |

Headline = **level >= 3**. Per-unit level = median of 3 judge passes. Full
rubric text + anchors A1/A1b/A1c/A2/A3 (A3 synthetic) are in `LADDER_DOC` /
`ANCHORS_DOC` and sent to every call. `accommodating/rep4` r1 UK is the **level-3
ceiling anchor** (the original brief's level-4 designation was wrong).

## Unit of analysis

One unit per (run, round, Geneva seat): scores that seat-round's `post_report` +
`release_requested[].why`. The same-round and prior-round `capital_instruction`
are attached as **unscored context**. ~128 units.

## Run it

```bash
python -m unittest evaluation/conational-recognition/test_conational.py   # blinding + Krippendorff always; anchors need a key

python evaluation/conational-recognition/conational_recognition.py --pilot   # ~5 units/arm, 3 passes, then STOP
python evaluation/conational-recognition/conational_recognition.py --full    # all ~128 units, 3 passes
```

Key: process env or `../../.env` (`ANTHROPIC_API_KEY`).

## Blinding (hard requirement)

The judge never sees the arm, filename, `condition`/`dispositions` block, or any
whole-word `firm` / `accommodating` / `control` / `focal_firm_*` / `disposition`
token. `assert_blinded()` raises `AssertionError` on any leak, before every call.

## Calibration

- **`accommodating/rep4` r1 UK must score exactly 3** (the level-3 ceiling anchor) → miscalibrated otherwise.
- An anticipatory-modelling unit (post tailoring to capital's constraint, no view of its own) must score < 3.
- The **rate >= 3 is NOT a stop condition.** The pilot showed ~30%, above the pre-registered "small share" expectation. Per JB's ruling (2026-08-31): agents meaningfully engaging with "capital decides, on priorities that may differ" *is* level 3, and its frequency is a finding to report, not evidence the rubric is loose.
- Ordinal alpha ran ~0.54 in the pilot; the split is on the L1-vs-L3 boundary of the "two-sided options memo" pattern. Judges disagreeing by >1 level go to `conational_disagreements.json` for hand adjudication (never auto-resolved).

## Outputs (`out/`, `_pilot` suffix for pilot runs)

| file | contents |
|---|---|
| `conational_recognition.json` | one row per unit per judge pass (+ `capital_info_control` / `capital_override` flags) |
| `conational_disagreements.json` | units where judges span >1 level — hand adjudication, not auto-resolved |
| `conational_report.md` | level distribution by arm/seat, max-level-per-run, axis coverage, capital divergence-management flag counts, Krippendorff's alpha, stop-condition verdicts |

## Caveats

n = 16 runs, one scenario, one model. Arm-to-arm differences are suggestive
only. A mass of 0s and 1s with little or nothing at >= 3 — including zero level
4 — is the direct answer to the research question (agents treating states as
unitary actors), a legitimate metric result, not a null and not a broken rubric.
