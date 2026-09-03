import pandas as pd
import numpy as np
import json
import sys

class BettingRiskEngine:
    def __init__(self, bankroll):
        self.bankroll = bankroll

    def calculate_edge(self, true_prob, decimal_odds):
        """Calculates the Expected Value (Edge)"""
        return (true_prob * decimal_odds) - 1.0

    def calculate_kelly_stake(self, true_prob, decimal_odds, kelly_fraction=0.25):
        """Calculates Recommended Stake using Fractional Kelly Criterion"""
        b = decimal_odds - 1.0
        q = 1.0 - true_prob
        
        # Kelly formula: f* = (bp - q) / b
        full_kelly = (b * true_prob - q) / b
        
        # If the edge is negative or zero, the stake should be 0.0
        if full_kelly <= 0:
            return 0.0 
            
        fractional_kelly = full_kelly * kelly_fraction
        return self.bankroll * fractional_kelly

if __name__ == "__main__":
    agent = BettingRiskEngine(bankroll=1000)
    
    # FIXED: Grab the API key from index 2
    api_key = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Fetch live matches (using EPL to ensure we get data)
    live_market_data = fetch_live_odds(api_key, sport="soccer_epl") if api_key else []
        
    df = pd.DataFrame(live_market_data)
    results = []
    
    for index, row in df.iterrows():
        edge = agent.calculate_edge(row['model_prob'], row['odds'])
        stake = agent.calculate_kelly_stake(row['model_prob'], row['odds'])
        
        results.append({
            "match": row['match'],
            "odds": row['odds'],
            "model_prob": row['model_prob'],
            "edge": round(edge, 4),
            "stake": round(stake, 2),
            "is_value_bet": bool(edge > 0)
        })

    # Machine-to-Machine Output
    if "--json" in sys.argv:
        print(json.dumps(results))
        
    # Human-Readable Output
    else:
        print("\n=============================================")
        print(" 🤖 PalBet AI: Live Risk Analysis Started")
        print("=============================================")
        for res in results:
            print(f"\nFixture: {res['match']}")
            print(f"Bookmaker Odds: {res['odds']} | Model Probability: {res['model_prob']*100}%")
            if res['is_value_bet']:
                print(f"✅ EDGE FOUND: +{res['edge']*100:.2f}%")
                print(f"💰 RECOMMENDED STAKE (Quarter-Kelly): ${res['stake']:.2f}")
            else:
                print(f"❌ NO EDGE: {res['edge']*100:.2f}% (DO NOT BET)")
        print("\n=============================================")

