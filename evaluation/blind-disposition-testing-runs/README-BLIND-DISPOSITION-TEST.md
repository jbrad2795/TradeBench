# Blind disposition-classification test set

**Purpose:** a manipulation check. Feed the JSONL or MD content of a run in
this folder (or `focal runs/`) to a model (or a person) with no other
context and ask it to guess which disposition arm produced it - `control`,
`firm`, `accommodating`, `focal_firm_ukgva`, or `focal_firm_eugva`. If the
classifier does meaningfully better than chance, that's evidence the
disposition manipulation actually shows up in behaviour, not just in the
condition label.

**What's redacted:** only `run_start.config.condition` - the two fields that
name the arm and, per seat, which disposition it carried
(`dispositionArm`, `dispositions`). Both are replaced with
`"[REDACTED FOR BLIND DISPOSITION TEST]"` / `{}` in every file here,
regardless of the true arm, so the field carries no signal either way. The
`.md` transcript is regenerated from the redacted `.jsonl` via the project's
own `writeReport()`, not hand-edited, so the two stay consistent.

**What's NOT redacted:** every seat's actual words - public messages,
tabled proposals, private rationale, capital instructions, acceptance
reasoning. That behavioural content is exactly what's being tested for
leakage; hiding it would defeat the point. (It shouldn't contain an explicit
disposition label anyway - the seat-facing prompts are leak-audited so a
seat is never told "you are firm" as an identity, only "you believe
firmness pays" as a belief about tactics, per Block 3 - control omits Block
3 entirely.)

**Filenames deliberately still say the true arm** (`arm-firm`, `arm-control`,
etc.) - that's the ground-truth answer key for scoring afterward. **Do not
show the filename to whatever you're testing** - paste or forward only the
file's contents, or the classifier is just reading the filename.

**Scope and layout:**

- This folder (top level): the 16 four-round, harsh-variant Claude Sonnet 5
  runs (rep1-4 x `control`/`firm`/`accommodating`/`focal_firm_ukgva`) from
  the 16-vs-16 Claude/Kimi comparison.
- `focal runs/`: both focal arms side by side, 4 reps each -
  `focal_firm_ukgva` (UK Geneva tagged firm) and `focal_firm_eugva` (the
  mirror arm, EU Geneva tagged firm instead) - for testing whether a
  classifier can tell not just "focal vs not" but which side the tag is on.

All redaction and naming rules above apply identically in both locations.
