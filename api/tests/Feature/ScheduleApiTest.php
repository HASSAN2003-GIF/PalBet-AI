<?php

namespace Tests\Feature;

use App\Models\Fixture;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->parse('2026-10-12 09:00:00', 'UTC'));
    }

    public function test_day_boundaries_follow_the_viewers_timezone(): void
    {
        // 22:30 UTC on the 12th is 01:30 on the 13th in Dar es Salaam (UTC+3).
        Fixture::factory()->create(['commence_time' => '2026-10-12 22:30:00']);

        $this->getJson('/api/schedule?date=2026-10-12&tz=UTC')
            ->assertOk()->assertJsonPath('summary.matches', 1);

        $this->getJson('/api/schedule?date=2026-10-12&tz=Africa/Dar_es_Salaam')
            ->assertOk()->assertJsonPath('summary.matches', 0);

        $this->getJson('/api/schedule?date=2026-10-13&tz=Africa/Dar_es_Salaam')
            ->assertOk()
            ->assertJsonPath('summary.matches', 1)
            ->assertJsonPath('competitions.0.matches.0.kickoff', '2026-10-12T22:30:00Z');
    }

    public function test_matches_are_grouped_by_competition_with_readable_names(): void
    {
        Fixture::factory()->count(2)->create(['sport_key' => 'soccer_epl', 'commence_time' => '2026-10-12 14:00:00']);
        Fixture::factory()->create(['sport_key' => 'soccer_spain_la_liga', 'commence_time' => '2026-10-12 19:00:00']);
        Fixture::factory()->create(['sport_key' => 'soccer_sweden_superettan', 'commence_time' => '2026-10-12 16:00:00']);

        $response = $this->getJson('/api/schedule?date=2026-10-12&tz=UTC')->assertOk();

        $response->assertJsonPath('summary.competitions', 3)
            ->assertJsonPath('summary.matches', 4);

        $byKey = collect($response->json('competitions'))->keyBy('key');
        $this->assertSame(['England', 'Premier League', 2], [$byKey['soccer_epl']['region'], $byKey['soccer_epl']['name'], $byKey['soccer_epl']['match_count']]);
        $this->assertSame('Spain', $byKey['soccer_spain_la_liga']['region']);
        // Unknown keys still get a sensible label.
        $this->assertSame(['Sweden', 'Superettan'], [$byKey['soccer_sweden_superettan']['region'], $byKey['soccer_sweden_superettan']['name']]);
    }

    public function test_value_price_exposes_the_selection_named_in_the_rationale(): void
    {
        $fixture = Fixture::factory()->valueAway(3.6, 0.061)->create(['commence_time' => '2026-10-12 18:00:00']);

        $this->getJson('/api/schedule?date=2026-10-12&tz=UTC')
            ->assertOk()
            ->assertJsonPath('summary.value', 1)
            ->assertJsonPath('competitions.0.value_count', 1)
            ->assertJsonPath('competitions.0.matches.0.value.is_value', true)
            ->assertJsonPath('competitions.0.matches.0.value.edge', 0.061)
            ->assertJsonPath('competitions.0.matches.0.value.selection.outcome', 'away')
            ->assertJsonPath('competitions.0.matches.0.value.selection.label', $fixture->away_team)
            ->assertJsonPath('competitions.0.matches.0.value.selection.price', 3.6);
    }

    public function test_probabilities_are_whole_percentages_that_sum_to_100(): void
    {
        Fixture::factory()->create([
            'commence_time' => '2026-10-12 18:00:00',
            'prob_home' => 0.333, 'prob_draw' => 0.333, 'prob_away' => 0.334,
        ]);

        $p = $this->getJson('/api/schedule?date=2026-10-12&tz=UTC')
            ->json('competitions.0.matches.0.probabilities');

        $this->assertSame(100, $p['home'] + $p['draw'] + $p['away']);
    }

    public function test_two_way_markets_have_no_draw(): void
    {
        Fixture::factory()->create([
            'commence_time' => '2026-10-12 18:00:00',
            'odds_draw' => 0, 'prob_draw' => 0, 'prob_home' => 0.6, 'prob_away' => 0.4,
        ]);

        $this->getJson('/api/schedule?date=2026-10-12&tz=UTC')
            ->assertJsonPath('competitions.0.matches.0.three_way', false)
            ->assertJsonPath('competitions.0.matches.0.odds.draw', null)
            ->assertJsonPath('competitions.0.matches.0.probabilities.draw', null)
            ->assertJsonPath('competitions.0.matches.0.probabilities.home', 60);
    }

    public function test_only_form_from_a_real_source_is_shown(): void
    {
        Fixture::factory()->create([
            'commence_time' => '2026-10-12 18:00:00',
            'home_form' => 'W,W,D,L,W', 'home_form_source' => 'espn_form',
            'away_form' => 'L,L,L,L,L', 'away_form_source' => 'synthetic',
        ]);

        $this->getJson('/api/schedule?date=2026-10-12&tz=UTC')
            ->assertJsonPath('competitions.0.matches.0.home.form.results', ['W', 'W', 'D', 'L', 'W'])
            ->assertJsonPath('competitions.0.matches.0.away.form', null);
    }

    public function test_match_state_reflects_kickoff_time(): void
    {
        Fixture::factory()->create(['commence_time' => '2026-10-12 06:00:00']); // finished
        Fixture::factory()->create(['commence_time' => '2026-10-12 08:30:00']); // in play
        Fixture::factory()->create(['commence_time' => '2026-10-12 20:00:00']); // upcoming

        $states = collect($this->getJson('/api/schedule?date=2026-10-12&tz=UTC')->json('competitions.0.matches'))
            ->pluck('state')->all();

        $this->assertSame(['finished', 'in_play', 'upcoming'], $states);
    }

    public function test_markets_use_plain_names_and_drop_placeholders(): void
    {
        Fixture::factory()->create(['commence_time' => '2026-10-12 18:00:00', 'market_2_label' => 'Total', 'market_2_val' => 'N/A']);

        $this->getJson('/api/schedule?date=2026-10-12&tz=UTC')
            ->assertJsonPath('competitions.0.matches.0.markets', [['label' => 'Over 2.5 goals', 'value' => '51%']]);
    }

    public function test_invalid_parameters_are_rejected(): void
    {
        $this->getJson('/api/schedule?tz=Mars/Olympus')->assertStatus(422)->assertJsonValidationErrors('tz');
        $this->getJson('/api/schedule?date=12-10-2026')->assertStatus(422)->assertJsonValidationErrors('date');
    }

    public function test_defaults_to_today_in_the_given_timezone(): void
    {
        $this->getJson('/api/schedule?tz=Africa/Dar_es_Salaam')
            ->assertOk()
            ->assertJsonPath('date', '2026-10-12')
            ->assertJsonPath('timezone', 'Africa/Dar_es_Salaam');
    }
}
