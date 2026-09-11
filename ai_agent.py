import json
import argparse
import sys
import os

try:
    import google.generativeai as genai
    # Ensure your API key is correctly pulled from your environment variables
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
    MODEL_NAME = "gemini-3.6-flash"
except ImportError:
    genai = None

# ==========================================
# STRICT SYSTEM PERSONA & PROMPT ENGINEERING
# ==========================================
SYSTEM_PROMPT = """You are the PalBet AI Football Analyst. You speak directly to football fans as an experienced, high-quality professional pundit and data analyst. 
Your goal is to translate sophisticated risk-engine data, tactical context, odds, and live match states into natural, intelligent, conversational football language.

CORE BEHAVIORS & TONE:
1. Tone: Professional, knowledgeable, calm, analytical, conversational, and honest about uncertainty. Do not sound robotic, overly academic, or overconfident.
2. Structure: Use 3 to 5 natural paragraphs. STRICTLY AVOID excessive headings (like "### Match Overview"), bulleted lists, and markdown tables.
3. Terminology: Use natural football language ("Sevilla should have more of the ball") instead of forced academic jargon ("Field Tilt Index indicates territorial dominance").
4. Statistics: Only use stats when they genuinely add value. NEVER fabricate or hallucinate data. If you don't have verified data for a specific stat in the provided context, DO NOT mention it. Differentiate between verified facts and model estimations.
5. Responsiveness: Adapt to the user's question. If they ask a general question, give a concise overview covering the expected tactical approach, the key battle, what could change the game, and a gentle prediction lean based on the model.
6. Context: Explicitly differentiate between pre-match and live analysis. If the match is LIVE (based on the provided status/time/score), you MUST factor the current score into your tactical assessment.
7. Predictions: Be honest and measure your confidence. Say "Sevilla are the slight favorite" instead of "Sevilla will win." Use the provided model probabilities naturally in a sentence (e.g., "The model gives them roughly a 47% chance...").
"""

def generate_analysis(context_json_str, user_msg):
    # 1. Parse the verified data passed from Laravel
    try:
        match_data = json.loads(context_json_str)
    except Exception:
        match_data = {"raw_context": context_json_str}

    # 2. Build an immutable data block so the LLM relies on facts, not hallucinations
    context_block = "--- MATCH CONTEXT (VERIFIED DATA) ---\n"
    if isinstance(match_data, dict):
        context_block += f"Teams: {match_data.get('home', 'Home')} vs {match_data.get('away', 'Away')}\n"
        context_block += f"Status: {match_data.get('status', 'Unknown')} | Time/Minute: {match_data.get('time', 'TBA')}\n"
        context_block += f"Current Score: {match_data.get('home_score', '-')} - {match_data.get('away_score', '-')}\n"
        
        if match_data.get('has_odds'):
            context_block += f"Odds: 1 ({match_data.get('odds_home')}), X ({match_data.get('odds_draw')}), 2 ({match_data.get('odds_away')})\n"
            context_block += f"Model Probabilities: Home {match_data.get('prob_home')}%, Draw {match_data.get('prob_draw')}%, Away {match_data.get('prob_away')}%\n"
            context_block += f"Risk Engine Prediction: {match_data.get('pred_score', 'N/A')}\n"
        else:
            context_block += "Odds & Model Probabilities: UNAVAILABLE (League not scouted by Risk Engine).\n"
    else:
        context_block += str(match_data)
    context_block += "--------------------------------------\n"

    # 3. Construct the final prompt
    prompt = f"{SYSTEM_PROMPT}\n\n{context_block}\n\nUSER QUESTION: {user_msg}"

    if not genai:
        return "AI Engine Connected: Cannot generate dynamic text. (Generative AI library or API key missing)."

    # 4. Generate the conversational response
    try:
        model = genai.GenerativeModel(model_name=MODEL_NAME)
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"AI Engine Exception: {str(e)}"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PalBet AI Analyst")
    parser.add_argument("--chat", nargs=2, metavar=("CONTEXT", "MESSAGE"), help="Analyze match and respond to query")
    args = parser.parse_args()

    if args.chat:
        context_str, user_msg = args.chat
        if not user_msg or not context_str:
            print(json.dumps({"response": "No valid input provided to the AI Engine."}))
        else:
            ans = generate_analysis(context_str, user_msg)
            print(json.dumps({"response": ans}))
    else:
        print(json.dumps({"response": "No input received."}))