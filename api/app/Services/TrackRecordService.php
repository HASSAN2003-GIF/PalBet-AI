<?php

namespace App\Services;

use App\Models\Fixture;
use Carbon\CarbonImmutable;

/**
 * Measures the model against real results: does the favourite win as often as the model said,
 * are its probabilities calibrated, and would the value prices have made or lost money?
 */
class TrackRecordService
{
    public function __construct(private CompetitionCatalog $catalog) {}

    /**
     * @return array<string, mixed>
     */
    public function summary(int $days, ?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now('UTC');

        $fixtures = Fixture::query()
            ->where('completed', true)
            ->whereNotNull('home_score')
            ->whereNotNull('away_score')
            ->where('commence_time', '>=', $now->subDays($days))
            ->where('commence_time', '<=', $now)
            ->orderByDesc('commence_time')
            ->get();

        $favHits = 0;
        $favExpected = 0.0;
        $exactHits = 0;
        $exactTotal = 0;
        $brier = 0.0;
        $buckets = [];
        $value = ['count' => 0, 'won' => 0, 'profit' => 0.0, 'price_sum' => 0.0];
        $recentValue = [];

        foreach ($fixtures as $f) {
            $actual = $f->actualOutcome();
            $fav = $f->favouriteOutcome();
            $favHits += (int) ($fav === $actual);
            $favExpected += $f->probabilityFor($fav);

            if ($f->pred_score && preg_match('/^(\d+)\s*-\s*(\d+)$/', trim($f->pred_score), $m)) {
                $exactTotal++;
                $exactHits += (int) ((int) $m[1] === $f->home_score && (int) $m[2] === $f->away_score);
            }

            // Calibration: every outcome probability is a forecast that happened or didn't.
            foreach ($f->availableOutcomes() as $o) {
                $p = $f->probabilityFor($o);
                $hit = (int) ($o === $actual);
                $brier += ($p - $hit) ** 2;
                $b = min(9, (int) floor($p * 10));
                $buckets[$b] ??= ['forecasts' => 0, 'prob_sum' => 0.0, 'hits' => 0];
                $buckets[$b]['forecasts']++;
                $buckets[$b]['prob_sum'] += $p;
                $buckets[$b]['hits'] += $hit;
            }

            $sel = $f->valueSelection();
            if ($sel && $sel['price']) {
                $won = $sel['outcome'] === $actual;
                $value['count']++;
                $value['won'] += (int) $won;
                $value['price_sum'] += $sel['price'];
                // One token on every value price at the quoted price.
                $value['profit'] += $won ? $sel['price'] - 1 : -1;

                if (count($recentValue) < 12) {
                    $meta = $this->catalog->describe($f->sport_key);
                    $recentValue[] = [
                        'id' => $f->id,
                        'kickoff' => CarbonImmutable::parse($f->commence_time)->toIso8601ZuluString(),
                        'competition' => $meta['name'],
                        'home' => $f->home_team,
                        'away' => $f->away_team,
                        'score' => "{$f->home_score}–{$f->away_score}",
                        'selection' => $sel['label'],
                        'price' => $sel['price'],
                        'won' => $won,
                    ];
                }
            }
        }

        $n = $fixtures->count();
        ksort($buckets);

        return [
            'days' => $days,
            'matches' => $n,
            'favourite' => [
                'won' => $favHits,
                'rate' => $n ? round($favHits / $n, 4) : null,
                'expected_rate' => $n ? round($favExpected / $n, 4) : null,
            ],
            'exact_score' => [
                'hits' => $exactHits,
                'total' => $exactTotal,
                'rate' => $exactTotal ? round($exactHits / $exactTotal, 4) : null,
            ],
            // Mean Brier score per match (0 = perfect; lower is better).
            'brier' => $n ? round($brier / $n, 4) : null,
            'calibration' => array_values(array_map(fn ($b, $data) => [
                'from' => $b / 10,
                'to' => ($b + 1) / 10,
                'forecasts' => $data['forecasts'],
                'predicted' => round($data['prob_sum'] / $data['forecasts'], 4),
                'observed' => round($data['hits'] / $data['forecasts'], 4),
            ], array_keys($buckets), $buckets)),
            'value' => [
                'count' => $value['count'],
                'won' => $value['won'],
                'hit_rate' => $value['count'] ? round($value['won'] / $value['count'], 4) : null,
                'average_price' => $value['count'] ? round($value['price_sum'] / $value['count'], 2) : null,
                'profit' => round($value['profit'], 2),
                'roi' => $value['count'] ? round($value['profit'] / $value['count'], 4) : null,
                'recent' => $recentValue,
            ],
        ];
    }
}
