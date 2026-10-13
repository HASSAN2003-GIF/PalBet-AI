<?php

namespace App\Services;

use App\Models\Fixture;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Finds matches by team, competition, day and state from one free-text query, e.g.
 * "arsenal", "premier league tomorrow", "boca live", "sevilla 2026-10-12".
 *
 * Words for a day ("today", "sat", "12 oct", "2026-10-12") and a state ("live",
 * "upcoming", "results") are read as filters applied in SQL; every other word must appear
 * in a team name or in the competition's name or country. Text is compared accent-folded in
 * PHP ("atletico" finds "Atlético", "slask" finds "Śląsk") over a light scan of the name
 * columns inside a bounded date window; full rows are loaded only for the hits.
 */
class MatchSearchService
{
    /** Without a day in the query, search this window around today. */
    private const PAST_DAYS = 7;

    private const FUTURE_DAYS = 14;

    /** Upper bound on rows scanned (name columns only) for one query. */
    private const SCAN_LIMIT = 5000;

    /** Upper bound on matches returned across all pages. */
    private const MAX_RESULTS = 200;

    private const IN_PLAY_MINUTES = 115;

    private const STATUS_WORDS = [
        'live' => 'in_play', 'playing' => 'in_play', 'inplay' => 'in_play', 'now' => 'in_play',
        'upcoming' => 'upcoming', 'next' => 'upcoming', 'scheduled' => 'upcoming', 'fixtures' => 'upcoming',
        'finished' => 'finished', 'completed' => 'finished', 'played' => 'finished',
        'results' => 'finished', 'result' => 'finished', 'ft' => 'finished',
    ];

    private const PHRASES = ['in play' => 'inplay', 'full time' => 'ft'];

    private const WEEKDAYS = [
        'mon' => 1, 'monday' => 1, 'tue' => 2, 'tues' => 2, 'tuesday' => 2, 'wed' => 3, 'wednesday' => 3,
        'thu' => 4, 'thur' => 4, 'thurs' => 4, 'thursday' => 4, 'fri' => 5, 'friday' => 5,
        'sat' => 6, 'saturday' => 6, 'sun' => 7, 'sunday' => 7,
    ];

    private const MONTHS = [
        'jan' => 1, 'january' => 1, 'feb' => 2, 'february' => 2, 'mar' => 3, 'march' => 3, 'apr' => 4,
        'april' => 4, 'may' => 5, 'jun' => 6, 'june' => 6, 'jul' => 7, 'july' => 7, 'aug' => 8,
        'august' => 8, 'sep' => 9, 'sept' => 9, 'september' => 9, 'oct' => 10, 'october' => 10,
        'nov' => 11, 'november' => 11, 'dec' => 12, 'december' => 12,
    ];

    public function __construct(
        private ScheduleService $schedule,
        private CompetitionCatalog $catalog,
    ) {}

    private const NOISE = ['vs', 'v', 'versus', 'x', 'and', 'the', 'match', 'matches', 'game', 'games', 'on', 'at', 'of', 'in'];

    /** Lower-case ASCII with punctuation turned into spaces: "Atlético-MG" -> "atletico mg". */
    public static function fold(?string $text): string
    {
        $ascii = Str::lower(Str::ascii((string) $text));

        return trim(preg_replace('/[^a-z0-9]+/', ' ', $ascii) ?? '');
    }

    /**
     * Split a query into text words, an optional local day (Y-m-d) and an optional state.
     *
     * @return array{words: list<string>, date: ?string, status: ?string}
     */
    public function parse(string $query, string $timezone): array
    {
        $today = CarbonImmutable::now($timezone)->startOfDay();
        $raw = Str::lower(trim(preg_replace('/\s+/u', ' ', $query) ?? ''));
        $date = null;

        // Numeric dates first, before folding turns their separators into spaces.
        if (preg_match('/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/', $raw, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            $date = sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3]);
            $raw = str_replace($m[0], ' ', $raw);
        } elseif (preg_match('#\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b#', $raw, $m)) {
            $year = isset($m[3]) ? (int) (strlen($m[3]) === 2 ? '20'.$m[3] : $m[3]) : $today->year;
            if (checkdate((int) $m[2], (int) $m[1], $year)) {   // day/month, as written in most of the world
                $date = sprintf('%04d-%02d-%02d', $year, $m[2], $m[1]);
                $raw = str_replace($m[0], ' ', $raw);
            }
        }

        $text = ' '.self::fold($raw).' ';
        foreach (self::PHRASES as $phrase => $token) {
            $text = str_replace(" {$phrase} ", " {$token} ", $text);
        }
        $tokens = array_values(array_filter(explode(' ', $text), fn ($t) => $t !== ''));

        $status = null;
        $words = [];
        $used = [];
        foreach ($tokens as $i => $token) {
            if (isset($used[$i])) {
                continue;
            }
            if (isset(self::STATUS_WORDS[$token])) {
                $status = self::STATUS_WORDS[$token];

                continue;
            }
            if ($date === null && ($day = $this->relativeDay($token, $today)) !== null) {
                $date = $day;

                continue;
            }
            if ($date === null && isset(self::MONTHS[$token])) {
                foreach ([$i - 1, $i + 1] as $j) {
                    $n = $tokens[$j] ?? null;
                    if ($n !== null && ! isset($used[$j]) && ctype_digit($n) && checkdate(self::MONTHS[$token], (int) $n, $today->year)) {
                        $date = sprintf('%04d-%02d-%02d', $today->year, self::MONTHS[$token], (int) $n);
                        $used[$j] = true;
                        // Drop the day number if it was already collected as a text word.
                        $words = array_values(array_diff($words, [$n]));

                        continue 2;
                    }
                }
            }
            if (in_array($token, self::NOISE, true) || (strlen($token) < 2 && ! ctype_digit($token))) {
                continue;
            }
            $words[] = $token;
        }

        return ['words' => array_values(array_unique($words)), 'date' => $date, 'status' => $status];
    }

    private function relativeDay(string $token, CarbonImmutable $today): ?string
    {
        return match (true) {
            in_array($token, ['today', 'tonight'], true) => $today->toDateString(),
            $token === 'tomorrow' => $today->addDay()->toDateString(),
            $token === 'yesterday' => $today->subDay()->toDateString(),
            // A weekday means the next one (today included): "sat" = this coming Saturday.
            isset(self::WEEKDAYS[$token]) => $today->addDays((self::WEEKDAYS[$token] - $today->dayOfWeekIso + 7) % 7)->toDateString(),
            default => null,
        };
    }

    /**
     * @return array<string, mixed>
     */
    public function search(string $query, string $timezone, int $page = 1, int $perPage = 20): array
    {
        $parsed = $this->parse($query, $timezone);
        $now = CarbonImmutable::now('UTC');

        if ($parsed['date'] !== null) {
            $start = CarbonImmutable::createFromFormat('!Y-m-d', $parsed['date'], $timezone)->utc();
            $end = $start->addDay();
        } else {
            $start = $now->subDays(self::PAST_DAYS);
            $end = $now->addDays(self::FUTURE_DAYS);
        }

        $results = collect();
        $truncated = false;
        if ($parsed['words'] || $parsed['date'] !== null || $parsed['status'] !== null) {
            $base = Fixture::query()->where('commence_time', '>=', $start)->where('commence_time', '<', $end);
            $this->applyStatus($base, $parsed['status'], $now);

            // Step 1: a light scan of just the name columns inside the window.
            $scan = $base->orderBy('commence_time')->orderBy('id')
                ->limit(self::SCAN_LIMIT + 1)
                ->get(['id', 'home_team', 'away_team', 'sport_key']);
            $truncated = $scan->count() > self::SCAN_LIMIT;
            $competitionText = $this->competitionText($scan->pluck('sport_key')->unique());

            $ids = $scan->take(self::SCAN_LIMIT)
                ->filter(fn (Fixture $f) => $this->matchesAllWords($f, $parsed['words'], $competitionText))
                ->pluck('id');
            $truncated = $truncated || $ids->count() > self::MAX_RESULTS;

            // Step 2: full rows only for the matches that will be shown.
            $results = Fixture::query()->whereIn('id', $ids->take(self::MAX_RESULTS)->all())->get()
                ->map(fn (Fixture $f) => [
                    'competition' => $this->catalog->describe($f->sport_key),
                    'match' => $this->schedule->presentMatch($f, $now),
                ])
                // The database filter is coarse at the in-play boundary; the presented state decides.
                ->filter(fn ($r) => $parsed['status'] === null || $r['match']['state'] === $parsed['status'])
                ->sort(fn ($a, $b) => $this->rank($a['match']) <=> $this->rank($b['match']))
                ->values();
        }

        $total = $results->count();

        return [
            'query' => $query,
            'interpreted' => $parsed,
            'window' => ['from' => $start->toIso8601ZuluString(), 'to' => $end->toIso8601ZuluString()],
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'has_more' => $page * $perPage < $total,
            'truncated' => $truncated,
            'results' => $results->slice(($page - 1) * $perPage, $perPage)->values()->all(),
        ];
    }

    private function applyStatus(Builder $query, ?string $status, CarbonImmutable $now): void
    {
        $inPlayFrom = $now->subMinutes(self::IN_PLAY_MINUTES);
        match ($status) {
            'upcoming' => $query->where('commence_time', '>', $now)->whereNull('home_score'),
            'in_play' => $query->where('commence_time', '<=', $now)->where('commence_time', '>', $inPlayFrom)->whereNull('home_score'),
            'finished' => $query->where(fn ($q) => $q->whereNotNull('home_score')->orWhere('commence_time', '<=', $inPlayFrom)),
            default => null,
        };
    }

    /**
     * Folded "name region sport" text for each competition in play, keyed by sport key.
     *
     * @param  Collection<int, string>  $sportKeys
     * @return array<string, string>
     */
    private function competitionText(Collection $sportKeys): array
    {
        return $sportKeys->mapWithKeys(function ($key) {
            $c = $this->catalog->describe((string) $key);

            return [(string) $key => self::fold("{$c['name']} {$c['region']} {$c['sport']}")];
        })->all();
    }

    /** Every word must appear in either team name or in the competition's name or country. */
    private function matchesAllWords(Fixture $f, array $words, array $competitionText): bool
    {
        $haystack = self::fold("{$f->home_team} {$f->away_team}").' '.($competitionText[$f->sport_key] ?? '');
        foreach ($words as $word) {
            if (! str_contains($haystack, $word)) {
                return false;
            }
        }

        return true;
    }

    /** In play first, then the soonest upcoming, then the most recent results. */
    private function rank(array $match): array
    {
        $time = strtotime($match['kickoff']);

        return match ($match['state']) {
            'in_play' => [0, $time],
            'upcoming' => [1, $time],
            default => [2, -$time],
        };
    }
}
