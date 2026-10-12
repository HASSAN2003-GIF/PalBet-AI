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


if __name__ == "__main__":
    unittest.main()
