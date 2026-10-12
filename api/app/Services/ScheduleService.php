<?php

namespace App\Services;

use App\Models\Fixture;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

/**
 * Builds the matchday payload the frontend renders: every fixture that kicks off on a given
 * calendar day *in the viewer's timezone*, grouped by competition, with the risk engine's
 * full read of each match (probabilities, value selection, rationale, verified form).
 */
class ScheduleService
{
    /** How long after kickoff a match is shown as "in play" (no live score feed exists). */
    private const IN_PLAY_MINUTES = 115;

    private ?bool $hasFormSource = null;

    public function __construct(private CompetitionCatalog $catalog) {}

    /**
     * @return array<string, mixed>
     */
    public function forDay(string $date, string $timezone): array
    {
        $dayStart = CarbonImmutable::createFromFormat('!Y-m-d', $date, $timezone);
        $dayEnd = $dayStart->addDay();
        $now = CarbonImmutable::now('UTC');

        $fixtures = Fixture::query()
            ->where('commence_time', '>=', $dayStart->utc())
            ->where('commence_time', '<', $dayEnd->utc())
            ->orderBy('commence_time')
            ->orderBy('id')
            ->get();

        $competitions = $fixtures
            ->groupBy('sport_key')
            ->map(function (Collection $group, string $sportKey) use ($now) {
                $meta = $this->catalog->describe($sportKey);
                $matches = $group->map(fn (Fixture $f) => $this->presentMatch($f, $now))->values();

                return $meta + [
                    'match_count' => $matches->count(),
                    'value_count' => $matches->where('value.is_value', true)->count(),
                    'matches' => $matches->all(),
                ];
            })
            ->sortBy([['region', 'asc'], ['name', 'asc']], SORT_NATURAL | SORT_FLAG_CASE)
            ->values();

        $all = $competitions->flatMap(fn ($c) => $c['matches']);

        return [
            'date' => $dayStart->toDateString(),
            'timezone' => $timezone,
            'generated_at' => $now->toIso8601ZuluString(),
            'last_engine_run' => optional(Fixture::max('updated_at'), fn ($v) => CarbonImmutable::parse($v)->toIso8601ZuluString()),
            'summary' => [
                'matches' => $all->count(),
                'value' => $all->where('value.is_value', true)->count(),
                'competitions' => $competitions->count(),
            ],
            'competitions' => $competitions->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function presentMatch(Fixture $f, ?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now('UTC');
        $kickoff = CarbonImmutable::parse($f->commence_time)->utc();
        $threeWay = (float) $f->odds_draw > 0;

        $state = match (true) {
            $kickoff->greaterThan($now) => 'upcoming',
            $kickoff->addMinutes(self::IN_PLAY_MINUTES)->greaterThan($now) => 'in_play',
            default => 'finished',
        };

        $selection = $f->is_value_bet ? $this->valueSelection($f) : null;

        return [
            'id' => $f->id,
            'competition_key' => $f->sport_key,
            'kickoff' => $kickoff->toIso8601ZuluString(),
            'state' => $state,
            'home' => ['name' => $f->home_team, 'form' => $this->verifiedForm($f, 'home')],
            'away' => ['name' => $f->away_team, 'form' => $this->verifiedForm($f, 'away')],
            'three_way' => $threeWay,
            'odds' => [
                'home' => $this->price($f->odds_home),
                'draw' => $threeWay ? $this->price($f->odds_draw) : null,
                'away' => $this->price($f->odds_away),
            ],
            'probabilities' => $this->probabilities($f, $threeWay),
            'predicted_score' => $this->clean($f->pred_score),
            'markets' => array_values(array_filter([
                $this->market($f->market_1_label, $f->market_1_val),
                $this->market($f->market_2_label, $f->market_2_val),
            ])),
            'bookmaker' => $this->clean($f->bookmaker),
            'value' => [
                'is_value' => (bool) $f->is_value_bet,
                'edge' => round((float) $f->edge, 4),
                'selection' => $selection,
                // Engine stakes are sized on a 1,000-unit bankroll; expose it as a share.
                'bankroll_share' => $f->is_value_bet ? round((float) $f->stake / 1000, 4) : null,
            ],
            'rationale' => $this->clean($f->rationale),
        ];
    }

    /**
     * Probabilities as whole percentages that always add up to exactly 100.
     *
     * @return array{home: int, draw: int|null, away: int}
     */
    private function probabilities(Fixture $f, bool $threeWay): array
    {
        $raw = ['home' => (float) $f->prob_home, 'draw' => $threeWay ? (float) $f->prob_draw : 0.0, 'away' => (float) $f->prob_away];
        $total = array_sum($raw);
        if ($total <= 0) {
            return ['home' => 0, 'draw' => $threeWay ? 0 : null, 'away' => 0];
        }

        // Largest-remainder rounding so the bar segments sum to 100.
        $scaled = array_map(fn ($p) => $p / $total * 100, $raw);
        $floored = array_map('floor', $scaled);
        $short = 100 - (int) array_sum($floored);
        $remainders = array_map(fn ($k) => $scaled[$k] - $floored[$k], array_keys($scaled));
        $order = array_keys($scaled);
        array_multisort($remainders, SORT_DESC, $order);
        foreach (array_slice($order, 0, $short) as $k) {
            $floored[$k]++;
        }

        return [
            'home' => (int) $floored['home'],
            'draw' => $threeWay ? (int) $floored['draw'] : null,
            'away' => (int) $floored['away'],
        ];
    }

    /**
     * Which outcome the engine flagged. Stored rows predate a selection column, but the
     * engine's rationale always names the pick as "<Team> @ <price>x".
     *
     * @return array{outcome: string, label: string, price: float|null}|null
     */
    private function valueSelection(Fixture $f): ?array
    {
        $text = (string) $f->rationale;
        $candidates = [
            'home' => [$f->home_team, $f->odds_home],
            'away' => [$f->away_team, $f->odds_away],
            'draw' => ['Draw', $f->odds_draw],
        ];

        foreach ($candidates as $outcome => [$label, $price]) {
            if ($label !== null && $label !== '' && str_contains($text, $label.' @ ')) {
                $quoted = preg_match('/'.preg_quote($label, '/').' @ ([0-9.]+)x/', $text, $m) ? (float) $m[1] : null;

                return ['outcome' => $outcome, 'label' => $label, 'price' => $quoted ?? $this->price($price)];
            }
        }

        return null;
    }

    /**
     * Only form that came from a real results source. The engine fills gaps with synthetic
     * form, and showing that as fact would mislead people, so unknown provenance is hidden.
     *
     * @return array{results: list<string>, source: string}|null
     */
    private function verifiedForm(Fixture $f, string $side): ?array
    {
        $this->hasFormSource ??= Schema::hasColumn('fixtures', 'home_form_source');
        if (! $this->hasFormSource) {
            return null;
        }

        $source = $f->{$side.'_form_source'};
        if (! in_array($source, ['espn_form', 'espn_streak'], true)) {
            return null;
        }

        $results = array_values(array_filter(
            array_map('trim', explode(',', (string) $f->{$side.'_form'})),
            fn ($r) => in_array($r, ['W', 'D', 'L'], true)
        ));

        return $results ? ['results' => $results, 'source' => $source] : null;
    }

    /** @return array{label: string, value: string}|null */
    private function market(?string $label, ?string $value): ?array
    {
        $label = $this->clean($label);
        $value = $this->clean($value);
        if ($label === null || $value === null || in_array($value, ['N/A', '-'], true) || $label === 'Market') {
            return null;
        }

        $names = ['O2.5' => 'Over 2.5 goals', 'BTTS' => 'Both teams score'];

        return ['label' => $names[$label] ?? $label, 'value' => $value];
    }

    private function price(mixed $value): ?float
    {
        $v = (float) $value;

        return $v > 1 ? round($v, 2) : null;
    }

    private function clean(?string $value): ?string
    {
        $value = trim((string) $value);

        return ($value === '' || $value === '-') ? null : $value;
    }
}
