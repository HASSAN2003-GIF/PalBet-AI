import sys
import json
import traceback
from duckduckgo_search import DDGS
import google.generativeai as genai

def search_live_web(query):
    try:
        results = DDGS().text(f"{query} latest news injury tactics", max_results=3)
        formatted_snippets = ""
        for i, item in enumerate(results):
            formatted_snippets += (
                f"Source [{i+1}]: {item.get('title', '')}\n"
                f"Snippet: {item.get('body', '')}\n"
                f"URL: {item.get('href', '')}\n\n"
            )
        return formatted_snippets if formatted_snippets else "No relevant articles retrieved."
    except Exception as e:
        return f"Live search currently unavailable: {str(e)}"

def run_agent():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            print(json.dumps({"response": "Error: No input received from Laravel."}))
            return

        payload = json.loads(raw_input)
        api_key = payload.get("api_key")
        match_context = payload.get("match", "Unknown Fixture")
        history = payload.get("history", [])
        user_message = payload.get("message", "")

        # Automatically strip accidental quotes from the API key
        if api_key:
            api_key = api_key.replace('"', '').replace("'", "").strip()

        if not api_key or api_key == "null" or api_key == "":
            print(json.dumps({
                "response": f"API Key missing. Please check your .env file."
            }))
            return

        genai.configure(api_key=api_key)

        web_context = search_live_web(match_context)

        conversation_log = ""
        for turn in history:
            speaker = "User" if turn.get("role") == "user" else "PalBet AI"
            conversation_log += f"{speaker}: {turn.get('text', '')}\n"

        prompt = f"""
You are PalBet-AI: an elite, playful, and highly adaptive sports predictive analyst.
You are currently engaged in a live chat with Hassan about this match: {match_context}.

Prior Conversation:
{conversation_log}

Latest Message from User:
"{user_message}"

Fresh Web Intelligence Retrieved Right Now:
---
{web_context}
---

CRITICAL GUIDELINES:
1. Tone & Persona: Speak naturally and playfully, exactly like a sharp, witty football expert chatting with a friend. No robotic reports, no stiff introductions. 
2. Formatting Rules: DO NOT use hashtags (# or ###) for headings or horizontal rules (---). Use simple bolding for emphasis and short paragraphs. Keep the chat interface clean and conversational.
3. Vocabulary Restrictions: You are an AI predictive simulator, not a sportsbook. NEVER use gambling terms like "betting", "handicap", "BTTS", or "Anytime Goalscorer". Use terms like "Predictions", "Tokens", "Simulations", and "Projected Output".
4. Integration: Weave factual findings from the web intelligence smoothly into your reasoning, citing sources using [1], [2] where applicable.
5. Flow: Always conclude your turn with a single, natural follow-up question to keep the dialogue moving.
"""
        model = genai.GenerativeModel("gemini-3.6-flash")
        response = model.generate_content(prompt)
        print(json.dumps({"response": response.text}))

    except Exception as e:
        # 🟢 THIS WILL NOW PRINT THE EXACT ERROR IN YOUR CHAT UI
        error_details = traceback.format_exc()
        print(json.dumps({
            "response": f"**System Crash Details:**\n`{str(e)}`\n\n```text\n{error_details}\n```"
        }))

if __name__ == "__main__":
    run_agent()