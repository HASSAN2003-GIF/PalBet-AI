<?php

namespace Tests\Feature;

use App\Models\Fixture;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OddsRefreshTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_leagues_with_a_match_kicking_off_soon_are_refreshed(): void
    {
        $this->travelTo(now()->parse('2026-10-12 12:00:00'));
        Fixture::factory()->create(['sport_key' => 'soccer_epl', 'commence_time' => now()->addHours(2)]);
        Fixture::factory()->create(['sport_key' => 'soccer_epl', 'commence_time' => now()->addHours(1)]);
        Fixture::factory()->create(['sport_key' => 'soccer_spain_la_liga', 'commence_time' => now()->addHours(10)]);
        Fixture::factory()->create(['sport_key' => 'soccer_italy_serie_a', 'commence_time' => now()->subHour()]);
        Fixture::factory()->create(['sport_key' => 'soccer_usa_mls', 'commence_time' => now()->addHour(), 'completed' => true]);

        $this->assertSame(['soccer_epl'], Fixture::sportsKickingOffWithin(3));
        $this->assertSame(['soccer_epl', 'soccer_spain_la_liga'], Fixture::sportsKickingOffWithin(12));
    }

    public function test_upcoming_refresh_with_nothing_to_do_spends_no_credits(): void
    {
        config(['services.odds.key' => 'test-key']);

        $this->artisan('app:update-fixtures', ['--upcoming' => 3])
            ->expectsOutputToContain('nothing to refresh')
            ->assertSuccessful();
    }

    public function test_upcoming_hours_are_validated(): void
    {
        config(['services.odds.key' => 'test-key']);

        $this->artisan('app:update-fixtures', ['--upcoming' => 0])->assertFailed();
    }
}
