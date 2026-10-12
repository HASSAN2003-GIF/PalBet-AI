<?php

namespace Database\Factories;

use App\Models\Fixture;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Fixture>
 */
class FixtureFactory extends Factory
{
    protected $model = Fixture::class;

    public function definition(): array
    {
        $kickoff = now()->addDay()->setTime(19, 0);

        return [
            'sport_key' => 'soccer_epl',
            'home_team' => fake()->unique()->city().' FC',
            'away_team' => fake()->unique()->city().' United',
            'home_logo' => null,
            'away_logo' => null,
            'commence_time' => $kickoff,
            'date_str' => $kickoff->toDateString(),
            'bookmaker' => 'Pinnacle',
            'odds_home' => 2.10,
            'odds_draw' => 3.40,
            'odds_away' => 3.60,
            'prob_home' => 0.452,
            'prob_draw' => 0.276,
            'prob_away' => 0.272,
            'pred_score' => '1 - 0',
            'home_form' => 'W,W,D,L,W',
            'away_form' => 'L,D,W,L,L',
            'market_1_label' => 'O2.5',
            'market_1_val' => '51%',
            'market_2_label' => 'BTTS',
            'market_2_val' => '49%',
            'edge' => 0.004,
            'stake' => 0,
            'is_value_bet' => false,
            'rationale' => 'Odds reflect fair market value. No statistical edge detected.',
            'is_soccer' => true,
        ];
    }

    /** A value price on the away side, phrased exactly like the risk engine's rationale. */
    public function valueAway(float $price = 3.6, float $edge = 0.061): static
    {
        return $this->state(fn (array $a) => [
            'is_value_bet' => true,
            'edge' => $edge,
            'stake' => 18.4,
            'odds_away' => $price,
            'rationale' => "Price beats market consensus: edge ".round($edge * 100, 1)."%. {$a['away_team']} @ {$price}x (BetUS) vs consensus fair price 3.39x from the other 20 books (fair prob 29.5%).",
        ]);
    }
}
