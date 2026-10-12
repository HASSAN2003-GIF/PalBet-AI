"""Unit tests for the risk engine's score model and totals parsing.

Run from the repo root:  venv/bin/python -m unittest backtest/test_risk_engine.py -v
"""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import risk_engine as RE  # noqa: E402


class ScoreModelTest(unittest.TestCase):
    P = (0.46, 0.27, 0.27)

    def test_distribution_is_normalised_and_matches_the_market(self):
        for rho in (0.0, -0.1):
            fit = RE.fit_soccer_model(*self.P, rho=rho)
            self.assertAlmostEqual(float(fit["joint"].sum()), 1.0, places=9)
            self.assertLess(fit["fit_rmse"], 0.01)

    def test_dixon_coles_raises_0_0_and_1_1_and_lowers_1_0_0_1_at_fixed_goal_rates(self):
        # Compare the same (lambda_home, lambda_away) cell. (After re-fitting to a fixed 1X2 the
        # lambdas shift to keep the draw probability, so the end effect is judged by the backtest.)
        i, j = 26, 18   # lambda_home 1.40, lambda_away 1.00
        plain = RE._soccer_grid(0.0)["joint"][i, j]
        dc = RE._soccer_grid(-0.12)["joint"][i, j]
        self.assertGreater(dc[0, 0], plain[0, 0])
        self.assertGreater(dc[1, 1], plain[1, 1])
        self.assertLess(dc[1, 0] + dc[0, 1], plain[1, 0] + plain[0, 1])
        self.assertGreater(RE._soccer_grid(-0.12)["pD"][i, j], RE._soccer_grid(0.0)["pD"][i, j])

    def test_over_under_market_moves_the_goal_total(self):
        low = RE.fit_soccer_model(*self.P, p_over25=0.40, rho=0.0)
        high = RE.fit_soccer_model(*self.P, p_over25=0.62, rho=0.0)
        self.assertLess(low["over25"], high["over25"])
        self.assertAlmostEqual(low["over25"], 0.40, delta=0.03)
        self.assertAlmostEqual(high["over25"], 0.62, delta=0.03)
        self.assertLess(low["lambda_home"] + low["lambda_away"], high["lambda_home"] + high["lambda_away"])

    def test_predicted_score_agrees_with_the_most_likely_result(self):
        h, a = map(int, RE.fit_soccer_model(0.60, 0.22, 0.18)["score"].split(" - "))
        self.assertGreater(h, a)
        h, a = map(int, RE.fit_soccer_model(0.30, 0.36, 0.34)["score"].split(" - "))
        self.assertEqual(h, a)


class TotalsMarketTest(unittest.TestCase):
    def game(self, books):
        return {"bookmakers": [{"key": k, "last_update": "2026-10-12T10:00:00Z",
                                "markets": [{"key": "totals", "outcomes": o}]} for k, o in books]}

    def test_consensus_uses_only_the_2_5_line_and_weights_sharp_books(self):
        now = datetime(2026, 10, 12, 11, tzinfo=timezone.utc)
        g = self.game([
            ("pinnacle", [{"name": "Over", "price": 1.80, "point": 2.5}, {"name": "Under", "price": 2.10, "point": 2.5}]),
            ("bet365", [{"name": "Over", "price": 2.00, "point": 2.5}, {"name": "Under", "price": 1.80, "point": 2.5}]),
            ("other", [{"name": "Over", "price": 1.30, "point": 1.5}, {"name": "Under", "price": 3.40, "point": 1.5}]),
        ])
        p = RE.consensus_over25(g, now, 240)
        pin = RE.devig([1.80, 2.10])[0]
        b365 = RE.devig([2.00, 1.80])[0]
        self.assertAlmostEqual(p, (3 * pin + 1 * b365) / 4, places=9)

    def test_no_totals_market_returns_none(self):
        now = datetime(2026, 10, 12, 11, tzinfo=timezone.utc)
        self.assertIsNone(RE.consensus_over25({"bookmakers": []}, now, 240))


class SharpAnchorTest(unittest.TestCase):
    NOW = datetime(2026, 10, 12, 11, tzinfo=timezone.utc)

    def game(self):
        def book(key, h, d, a):
            return {"key": key, "title": key.title(), "last_update": "2026-10-12T10:30:00Z",
                    "markets": [{"key": "h2h", "outcomes": [
                        {"name": "Home FC", "price": h}, {"name": "Draw", "price": d}, {"name": "Away FC", "price": a}]}]}
        return {"home_team": "Home FC", "away_team": "Away FC", "commence_time": "2026-10-12T19:00:00Z",
                "bookmakers": [book("pinnacle", 2.10, 3.40, 3.70), book("soft1", 2.30, 3.10, 3.20),
                               book("soft2", 2.25, 3.20, 3.25), book("soft3", 2.20, 3.30, 3.30),
                               book("soft4", 2.05, 3.60, 3.60)]}

    def analyze(self, anchor):
        old = RE.CFG.anchor
        RE.CFG.anchor = anchor
        try:
            return RE.analyze_game(self.game(), "soccer_epl", "soccer", {}, self.NOW)
        finally:
            RE.CFG.anchor = old

    def test_pinnacle_prices_are_the_probabilities_and_the_fair_price(self):
        row = self.analyze("pinnacle")
        pin = RE.devig([2.10, 3.40, 3.70])
        self.assertEqual(row["prob_source"], "pinnacle")
        self.assertAlmostEqual(row["prob_home"], round(pin[0], 3), places=3)
        self.assertAlmostEqual(row["prob_draw"], round(pin[1], 3), places=3)
        # best home price is soft1 (2.30): judged against Pinnacle's fair home probability
        self.assertEqual(row["outcomes"]["home"]["best_bookmaker"], "Soft1")
        self.assertAlmostEqual(row["outcomes"]["home"]["fair_prob"], round(pin[0], 4), places=4)
        self.assertIn("Pinnacle's fair price", row["outcomes"]["home"]["fair_source"])

    def test_without_an_anchor_the_weighted_consensus_is_used(self):
        row = self.analyze(None)
        self.assertEqual(row["prob_source"], "consensus")
        self.assertNotAlmostEqual(row["prob_home"], round(RE.devig([2.10, 3.40, 3.70])[0], 3), places=3)
        self.assertIn("consensus fair price", row["outcomes"]["home"]["fair_source"])

    def test_missing_anchor_book_falls_back_to_consensus(self):
        g = self.game()
        g["bookmakers"] = g["bookmakers"][1:] + [g["bookmakers"][1] | {"key": "soft5", "title": "Soft5"}]
        row = RE.analyze_game(g, "soccer_epl", "soccer", {}, self.NOW)
        self.assertEqual(row["prob_source"], "consensus")


if __name__ == "__main__":
    unittest.main()
