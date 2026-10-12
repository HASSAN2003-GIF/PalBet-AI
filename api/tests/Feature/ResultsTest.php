<?php

namespace Tests\Feature;

use App\Models\Fixture;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ResultsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->parse('2026-10-12 12:00:00', 'UTC'));
        config(['services.odds.key' => 'test-odds-key']);
    }

    private function scoresEvent(Fixture $f, ?int $home, ?int $away, bool $completed = true): array
    {
        return [
            'id' => 'evt'.$f->id,
            'sport_key' => $f->sport_key,
            'commence_time' => $f->commence_time->toIso8601ZuluString(),
            'completed' => $completed,
            'home_team' => $f->home_team,
            'away_team' => $f->away_team,
            'scores' => $home === null ? null : [
                ['name' => $f->home_team, 'score' => (string) $home],
                ['name' => $f->away_team, 'score' => (string) $away],
            ],
        ];
    }

    public function test_command_stores_final_scores_for_played_matches(): void
    {
        $played = Fixture::factory()->create(['commence_time' => '2026-10-11 18:00:00']);
        $live = Fixture::factory()->create(['commence_time' => '2026-10-12 11:30:00']); // too recent to check

        Http::fake([
            'api.the-odds-api.com/v4/sports/soccer_epl/scores/*' => Http::response([
                $this->scoresEvent($played, 2, 1),
                $this->scoresEvent($live, 0, 0, completed: false),
            ]),
        ]);

        $this->artisan('app:update-results')->assertSuccessful();

        $played->refresh();
        $this->assertTrue($played->completed);
        $this->assertSame([2, 1], [$played->home_score, $played->away_score]);
        $this->assertSame('home', $played->actualOutcome());
        $this->assertFalse($live->fresh()->completed);

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'daysFrom=3') && $r['apiKey'] === 'test-odds-key');
        Http::assertSentCount(1);
    }

    public function test_command_does_not_call_the_api_when_nothing_is_waiting(): void
    {
        Fixture::factory()->finished(1, 0)->create(['commence_time' => '2026-10-11 18:00:00']);
        Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00']); // upcoming
        Http::fake();

        $this->artisan('app:update-results')->expectsOutputToContain('No played matches')->assertSuccessful();
        Http::assertNothingSent();
    }

    public function test_api_errors_do_not_leak_the_key(): void
    {
        Fixture::factory()->create(['commence_time' => '2026-10-11 18:00:00']);
        Http::fake(['*' => Http::response(['message' => 'quota'], 401)]);

        $this->artisan('app:update-results')
            ->expectsOutputToContain('failed with HTTP 401')
            ->doesntExpectOutputToContain('test-odds-key')
            ->assertFailed();
    }

    public function test_schedule_shows_the_final_score_and_value_outcome(): void
    {
        $f = Fixture::factory()->valueAway()->finished(0, 2)->create(['commence_time' => '2026-10-11 18:00:00']);

        $this->getJson('/api/schedule?date=2026-10-11&tz=UTC')
            ->assertOk()
            ->assertJsonPath('competitions.0.matches.0.state', 'finished')
            ->assertJsonPath('competitions.0.matches.0.result.home', 0)
            ->assertJsonPath('competitions.0.matches.0.result.away', 2)
            ->assertJsonPath('competitions.0.matches.0.result.outcome', 'away')
            ->assertJsonPath('competitions.0.matches.0.result.favourite_won', false)
            ->assertJsonPath('competitions.0.matches.0.value.won', true);
    }

    public function test_track_record_measures_the_model_against_results(): void
    {
        // Favourite (home 45%) wins, exact score 1-0 predicted and hit.
        Fixture::factory()->finished(1, 0)->create(['commence_time' => '2026-10-10 18:00:00']);
        // Favourite loses; away value price at 3.6 wins.
        Fixture::factory()->valueAway(3.6)->finished(0, 1)->create(['commence_time' => '2026-10-09 18:00:00']);
        // Value price on the away side loses.
        Fixture::factory()->valueAway(4.0)->finished(2, 2)->create(['commence_time' => '2026-10-08 18:00:00']);
        // Outside the 7-day window and unfinished matches are ignored.
        Fixture::factory()->finished(3, 0)->create(['commence_time' => '2026-09-01 18:00:00']);
        Fixture::factory()->create(['commence_time' => '2026-10-11 18:00:00']);

        $r = $this->getJson('/api/track-record?days=7')->assertOk();

        $r->assertJsonPath('matches', 3)
            ->assertJsonPath('favourite.won', 1)
            ->assertJsonPath('exact_score.hits', 1)
            ->assertJsonPath('exact_score.total', 3)
            ->assertJsonPath('value.count', 2)
            ->assertJsonPath('value.won', 1)
            // +2.6 for the winner, -1 for the loser.
            ->assertJsonPath('value.profit', 1.6)
            ->assertJsonPath('value.roi', 0.8)
            ->assertJsonPath('value.recent.0.won', true);

        $this->assertEqualsWithDelta(0.452, $r->json('favourite.expected_rate'), 0.0001);
        $forecasts = array_sum(array_column($r->json('calibration'), 'forecasts'));
        $this->assertSame(9, $forecasts); // 3 matches x 3 outcomes
    }

    public function test_track_record_handles_no_results_and_rejects_odd_windows(): void
    {
        $this->getJson('/api/track-record')->assertOk()
            ->assertJsonPath('matches', 0)
            ->assertJsonPath('favourite.rate', null)
            ->assertJsonPath('value.count', 0);

        $this->getJson('/api/track-record?days=12')->assertStatus(422);
    }
}
