<?php

namespace App\Services;

use App\Models\Fixture;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Pulls final scores from The Odds API (/v4/sports/{sport}/scores) and stores them on fixtures.
 *
 * The scores endpoint costs API credits, so it is only called for competitions that actually
 * have matches waiting for a result, and only covers the last 3 days (the API's maximum).
 */
class ResultsService
{
    private const BASE = 'https://api.the-odds-api.com/v4/sports';

    /** A match is only worth checking once it has had time to finish. */
    private const MIN_MINUTES_AFTER_KICKOFF = 110;

    private const LOOKBACK_DAYS = 3;

    /** @return Collection<int, string> sport keys with unresolved, recently played fixtures */
    public function sportsAwaitingResults(?CarbonImmutable $now = null): Collection
    {
        $now ??= CarbonImmutable::now('UTC');

        return Fixture::query()
            ->where('completed', false)
            ->where('commence_time', '>=', $now->subDays(self::LOOKBACK_DAYS))
            ->where('commence_time', '<=', $now->subMinutes(self::MIN_MINUTES_AFTER_KICKOFF))
            ->distinct()
            ->orderBy('sport_key')
            ->pluck('sport_key');
    }

    /**
     * Fetch and store results for one competition.
     *
     * @return array{checked: int, updated: int}
     *
     * @throws RuntimeException when the API call fails
     */
    public function updateSport(string $sportKey, string $apiKey): array
    {
        try {
            $events = Http::timeout(30)
                ->retry(2, 500, throw: false)
                ->get(self::BASE."/{$sportKey}/scores/", [
                    'apiKey' => $apiKey,
                    'daysFrom' => self::LOOKBACK_DAYS,
                    'dateFormat' => 'iso',
                ])
                ->throw()
                ->json();
        } catch (RequestException $e) {
            // Never let the API key (it is in the URL) reach logs or console output.
            throw new RuntimeException("Scores request for {$sportKey} failed with HTTP {$e->response->status()}.");
        } catch (ConnectionException) {
            throw new RuntimeException("Could not reach The Odds API for {$sportKey}.");
        }

        if (! is_array($events)) {
            throw new RuntimeException("Unexpected scores payload for {$sportKey}.");
        }

        $updated = 0;
        foreach ($events as $event) {
            if ($this->storeEvent($sportKey, $event)) {
                $updated++;
            }
        }

        return ['checked' => count($events), 'updated' => $updated];
    }

    /** Store one completed event. Returns true when a fixture got a (new) final score. */
    public function storeEvent(string $sportKey, array $event): bool
    {
        if (empty($event['completed']) || empty($event['home_team']) || empty($event['away_team'])) {
            return false;
        }

        $scores = collect($event['scores'] ?? [])->mapWithKeys(fn ($s) => [(string) ($s['name'] ?? '') => $s['score'] ?? null]);
        $home = $scores->get($event['home_team']);
        $away = $scores->get($event['away_team']);
        if (! is_numeric($home) || ! is_numeric($away)) {
            return false;
        }

        // Same data provider as the odds feed, so names match exactly; allow a few hours of
        // slack on kickoff time in case a match was moved after it was priced.
        $kickoff = CarbonImmutable::parse($event['commence_time'] ?? 'now')->utc();
        $fixture = Fixture::query()
            ->where('sport_key', $sportKey)
            ->where('home_team', $event['home_team'])
            ->where('away_team', $event['away_team'])
            ->whereBetween('commence_time', [$kickoff->subHours(6), $kickoff->addHours(6)])
            ->first();

        if (! $fixture) {
            return false;
        }

        $changed = ! $fixture->completed || $fixture->home_score !== (int) $home || $fixture->away_score !== (int) $away;

        $fixture->forceFill([
            'home_score' => (int) $home,
            'away_score' => (int) $away,
            'completed' => true,
            'result_fetched_at' => now(),
        ])->save();

        return $changed;
    }
}
