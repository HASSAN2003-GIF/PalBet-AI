<?php

namespace App\Services;

use App\Models\Fixture;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Schema;

/**
 * Stores the risk engine's output (risk_engine.py --json ... odds <sport>).
 *
 * Two rules protect the track record:
 *  - Matches that have kicked off are never written. The Odds API keeps returning in-play
 *    odds for live games; storing them would replace the pre-match prediction with a
 *    mid-game one and corrupt every accuracy number. The last pre-kickoff run stays as the
 *    "closing" read.
 *  - The first value flag for a match is kept (outcome, price, edge, time), even if later
 *    runs move the price or drop the flag, so closing-line value can be measured honestly.
 */
class FixtureImporter
{
    private ?array $columns = null;

    /**
     * @param  list<array<string, mixed>>  $matches
     * @return array{stored: int, skipped_started: int, flagged: int}
     */
    public function import(string $sport, array $matches, ?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now('UTC');
        $counts = ['stored' => 0, 'skipped_started' => 0, 'flagged' => 0];

        foreach ($matches as $match) {
            if (empty($match['home_team']) || empty($match['away_team']) || empty($match['commence_time'])) {
                continue;
            }
            $kickoff = CarbonImmutable::parse($match['commence_time'])->utc();
            if (! empty($match['is_live']) || $kickoff->lessThanOrEqualTo($now)) {
                $counts['skipped_started']++;
                continue;
            }

            $fixture = Fixture::updateOrCreate(
                ['home_team' => $match['home_team'], 'away_team' => $match['away_team'], 'commence_time' => $kickoff],
                $this->only($this->attributes($sport, $match, $kickoff))
            );
            $counts['stored']++;

            if ($this->has('flagged_at') && ! $fixture->flagged_at && ! empty($match['is_value_bet'])
                && in_array($match['selection'] ?? null, Fixture::OUTCOMES, true) && ! empty($match['selection_odds'])) {
                $fixture->forceFill([
                    'flagged_outcome' => $match['selection'],
                    'flagged_price' => $match['selection_odds'],
                    'flagged_edge' => $match['edge'] ?? null,
                    'flagged_at' => $now,
                ])->save();
                $counts['flagged']++;
            }
        }

        return $counts;
    }

    /** @return array<string, mixed> */
    private function attributes(string $sport, array $m, CarbonImmutable $kickoff): array
    {
        return [
            'sport_key' => $sport,
            'home_logo' => $m['home_logo'] ?? null,
            'away_logo' => $m['away_logo'] ?? null,
            'date_str' => $kickoff->format('Y-m-d'),
            'bookmaker' => $m['bookmaker'] ?? 'Unknown',
            'odds_home' => $m['odds_home'],
            'odds_draw' => $m['odds_draw'] ?? 0,
            'odds_away' => $m['odds_away'],
            'prob_home' => $m['prob_home'],
            'prob_draw' => $m['prob_draw'] ?? 0,
            'prob_away' => $m['prob_away'],
            'pred_score' => $m['pred_score'] ?? '-',
            'home_form' => $m['home_form'] ?? '-',
            'away_form' => $m['away_form'] ?? '-',
            'home_form_source' => $m['home_form_source'] ?? null,
            'away_form_source' => $m['away_form_source'] ?? null,
            'market_1_label' => $m['market_1_label'] ?? 'Market',
            'market_1_val' => $m['market_1_val'] ?? '-',
            'market_2_label' => $m['market_2_label'] ?? 'Market',
            'market_2_val' => $m['market_2_val'] ?? '-',
            'edge' => $m['edge'] ?? 0,
            'stake' => $m['stake'] ?? 0,
            'is_value_bet' => (bool) ($m['is_value_bet'] ?? false),
            'rationale' => $m['rationale'] ?? '',
            'is_soccer' => str_contains(strtolower($sport), 'soccer'),
        ];
    }

    /** Drop attributes whose column doesn't exist yet (deploys where a migration hasn't run). */
    private function only(array $attributes): array
    {
        return array_filter($attributes, fn ($key) => $this->has($key), ARRAY_FILTER_USE_KEY);
    }

    private function has(string $column): bool
    {
        $this->columns ??= array_flip(Schema::getColumnListing('fixtures'));

        return isset($this->columns[$column]);
    }
}
