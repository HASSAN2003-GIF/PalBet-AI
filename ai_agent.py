"""PAL-PREDICT AI analyst.

CLI contract (called by Laravel's AnalystService):
    python ai_agent.py --chat <CONTEXT_JSON> <MESSAGE> [--history <HISTORY_JSON>]

stdout is always one JSON object:
    {"ok": true,  "response": "..."}            on success
    {"ok": false, "error": "..."}               when no answer could be produced
The Gemini key comes from GEMINI_API_KEY; the model from GEMINI_MODEL (optional).
"""
import argparse
import json
import os
import sys
import warnings

# Library deprecation warnings must never reach stdout and break the JSON contract.
warnings.filterwarnings("ignore")

DEFAULT_MODEL = "gemini-3.6-flash"

try:
    import google.generativeai as genai
except ImportError:  # the analyst degrades to an explicit error instead of crashing
    genai = None

SYSTEM_PROMPT = """You are the PAL-PREDICT Football Analyst. You speak directly to football fans as an experienced, high-quality professional pundit and data analyst.
Your goal is to translate sophisticated risk-engine data, tactical context, odds, and match states into natural, intelligent, conversational football language.

CORE BEHAVIORS & TONE:
1. Tone: Professional, knowledgeable, calm, analytical, conversational, and honest about uncertainty. Do not sound robotic, overly academic, or overconfident.
2. Structure: Use 2 to 4 short natural paragraphs. STRICTLY AVOID headings, bulleted lists, and markdown tables.
3. Terminology: Use natural football language ("Sevilla should have more of the ball") instead of forced academic jargon.
4. Statistics: Only use stats when they genuinely add value. NEVER fabricate data. If something is not in the MATCH CONTEXT (injuries, line-ups, xG, head-to-head), say plainly that you do not have that information instead of guessing. Distinguish verified facts from model estimates.
5. Responsiveness: Answer the question that was asked. For a general question, cover the likely shape of the game, the key battle, what could change it, and a measured lean based on the model.
6. Match state: If the match is in play, say that the pre-match model no longer reflects the current game and that you have no live score. If a FINAL SCORE is given, the match is over: discuss what happened against what the model expected, without inventing match events you were not given.
7. Predictions: Be honest about confidence. Say "Sevilla are slight favourites" rather than "Sevilla will win", and weave the model probabilities in naturally ("the model gives them roughly a 47% chance").
8. Value prices: If the engine flagged a value price, explain it as a price that is better than the bookmaker consensus, not as a guaranteed winner. Never tell anyone to stake money, and never promise profit.
"""


def _fmt_pct(value):
    return "n/a" if value is None else f"{value}%"


def build_context(match):
    """Turn the server-built match payload into a plain-text, verified data block."""
    if not isinstance(match, dict):
        return f"--- MATCH CONTEXT ---\n{match}\n---------------------\n"

    home = match.get("home") if isinstance(match.get("home"), dict) else {"name": match.get("home", "Home")}
    away = match.get("away") if isinstance(match.get("away"), dict) else {"name": match.get("away", "Away")}
    comp = match.get("competition") or {}
    probs = match.get("probabilities") or {}
    odds = match.get("odds") or {}
    value = match.get("value") or {}

    lines = ["--- MATCH CONTEXT (VERIFIED DATA) ---"]
    lines.append(f"Match: {home.get('name')} vs {away.get('name')}")
    if comp:
        lines.append(f"Competition: {comp.get('name')} ({comp.get('region')})")
    lines.append(f"Kick-off (UTC): {match.get('kickoff', 'unknown')} | State: {match.get('state', 'unknown')}")
    result = match.get("result")
    if isinstance(result, dict) and result.get("home") is not None:
        lines.append(f"FINAL SCORE (verified): {home.get('name')} {result['home']} - {result['away']} {away.get('name')}. "
                     f"Compare it honestly with the pre-match model below.")
    else:
        lines.append("Live score: not available to you.")

    if probs.get("home") is not None:
        draw = f", Draw {_fmt_pct(probs.get('draw'))}" if probs.get("draw") is not None else ""
        lines.append(f"Model win probabilities (bookmaker consensus, margin removed): "
                     f"{home.get('name')} {_fmt_pct(probs.get('home'))}{draw}, {away.get('name')} {_fmt_pct(probs.get('away'))}")
        prices = ", ".join(f"{k} {odds[k]}" for k in ("home", "draw", "away") if odds.get(k) is not None)
        lines.append(f"Best available prices: {prices or 'n/a'}")
    else:
        lines.append("Model probabilities: unavailable for this match.")

    if match.get("predicted_score"):
        lines.append(f"Most likely scoreline (model estimate): {match['predicted_score']}")
    for market in match.get("markets") or []:
        lines.append(f"{market.get('label')}: {market.get('value')} (model estimate)")

    for side in (home, away):
        form = side.get("form")
        if isinstance(form, dict) and form.get("results"):
            lines.append(f"{side.get('name')} recent form (last results, from ESPN standings): {' '.join(form['results'])}")
    if not any(isinstance(s.get("form"), dict) for s in (home, away)):
        lines.append("Recent form: no verified data.")

    if value.get("is_value"):
        sel = value.get("selection") or {}
        edge = value.get("edge")
        edge_txt = f"{round(edge * 100, 1)}%" if isinstance(edge, (int, float)) else "n/a"
        lines.append(f"Value flag: the engine found a price on {sel.get('label', 'one outcome')} "
                     f"at {sel.get('price', 'n/a')} that beats the consensus fair price (edge {edge_txt}).")
    else:
        lines.append("Value flag: none. Prices are in line with the market consensus.")

    if match.get("rationale"):
        lines.append(f"Engine note: {match['rationale']}")
    lines.append("--------------------------------------")
    return "\n".join(lines)


def build_prompt(match, question, history):
    parts = [SYSTEM_PROMPT, build_context(match)]
    turns = [t for t in (history or []) if isinstance(t, dict) and t.get("text")]
    if turns:
        parts.append("CONVERSATION SO FAR:")
        for t in turns[-8:]:
            who = "Fan" if t.get("role") == "user" else "Analyst"
            parts.append(f"{who}: {str(t['text'])[:1500]}")
    parts.append(f"FAN'S QUESTION: {question}")
    return "\n\n".join(parts)


def generate_analysis(context_json_str, user_msg, history=None):
    """Returns (ok, text)."""
    try:
        match = json.loads(context_json_str)
    except (TypeError, ValueError):
        match = {"raw_context": context_json_str}

    if genai is None:
        return False, "google-generativeai is not installed"
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return False, "GEMINI_API_KEY is not set"

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name=os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL)
        response = model.generate_content(build_prompt(match, user_msg, history))
        text = (response.text or "").strip()
    except Exception as exc:  # the SDK raises many unrelated types
        return False, f"{type(exc).__name__}: {exc}"
    return (True, text) if text else (False, "empty response")


def main(argv=None):
    parser = argparse.ArgumentParser(description="PAL-PREDICT AI Analyst")
    parser.add_argument("--chat", nargs=2, metavar=("CONTEXT", "MESSAGE"))
    parser.add_argument("--history", default="[]")
    args = parser.parse_args(argv)

    if not args.chat or not args.chat[0] or not args.chat[1].strip():
        out = {"ok": False, "error": "No match context or question provided."}
    else:
        try:
            history = json.loads(args.history)
        except ValueError:
            history = []
        ok, text = generate_analysis(args.chat[0], args.chat[1].strip(), history if isinstance(history, list) else [])
        out = {"ok": True, "response": text} if ok else {"ok": False, "error": text}

    sys.stdout.write(json.dumps(out) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
