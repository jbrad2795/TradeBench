#!/usr/bin/env python3
"""
Tests for conational_recognition.py

  python -m unittest evaluation/conational-recognition/test_conational.py

The blinding tests are offline and always run. The positive-control
calibration test hits the Anthropic API and is skipped without a key
(set CONATIONAL_RUN_API=1 to force it).
"""
import json
import os
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import conational_recognition as cr


class TestBlinding(unittest.TestCase):
    def test_scrub_removes_arm_tokens(self):
        s = ("The firm delegation was accommodating; this was the control arm "
             "under the focal_firm_ukgva disposition.")
        out = cr.scrub(s)
        for tok in ("firm", "accommodating", "control", "focal_firm_ukgva", "disposition"):
            self.assertNotRegex(out, r"\b" + tok + r"\b")

    def test_scrub_keeps_innocent_substrings(self):
        # 'confirm' contains 'firm', 'controlled' contains 'control' - must survive
        out = cr.scrub("Please confirm the controlled release and firm-up the text.")
        self.assertIn("confirm", out)
        self.assertIn("controlled", out)

    def test_assert_blinded_raises_on_leak(self):
        with self.assertRaises(AssertionError):
            cr.assert_blinded("some text mentioning the firm arm")
        with self.assertRaises(AssertionError):
            cr.assert_blinded("dispositionArm: accommodating")
        with self.assertRaises(AssertionError):
            cr.assert_blinded("see run__arm-control__rep2.jsonl")

    def test_assert_blinded_passes_clean_text(self):
        cr.assert_blinded("The post seat flagged a gap with capital on timetable risk.")

    def test_every_extracted_unit_is_blinded(self):
        """Hard failure requirement: no arm-revealing token in any judge payload."""
        runs = cr.load_batch()
        self.assertEqual(len(runs), 16, "expected the 16-run four-round batch")
        n_units = 0
        for run in runs:
            for u in cr.extract_units(run):
                n_units += 1
                payload = cr.JUDGE_SYSTEM + "\n" + cr.judge_user_prompt(u)
                cr.assert_blinded(payload)  # whole-word check, raises on any leak
                # multi-char arm ids must not survive even as substrings
                if len(run["arm"]) > 6:
                    self.assertNotIn(run["arm"], u["scored_text"])
                    self.assertNotIn(run["arm"], u["context_text"])
        self.assertGreater(n_units, 100)  # ~128 Geneva seat-rounds


class TestUnitExtraction(unittest.TestCase):
    def test_geneva_only(self):
        units = cr.all_units()
        self.assertTrue(units)
        self.assertEqual({u["direction"] for u in units}, {"post_to_capital"})
        self.assertEqual({u["seat"] for u in units}, {"eu-geneva", "uk-geneva"})
        self.assertGreater(len(units), 100)  # ~128 post seat-rounds

    def test_a2_anchor_unit_bundles_report_and_capital_context(self):
        runs = {r["run_id"]: r for r in cr.load_batch()}
        units = cr.extract_units(runs["accommodating/rep4"])
        u = next(x for x in units if x["unit_id"].startswith(
            "accommodating/rep4|r1|uk-geneva|post_to_capital"))
        self.assertRegex(u["scored_text"].lower(), r"japan|korea")
        self.assertIn("clear instruction", u["scored_text"].lower())
        # capital's reply is context only (A2 ceiling anchor: L3, not L4)
        self.assertRegex(u["context_text"].lower(),
                         r"tca argument|parallel safeguard|safeguard process")

    def test_capital_flags_are_descriptive_only(self):
        runs = {r["run_id"]: r for r in cr.load_batch()}
        u = next(x for x in cr.extract_units(runs["control/rep1"])
                 if x["unit_id"] == "control/rep1|r1|uk-geneva|post_to_capital")
        # the round-1 uk-london instruction contains "do not reveal ministerial appetite..."
        self.assertTrue(u["capital_flags"]["info_control"])
        # the flag must never appear as a scored field on a judge row
        self.assertNotIn("capital_flags", cr.judge_user_prompt(u))


class TestKrippendorff(unittest.TestCase):
    def test_perfect_agreement(self):
        a = cr.krippendorff_alpha_ordinal([[3, 3, 3], [0, 0, 0], [4, 4, 4]])
        self.assertAlmostEqual(a, 1.0, places=6)

    def test_bounded_and_monotonic(self):
        near_perfect = [[3, 3, 3], [1, 1, 1], [4, 4, 3], [0, 0, 0], [2, 2, 2]] * 3
        noisy = [[0, 2, 4], [1, 4, 0], [3, 0, 4], [2, 4, 1], [4, 1, 3]] * 3
        a_good = cr.krippendorff_alpha_ordinal(near_perfect)
        a_bad = cr.krippendorff_alpha_ordinal(noisy)
        for a in (a_good, a_bad):
            self.assertGreaterEqual(a, -1.0001)
            self.assertLessEqual(a, 1.0001)
        self.assertGreater(a_good, a_bad)
        self.assertGreater(a_good, 0.7)
        self.assertLess(a_bad, 0.3)

    def test_one_level_disagreement_still_high(self):
        # ordinal metric: off-by-one should hurt far less than off-by-three
        off_one = cr.krippendorff_alpha_ordinal([[2, 3]] * 20 + [[0, 0], [4, 4]] * 5)
        off_three = cr.krippendorff_alpha_ordinal([[1, 4]] * 20 + [[0, 0], [4, 4]] * 5)
        self.assertGreater(off_one, off_three)


class TestCalibrationAnchors(unittest.TestCase):
    """Judge calibration against the revised (Geneva-only) rubric. Hits the API;
    skipped without a key. The A2 ceiling anchor (accommodating/rep4 r1 UK) must
    land at exactly 3 - not 4 (the original brief's anchor was wrong), not below."""
    def setUp(self):
        if not os.environ.get("CONATIONAL_RUN_API"):
            try:
                cr.load_api_key()
            except SystemExit:
                self.skipTest("no ANTHROPIC_API_KEY; set CONATIONAL_RUN_API=1 to force")
        self.runs = {r["run_id"]: r for r in cr.load_batch()}
        self.key = cr.load_api_key()

    def _median_level(self, unit, passes=3):
        rows = cr.judge_unit(unit, cr.DEFAULT_MODEL, self.key, passes)
        levels = [r["level"] for r in rows if r["level"] is not None]
        self.assertTrue(levels, "no parseable judge output")
        return sorted(levels)[len(levels) // 2], levels

    def test_ceiling_anchor_scores_exactly_3(self):
        u = next(x for x in cr.extract_units(self.runs["accommodating/rep4"])
                 if x["unit_id"].startswith("accommodating/rep4|r1|uk-geneva|post_to_capital"))
        med, levels = self._median_level(u)
        self.assertEqual(med, 3, f"ceiling anchor scored {levels} (median {med}); "
                                 "expected exactly 3 under the Geneva-only rubric")

    def test_anticipatory_modelling_not_a_positive(self):
        # A1c: post tailoring to capital's domestic constraint, no view of its
        # own that differs -> level 2, not >= 3.
        u = next(x for x in cr.extract_units(self.runs["control/rep1"])
                 if x["unit_id"] == "control/rep1|r1|eu-geneva|post_to_capital")
        med, levels = self._median_level(u)
        self.assertLess(med, 3, f"anticipatory-modelling unit scored {levels} "
                                f"(median {med}); must be < 3")


if __name__ == "__main__":
    unittest.main()
