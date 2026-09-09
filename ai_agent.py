import sys
import json
import logging
import traceback
import requests
from datetime import datetime
from typing import Any, Dict, List

try:
    import google.generativeai as genai  # type: ignore[reportMissingImports]
except ImportError as exc:
    genai = None
    _GENAI_IMPORT_ERROR = exc

# Model configuration
MODEL_NAME = "gemini-3.6-flash"
MAX_HISTORY_TURNS = 20

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | PalBet-AI | %(message)s")
logger = logging.getLogger("palbet-ai")

# Global variable to hold the football key during execution
FOOTBALL_API_KEY = ""

# ============================================================
# THE TOOLS (Function Calling)
# ============================================================

def get_team_injuries_and_news(team_name: str) -> str:
    """
    Fetches the latest real-time injury data and team information directly from the live API-Football database.
    Call this tool whenever the user asks about injuries, lineups, or team status.
    """
    logger.info(f"Gemini activated tool: get_team_injuries_and_news for {team_name}")
    
    if not FOOTBALL_API_KEY or FOOTBALL_API_KEY == "null":
        return "[SYSTEM: Football API key is missing. Tell the user you cannot connect to the live database.]"

    headers = {'x-apisports-key': FOOTBALL_API_KEY}
    
    try:
        search_url = f"https://v3.football.api-sports.io/teams?search={team_name}"
        search_res = requests.get(search_url, headers=headers).json()
        
        if not search_res.get("response"):
            return f"[SYSTEM: Could not find live database records for team: {team_name}]"
            
        team_id = search_res["response"][0]["team"]["id"]
        actual_name = search_res["response"][0]["team"]["name"]
        
        injury_url = f"https://v3.football.api-sports.io/injuries?team={team_id}"
        injury_res = requests.get(injury_url, headers=headers).json()
        
        injuries = injury_res.get("response", [])
        
        if not injuries:
            return f"[LIVE DATABASE] Team: {actual_name}. Status: No currently registered injuries in the database."
            
        formatted_data = f"[LIVE DATABASE] Team: {actual_name}\nCurrent Verified Injuries:\n"
        for inj in injuries[:5]:
            player = inj["player"]["name"]
            reason = inj["injury"]["reason"]
            fixture = inj["fixture"]["date"]
            formatted_data += f"- {player} (Reason: {reason}, Date Reported: {fixture[:10]})\n"
            
        return formatted_data
        
    except Exception as e:
        return f"[SYSTEM: Database ping failed: {str(e)}]"


def get_league_standings(league_name: str) -> str:
    """
    Fetches live league standings, tables, point totals, and rankings for any football league in the world.
    Call this tool whenever the user asks about league tables, who is leading/top of a league, or points.
    """
    logger.info(f"Gemini activated tool: get_league_standings for '{league_name}'")
    
    if not FOOTBALL_API_KEY or FOOTBALL_API_KEY == "null":
        return "[SYSTEM: Football API key is missing. Tell the user you cannot connect to the live database.]"

    headers = {'x-apisports-key': FOOTBALL_API_KEY}
    
    # 1. Direct map for top global leagues
    league_map = {
        "premier league": 39,
        "la liga": 140,
        "serie a": 135,
        "bundesliga": 78,
        "ligue 1": 61,
        "champions league": 2,
        "europa league": 3,
        "usl championship": 255,
        "mls": 253,
        "championship": 40
    }
    
    league_id = None
    cleaned_query = league_name.lower().strip()
    
    for key, id_val in league_map.items():
        if key in cleaned_query:
            league_id = id_val
            break
            
    # 2. Dynamic lookup fallback if not in the common dictionary
    if not league_id:
        try:
            lookup_url = f"https://v3.football.api-sports.io/leagues?search={league_name}"
            lookup_res = requests.get(lookup_url, headers=headers).json()
            if lookup_res.get("response"):
                league_id = lookup_res["response"][0]["league"]["id"]
        except Exception:
            pass

    if not league_id:
        return f"[SYSTEM: Could not locate a registered league ID for '{league_name}'. Ask the user to clarify the league name.]"

    # 3. Query standings (try current year, then previous year if season is transitionary)
    current_year = datetime.now().year
    try:
        standings_url = f"https://v3.football.api-sports.io/standings?league={league_id}&season={current_year}"
        res = requests.get(standings_url, headers=headers).json()
        
        if not res.get("response"):
            standings_url = f"https://v3.football.api-sports.io/standings?league={league_id}&season={current_year - 1}"
            res = requests.get(standings_url, headers=headers).json()
            
        if not res.get("response"):
            return f"[SYSTEM: No active standings found for league ID {league_id} in the database.]"
            
        league_info = res["response"][0]["league"]
        actual_league_name = league_info["name"]
        standings = league_info["standings"][0]
        
        formatted_data = f"[LIVE DATABASE] League: {actual_league_name} Standings (Top 6):\n"
        for team in standings[:6]:
            rank = team.get("rank")
            name = team.get("team", {}).get("name")
            points = team.get("points")
            form = team.get("form", "N/A")
            diff = team.get("goalsDiff", 0)
            formatted_data += f"{rank}. {name} | {points} pts (GD: {diff}, Form: {form})\n"
            
        return formatted_data

    except Exception as e:
        return f"[SYSTEM: Failed to retrieve standings: {str(e)}]"

# ============================================================
# Core Agent Logic
# ============================================================

def json_response(response: str, success: bool = True) -> None:
    print(json.dumps({"success": success, "response": response}, ensure_ascii=False))

def format_history_for_gemini(history: list) -> list:
    if not isinstance(history, list): return []
    gemini_history = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        if not isinstance(turn, dict): continue
        text = str(turn.get("text", "")).strip()
        if not text: continue
        gemini_history.append({
            "role": "user" if turn.get("role", "user") == "user" else "model",
            "parts": [text]
        })
    return gemini_history

def run_agent() -> None:
    global FOOTBALL_API_KEY
    
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            json_response("No input received.", success=False)
            return

        payload = json.loads(raw_input)
        api_key = payload.get("api_key", "").strip().strip('"').strip("'")
        FOOTBALL_API_KEY = payload.get("football_key", "").strip().strip('"').strip("'")
        match_context = str(payload.get("match", "Unknown Fixture")).strip()
        user_message = str(payload.get("message", "")).strip()
        history = payload.get("history", [])

        if not api_key or api_key == "null":
            json_response("Missing Gemini API Key.", success=False)
            return

        if genai is None:
            json_response(
                "The Google Generative AI package is not installed. "
                "Install it with: pip install google-generativeai",
                success=False,
            )
            return

        genai.configure(api_key=api_key)

        # Hand both tools to Gemini
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            tools=[get_team_injuries_and_news, get_league_standings],
            system_instruction=(
                f"You are PalBet-AI, an elite sports predictive analyst discussing {match_context}. "
                "You are connected to the live API-Football database. "
                "Whenever asked about injuries, player statuses, news, or LEAGUE STANDINGS/TABLES, "
                "YOU MUST CALL YOUR TOOLS to check the live database. "
                "Never guess points, rankings, or players from memory."
            )
        )

        chat = model.start_chat(
            history=format_history_for_gemini(history),
            enable_automatic_function_calling=True 
        )

        response = chat.send_message(user_message)
        response_text = getattr(response, "text", None)
        if not response_text:
            json_response("The model returned an empty response.", success=False)
            return
        json_response(str(response_text).strip(), success=True)

    except Exception as exc:
        logger.exception("Unexpected PalBet-AI failure")
        json_response(f"**System Crash Details:**\n`{str(exc)}`\n\n```text\n{traceback.format_exc()}\n```", success=False)

if __name__ == "__main__":
    run_agent()