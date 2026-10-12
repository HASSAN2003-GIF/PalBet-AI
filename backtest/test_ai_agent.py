"""Offline tests for the analyst's data plumbing (no network, no Gemini calls).

    venv/bin/python -m unittest backtest/test_ai_agent.py
"""
import datetime as dt
import os
import sys
import types as pytypes
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import ai_agent  # noqa: E402
import match_research as mr  # noqa: E402

SUMMARY = {
    "standings": {"groups": [{"standings": {"entries": [
        {"id": "1", "stats": [{"name": "rank", "displayValue": "19"}, {"name": "gamesPlayed", "displayValue": "5"},
                              {"name": "wins", "displayValue": "1"}, {"name": "ties", "displayValue": "0"},
                              {"name": "losses", "displayValue": "4"}, {"name": "pointDifferential", "displayValue": "-9"},
                              {"name": "points", "displayValue": "3"}]},
        {"id": "2", "stats": [{"name": "rank", "displayValue": "11"}]},
        {"id": "3", "stats": []},
    ]}}]},
    "lastFiveGames": [
        {"team": {"id": "1"}, "events": [
            {"gameDate": "2026-09-13T14:00Z", "homeTeamId": "1", "homeTeamScore": "0", "awayTeamScore": "5",
             "gameResult": "L", "opponent": {"displayName": "Brighton"}, "competitionName": "Premier League"},
            {"gameDate": "2026-09-19T14:00Z", "homeTeamId": "9", "homeTeamScore": "0", "awayTeamScore": "1",
             "gameResult": "W", "opponent": {"displayName": "Nottingham Forest"}, "competitionName": "Premier League"},
        ]},
    ],
    "seasonseries": [{"type": "head-to-head", "summary": "NEW leads series 1-0", "events": [
        {"date": "2010-02-17T19:45:00Z", "statusType": {"completed": True}, "competitors": [
            {"homeAway": "home", "score": "4", "team": {"displayName": "Newcastle United"}},
            {"homeAway": "away", "score": "1", "team": {"displayName": "Coventry City"}}]}]}],
    "rosters": [{"team": {"displayName": "Coventry City"}, "formation": "4-3-3", "roster": [
        {"starter": True, "athlete": {"displayName": "A Keeper"}, "position": {"abbreviation": "G"}},
        {"starter": False, "athlete": {"displayName": "Sub"}}]}],
}
TEAMS = {"1": "Coventry City", "2": "Newcastle United"}


class ResearchParsing(unittest.TestCase):
    def test_team_names_match_across_feeds(self):
        self.assertTrue(mr.same_team("Velez Sarsfield BA", ["Vélez Sarsfield"]))
        self.assertTrue(mr.same_team("St. Louis City SC", ["St. Louis CITY SC"]))
        self.assertFalse(mr.same_team("Coventry City", ["Newcastle United"]))

    def test_table_lines_only_for_the_two_clubs(self):
        lines = mr.table_lines(SUMMARY, TEAMS)
        self.assertEqual(len(lines), 2)
        self.assertIn("Coventry City: 19 of 3", lines[0])
        self.assertIn("3 points", lines[0])

    def test_recent_results_are_newest_first_and_from_the_clubs_view(self):
        games = mr.recent_results(SUMMARY, TEAMS)["Coventry City"]
        self.assertTrue(games[0].startswith("19 Sep 2026: W 1-0 at Nottingham Forest"))
        self.assertTrue(games[1].startswith("13 Sep 2026: L 0-5 v Brighton"))

    def test_head_to_head_and_lineups(self):
        h2h = mr.head_to_head(SUMMARY)
        self.assertEqual(h2h[0], "17 Feb 2010: Newcastle United 4-1 Coventry City")
        self.assertEqual(mr.lineups(SUMMARY), {"Coventry City": "A Keeper (G) in a 4-3-3"})

    def test_unknown_competition_gives_no_dossier(self):
        self.assertIsNone(mr.research({"sport_key": "soccer_nowhere", "home": {"name": "A"}, "away": {"name": "B"}}))


class AgentPrompt(unittest.TestCase):
    MATCH = {"home": {"name": "Coventry City"}, "away": {"name": "Newcastle United"},
             "probabilities": {"home": 29, "draw": 26, "away": 45}, "kickoff": "2026-10-12T19:00:00Z"}

    def test_system_prompt_carries_both_data_blocks_and_search_state(self):
        now = dt.datetime(2026, 10, 12, 14, 0, tzinfo=dt.timezone.utc)
        text = ai_agent.build_system(self.MATCH, {"text": "--- REAL-WORLD DATA (ESPN) ---"}, False, now)
        self.assertIn("Monday 12 October 2026", text)
        self.assertIn("Coventry City 29%", text)
        self.assertIn("REAL-WORLD DATA (ESPN)", text)
        self.assertIn("Google Search: NOT available", text)
        self.assertIn("BE FAIR TO BOTH SIDES", text)

    def test_grounding_sources_are_deduplicated(self):
        web = lambda u, t: pytypes.SimpleNamespace(web=pytypes.SimpleNamespace(uri=u, title=t))
        meta = pytypes.SimpleNamespace(
            grounding_chunks=[web("https://a", "bbc.com"), web("https://a", "bbc.com"), web("https://b", None)],
            search_entry_point=pytypes.SimpleNamespace(rendered_content="<div>chips</div>"))
        resp = pytypes.SimpleNamespace(candidates=[pytypes.SimpleNamespace(grounding_metadata=meta)])
        sources, html = ai_agent.grounding_sources(resp)
        self.assertEqual(sources, [{"title": "bbc.com", "url": "https://a"}, {"title": "Web source", "url": "https://b"}])
        self.assertEqual(html, "<div>chips</div>")


class FailureReasons(unittest.TestCase):
    def err(self, code, msg):
        e = Exception(msg)
        e.code = code
        return e

    def test_failures_are_categorised_without_secrets(self):
        self.assertEqual(ai_agent.failure_reason(self.err(400, "API key not valid. API_KEY_INVALID")), "auth")
        self.assertEqual(ai_agent.failure_reason(self.err(429, "RESOURCE_EXHAUSTED")), "quota")
        self.assertEqual(ai_agent.failure_reason(self.err(404, "models/x is not found")), "model")
        self.assertEqual(ai_agent.failure_reason(self.err(503, "high demand")), "busy")
        self.assertEqual(ai_agent.failure_reason(self.err(None, "weird")), "unknown")

    def test_missing_key_is_a_setup_problem(self):
        old = os.environ.pop("GEMINI_API_KEY", None)
        try:
            ok, out = ai_agent.generate_analysis("{}", "hello")
        finally:
            if old is not None:
                os.environ["GEMINI_API_KEY"] = old
        self.assertFalse(ok)
        self.assertEqual(out["reason"], "setup")


if __name__ == "__main__":
    unittest.main()
