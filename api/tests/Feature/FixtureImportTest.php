<?php

namespace Tests\Feature;

use App\Models\Fixture;
use App\Services\FixtureImporter;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FixtureImportTest extends TestCase
{
    use RefreshDatabase;

    private CarbonImmutable $now;

    protected function setUp(): void
    {
        parent::setUp();
        $this->now = CarbonImmutable::parse('2026-10-12 12:00:00', 'UTC');
        $this->travelTo($this->now);
    }

    /** One match exactly as risk_engine.py emits it. */
    private function engineRow(array $overrides = []): array
    {
        return $overrides + [
            'home_team' => 'Arsenal', 'away_team' => 'Chelsea',
            'commence_time' => '2026-10-13T19:00:00Z', 'is_live' => false,
            'bookmaker' => 'Pinnacle', 'odds_home' => 2.1, 'odds_draw' => 3.4, 'odds_away' => 3.6,
            'prob_home' => 0.46, 'prob_draw' => 0.27, 'prob_away' => 0.27, 'pred_score' => '1 - 0',
            'home_form' => 'W,W,D', 'away_form' => 'L,D,W', 'home_form_source' => 'espn_form', 'away_form_source' => 'synthetic',
            'market_1_label' => 'O2.5', 'market_1_val' => '52%', 'market_2_label' => 'BTTS', 'market_2_val' => '50%',
            'edge' => 0.0, 'stake' => 0, 'is_value_bet' => false, 'selection' => 'home', 'selection_odds' => 2.1,
            'rationale' => 'Odds reflect fair market value.',
        ];
    }

    public function test_in_play_matches_never_overwrite_the_pre_match_read(): void
    {
        $importer = app(FixtureImporter::class);
        $importer->import('soccer_epl', [$this->engineRow(['commence_time' => '2026-10-12T13:00:00Z'])], $this->now);

        // Two hours later the match is live and the API returns in-play odds.
        $live = $this->engineRow(['commence_time' => '2026-10-12T13:00:00Z', 'is_live' => true, 'prob_home' => 0.91, 'odds_home' => 1.05]);
        $counts = $importer->import('soccer_epl', [$live], $this->now->addHours(2));

        $this->assertSame(1, $counts['skipped_started']);
        $f = Fixture::sole();
        $this->assertSame(0.46, $f->prob_home);
        $this->assertSame(2.1, $f->odds_home);
    }

    public function test_first_value_flag_is_kept_and_closing_line_value_is_measured(): void
    {
        $importer = app(FixtureImporter::class);

        // Day before: away flagged at 3.60.
        $importer->import('soccer_epl', [$this->engineRow([
            'is_value_bet' => true, 'selection' => 'away', 'selection_odds' => 3.6, 'edge' => 0.06,
            'prob_away' => 0.27,
        ])], $this->now);

        // Closer to kickoff the market moved our way (away now 30%) and the flag disappeared.
        $importer->import('soccer_epl', [$this->engineRow([
            'is_value_bet' => false, 'odds_away' => 3.2, 'prob_home' => 0.43, 'prob_draw' => 0.27, 'prob_away' => 0.30,
        ])], $this->now->addHours(20));

        $f = Fixture::sole();
        $this->assertSame('away', $f->flagged_outcome);
        $this->assertSame(3.6, $f->flagged_price);
        $this->assertFalse($f->is_value_bet);

        $value = $f->recordedValue();
        $this->assertSame('away', $value['outcome']);
        $this->assertEqualsWithDelta(3.6 * 0.30 - 1, $value['clv'], 0.0001); // +8%
    }

    public function test_track_record_counts_flags_that_were_later_dropped_and_reports_clv(): void
    {
        Fixture::factory()->finished(0, 1)->create([
            'commence_time' => '2026-10-10 18:00:00', 'is_value_bet' => false,
            'prob_home' => 0.40, 'prob_draw' => 0.30, 'prob_away' => 0.30,
            'flagged_outcome' => 'away', 'flagged_price' => 3.6, 'flagged_edge' => 0.06, 'flagged_at' => '2026-10-09 10:00:00',
        ]);
        Fixture::factory()->finished(2, 0)->create([
            'commence_time' => '2026-10-11 18:00:00',
            'prob_home' => 0.40, 'prob_draw' => 0.30, 'prob_away' => 0.30,
            'flagged_outcome' => 'draw', 'flagged_price' => 3.0, 'flagged_edge' => 0.04, 'flagged_at' => '2026-10-10 10:00:00',
        ]);

        $this->getJson('/api/track-record?days=7')->assertOk()
            ->assertJsonPath('value.count', 2)
            ->assertJsonPath('value.won', 1)
            ->assertJsonPath('value.clv.measured', 2)
            ->assertJsonPath('value.clv.beat_close_rate', 0.5)
            // away 3.60 x 30% - 1 = +8%; draw 3.00 x 30% - 1 = -10%; mean -1%
            ->assertJsonPath('value.clv.mean', -0.01);
    }

    public function test_engine_rows_without_required_fields_are_ignored(): void
    {
        $counts = app(FixtureImporter::class)->import('soccer_epl', [['home_team' => 'X']], $this->now);
        $this->assertSame(0, $counts['stored']);
        $this->assertSame(0, Fixture::count());
    }
}
