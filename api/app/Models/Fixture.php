<?php

namespace App\Models;

use Database\Factories\FixtureFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Fixture extends Model
{
    /** @use HasFactory<FixtureFactory> */
    use HasFactory;

    public const OUTCOMES = ['home', 'draw', 'away'];

    protected $fillable = [
        'sport_key', 'home_team', 'away_team', 'home_logo', 'away_logo',
        'commence_time', 'date_str', 'bookmaker', 'odds_home', 'odds_draw', 'odds_away',
        'prob_home', 'prob_draw', 'prob_away', 'pred_score', 'home_form', 'away_form',
        'home_form_source', 'away_form_source',
        'market_1_label', 'market_1_val', 'market_2_label', 'market_2_val',
        'edge', 'stake', 'is_value_bet', 'rationale', 'is_soccer',
        'home_score', 'away_score', 'completed', 'result_fetched_at',
        'flagged_outcome', 'flagged_price', 'flagged_edge', 'flagged_at',
    ];

    protected $casts = [
        'commence_time' => 'datetime',
        'result_fetched_at' => 'datetime',
        'flagged_at' => 'datetime',
        'flagged_price' => 'float',
        'flagged_edge' => 'float',
        'is_value_bet' => 'boolean',
        'is_soccer' => 'boolean',
        'completed' => 'boolean',
        'home_score' => 'integer',
        'away_score' => 'integer',
        'odds_home' => 'float',
        'odds_draw' => 'float',
        'odds_away' => 'float',
        'prob_home' => 'float',
        'prob_draw' => 'float',
        'prob_away' => 'float',
        'edge' => 'float',
        'stake' => 'float',
    ];

    /** True when the market has a draw (football); two-way sports have no draw price. */
    public function isThreeWay(): bool
    {
        return (float) $this->odds_draw > 0;
    }

    /** @return list<string> */
    public function availableOutcomes(): array
    {
        return $this->isThreeWay() ? self::OUTCOMES : ['home', 'away'];
    }

    /** Best stored decimal price for an outcome, or null if there is none. */
    public function priceFor(string $outcome): ?float
    {
        $price = (float) $this->{'odds_'.$outcome};

        return $price > 1 ? round($price, 2) : null;
    }

    public function probabilityFor(string $outcome): float
    {
        return (float) $this->{'prob_'.$outcome};
    }

    public function teamName(string $outcome): string
    {
        return match ($outcome) {
            'home' => (string) $this->home_team,
            'away' => (string) $this->away_team,
            default => 'Draw',
        };
    }

    public function hasResult(): bool
    {
        return $this->completed && $this->home_score !== null && $this->away_score !== null;
    }

    /** home | draw | away for a finished match, otherwise null. */
    public function actualOutcome(): ?string
    {
        if (! $this->hasResult()) {
            return null;
        }

        return match (true) {
            $this->home_score > $this->away_score => 'home',
            $this->home_score < $this->away_score => 'away',
            default => 'draw',
        };
    }

    /** The outcome the model rates most likely. */
    public function favouriteOutcome(): string
    {
        $best = 'home';
        foreach ($this->availableOutcomes() as $o) {
            if ($this->probabilityFor($o) > $this->probabilityFor($best)) {
                $best = $o;
            }
        }

        return $best;
    }

    /**
     * The value price as first flagged (kept even if later runs dropped it), with closing-line
     * value when it can be measured. Older rows without a recorded flag fall back to the
     * current flag, and have no CLV because their stored price is the latest one.
     *
     * @return array{outcome: string, label: string, price: float, clv: float|null}|null
     */
    public function recordedValue(): ?array
    {
        if ($this->flagged_at && $this->flagged_outcome && $this->flagged_price) {
            $outcome = $this->flagged_outcome;
            $total = array_sum(array_map(fn ($o) => $this->probabilityFor($o), $this->availableOutcomes()));
            $closing = $total > 0 ? $this->probabilityFor($outcome) / $total : null;

            return [
                'outcome' => $outcome,
                'label' => $this->teamName($outcome),
                'price' => (float) $this->flagged_price,
                // Flagged price against the last pre-kickoff consensus fair probability.
                'clv' => $closing ? round((float) $this->flagged_price * $closing - 1, 4) : null,
            ];
        }

        $sel = $this->valueSelection();

        return $sel && $sel['price'] ? $sel + ['clv' => null] : null;
    }

    /**
     * Which outcome the engine flagged as a value price. Rows have no selection column; the
     * engine's rationale always names the pick as "<Team> @ <price>x".
     *
     * @return array{outcome: string, label: string, price: float|null}|null
     */
    public function valueSelection(): ?array
    {
        if (! $this->is_value_bet) {
            return null;
        }

        $text = (string) $this->rationale;
        foreach (self::OUTCOMES as $outcome) {
            $label = $this->teamName($outcome);
            if ($label !== '' && str_contains($text, $label.' @ ')) {
                $quoted = preg_match('/'.preg_quote($label, '/').' @ ([0-9.]+)x/', $text, $m) ? (float) $m[1] : null;

                return ['outcome' => $outcome, 'label' => $label, 'price' => $quoted ?? $this->priceFor($outcome)];
            }
        }

        return null;
    }
}
