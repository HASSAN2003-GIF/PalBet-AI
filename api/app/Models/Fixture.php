<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Fixture extends Model
{
   protected $fillable = [
        'sport_key', 'home_team', 'away_team', 'home_logo', 'away_logo',
        'commence_time', 'date_str', 'bookmaker', 'odds_home', 'odds_draw', 'odds_away',
        'prob_home', 'prob_draw', 'prob_away', 'pred_score', 'home_form', 'away_form',
        'market_1_label', 'market_1_val', 'market_2_label', 'market_2_val',
        'edge', 'stake', 'is_value_bet', 'rationale', 'is_soccer'
    ];

    protected $casts = [
        'commence_time' => 'datetime',
        'is_value_bet' => 'boolean',
        'is_soccer' => 'boolean',
        'odds_home' => 'float',
        'odds_draw' => 'float',
        'odds_away' => 'float',
        'prob_home' => 'float',
        'prob_draw' => 'float',
        'prob_away' => 'float',
        'edge' => 'float',
        'stake' => 'float',
    ];
}