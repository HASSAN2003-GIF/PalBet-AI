<?php

namespace Tests\Feature;

use App\Models\Fixture;
use App\Services\MatchSearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MatchSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Tuesday 13 October 2026, 12:00 UTC.
        $this->travelTo(now()->parse('2026-10-13 12:00:00'));
    }

    private function fixture(string $home, string $away, string $kickoff, string $sport = 'soccer_epl', array $extra = []): Fixture
    {
        return Fixture::factory()->create([
            'home_team' => $home, 'away_team' => $away, 'sport_key' => $sport,
            'commence_time' => now()->parse($kickoff), 'date_str' => substr($kickoff, 0, 10),
        ] + $extra);
    }

    private function search(string $q, array $params = []): array
    {
        return $this->getJson('/api/search?'.http_build_query(['q' => $q] + $params + ['tz' => 'UTC']))
            ->assertOk()->json();
    }

    private function names(array $payload): array
    {
        return array_map(fn ($r) => $r['match']['home']['name'].' v '.$r['match']['away']['name'], $payload['results']);
    }

    // ---------------------------------------------------------------- text

    public function test_finds_a_team_on_either_side_with_partial_case_insensitive_text(): void
    {
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 19:00:00');
        $this->fixture('Chelsea', 'Everton', '2026-10-18 15:00:00');
        $this->fixture('Fulham', 'Brentford', '2026-10-14 19:00:00');

        $this->assertSame(['Arsenal v Chelsea', 'Chelsea v Everton'], $this->names($this->search('  CHEL ')));
        $this->assertSame(['Arsenal v Chelsea'], $this->names($this->search('arsenal')));
    }

    public function test_every_word_must_match_so_two_teams_find_their_meeting(): void
    {
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 19:00:00');
        $this->fixture('Chelsea', 'Everton', '2026-10-18 15:00:00');

        $this->assertSame(['Arsenal v Chelsea'], $this->names($this->search('arsenal vs chelsea')));
        $this->assertSame([], $this->names($this->search('arsenal everton')));
    }

    public function test_accents_and_punctuation_are_ignored(): void
    {
        $this->fixture('Atlético Madrid', 'Sevilla', '2026-10-14 19:00:00', 'soccer_spain_la_liga');
        $this->fixture('Śląsk Wrocław', 'Legia Warszawa', '2026-10-14 17:00:00', 'soccer_poland_ekstraklasa');
        $this->fixture('St. Louis City SC', 'LA Galaxy', '2026-10-15 00:30:00', 'soccer_usa_mls');

        $this->assertSame(['Atlético Madrid v Sevilla'], $this->names($this->search('atletico')));
        $this->assertSame(['Śląsk Wrocław v Legia Warszawa'], $this->names($this->search('slask wroclaw')));
        $this->assertSame(['St. Louis City SC v LA Galaxy'], $this->names($this->search('st louis')));
    }

    public function test_competition_name_and_country_find_their_matches(): void
    {
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 19:00:00', 'soccer_epl');
        $this->fixture('Levante', 'Sevilla', '2026-10-14 19:00:00', 'soccer_spain_la_liga');

        $this->assertSame(['Arsenal v Chelsea'], $this->names($this->search('premier league')));
        $this->assertSame(['Levante v Sevilla'], $this->names($this->search('spain')));
        $this->assertSame(['Levante v Sevilla'], $this->names($this->search('la liga levante')));
        $first = $this->search('premier league')['results'][0];
        $this->assertSame('Premier League', $first['competition']['name']);
        $this->assertSame('England', $first['competition']['region']);
    }

    // ---------------------------------------------------------------- day and state

    public function test_day_words_limit_results_to_that_local_day(): void
    {
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 19:00:00');
        $this->fixture('Arsenal', 'Everton', '2026-10-18 15:00:00');

        $this->assertSame(['Arsenal v Chelsea'], $this->names($this->search('arsenal tomorrow')));
        $this->assertSame(['Arsenal v Everton'], $this->names($this->search('arsenal 2026-10-18')));
        $this->assertSame(['Arsenal v Everton'], $this->names($this->search('arsenal 18 oct')));
        $this->assertSame(['Arsenal v Everton'], $this->names($this->search('arsenal sunday')));
        $this->assertSame(['Arsenal v Everton'], $this->names($this->search('arsenal 18/10')));
        // A day alone lists everything on it.
        $this->assertSame(['Arsenal v Chelsea'], $this->names($this->search('tomorrow')));
    }

    public function test_the_day_follows_the_viewers_timezone(): void
    {
        // 23:30 UTC on the 14th is already the 15th in Dar es Salaam (UTC+3).
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 23:30:00');

        $this->assertSame([], $this->names($this->search('2026-10-15')));
        $this->assertSame(['Arsenal v Chelsea'], $this->names($this->search('2026-10-15', ['tz' => 'Africa/Dar_es_Salaam'])));
    }

    public function test_state_words_filter_live_upcoming_and_finished(): void
    {
        $this->fixture('Live Home', 'Live Away', '2026-10-13 11:30:00');
        $this->fixture('Done Home', 'Done Away', '2026-10-12 19:00:00', 'soccer_epl', ['home_score' => 2, 'away_score' => 1, 'completed' => true]);
        $this->fixture('Next Home', 'Next Away', '2026-10-14 19:00:00');

        $this->assertSame(['Live Home v Live Away'], $this->names($this->search('live')));
        $this->assertSame(['Next Home v Next Away'], $this->names($this->search('upcoming')));
        $this->assertSame(['Done Home v Done Away'], $this->names($this->search('results')));
        // Without a state: in play first, then the soonest upcoming, then the latest results.
        $this->assertSame(['Live Home v Live Away', 'Next Home v Next Away', 'Done Home v Done Away'], $this->names($this->search('home')));
        $this->assertSame('in_play', $this->search('live')['results'][0]['match']['state']);
    }

    public function test_without_a_day_only_the_window_around_today_is_searched(): void
    {
        $this->fixture('Arsenal', 'Old Rival', '2026-09-01 19:00:00');
        $this->fixture('Arsenal', 'Far Future', '2026-12-01 19:00:00');
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 19:00:00');

        $this->assertSame(['Arsenal v Chelsea'], $this->names($this->search('arsenal')));
        $this->assertSame(['Arsenal v Far Future'], $this->names($this->search('arsenal 2026-12-01')));
    }

    // ---------------------------------------------------------------- paging and limits

    public function test_results_are_paginated(): void
    {
        for ($i = 0; $i < 25; $i++) {
            $this->fixture("Club {$i}", "Rovers {$i}", '2026-10-14 '.sprintf('%02d', $i % 24).':00:00');
        }

        $first = $this->search('rovers');
        $this->assertSame(25, $first['total']);
        $this->assertCount(20, $first['results']);
        $this->assertTrue($first['has_more']);

        $second = $this->search('rovers', ['page' => 2]);
        $this->assertCount(5, $second['results']);
        $this->assertFalse($second['has_more']);
        $ids = array_merge(array_column(array_column($first['results'], 'match'), 'id'), array_column(array_column($second['results'], 'match'), 'id'));
        $this->assertCount(25, array_unique($ids));
    }

    public function test_no_results_is_an_empty_list_not_an_error(): void
    {
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 19:00:00');
        $payload = $this->search('zzzz nobody');
        $this->assertSame(0, $payload['total']);
        $this->assertSame([], $payload['results']);
    }

    // ---------------------------------------------------------------- validation and safety

    public function test_blank_long_or_malformed_input_is_rejected(): void
    {
        $this->getJson('/api/search?q=%20%20%20')->assertStatus(422)->assertJsonValidationErrors('q');
        $this->getJson('/api/search')->assertStatus(422)->assertJsonValidationErrors('q');
        $this->getJson('/api/search?q='.str_repeat('a', 81))->assertStatus(422)->assertJsonValidationErrors('q');
        $this->getJson('/api/search?q=arsenal&tz=Mars/Base')->assertStatus(422)->assertJsonValidationErrors('tz');
        $this->getJson('/api/search?q=arsenal&page=0')->assertStatus(422)->assertJsonValidationErrors('page');
    }

    public function test_sql_and_wildcard_characters_are_plain_text(): void
    {
        $this->fixture('Arsenal', 'Chelsea', '2026-10-14 19:00:00');

        $this->assertSame([], $this->search("'; DROP TABLE fixtures; --")['results']);
        $this->assertSame([], $this->search('%')['results']);
        $this->assertSame([], $this->search('_')['results']);
        $this->assertSame(1, DB::table('fixtures')->count());
    }

    public function test_query_words_are_parsed_into_text_day_and_state(): void
    {
        $parsed = app(MatchSearchService::class)->parse('  Arsenal VS Chelsea live 18 oct ', 'UTC');
        $this->assertSame(['arsenal', 'chelsea'], $parsed['words']);
        $this->assertSame('in_play', $parsed['status']);
        $this->assertSame('2026-10-18', $parsed['date']);
    }
}
