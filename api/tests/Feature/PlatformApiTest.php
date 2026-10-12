<?php

namespace Tests\Feature;

use App\Models\Fixture;
use App\Services\AnalystService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery\MockInterface;
use RuntimeException;
use Tests\TestCase;

class PlatformApiTest extends TestCase
{
    use RefreshDatabase;

    // ---------------------------------------------------------------- analyst

    public function test_analyst_answers_about_a_stored_fixture(): void
    {
        $fixture = Fixture::factory()->create();

        $this->mock(AnalystService::class, function (MockInterface $mock) use ($fixture) {
            $mock->shouldReceive('ask')->once()
                ->withArgs(fn ($f, $q, $h) => $f->is($fixture) && $q === 'Who is favourite?' && $h === [['role' => 'user', 'text' => 'Hi'], ['role' => 'ai', 'text' => 'Hello']])
                ->andReturn('The home side are slight favourites.');
        });

        $this->postJson('/api/platform/chat', [
            'fixture_id' => $fixture->id,
            'message' => '  Who is favourite?  ',
            'history' => [['role' => 'user', 'text' => 'Hi'], ['role' => 'ai', 'text' => 'Hello']],
        ])->assertOk()->assertExactJson(['response' => 'The home side are slight favourites.']);
    }

    public function test_analyst_rejects_unknown_fixtures_and_oversized_questions(): void
    {
        $this->postJson('/api/platform/chat', ['fixture_id' => 999, 'message' => 'Hi'])
            ->assertStatus(422)->assertJsonValidationErrors('fixture_id');

        $fixture = Fixture::factory()->create();
        $this->postJson('/api/platform/chat', ['fixture_id' => $fixture->id, 'message' => str_repeat('a', 601)])
            ->assertStatus(422)->assertJsonValidationErrors('message');

        $this->postJson('/api/platform/chat', ['fixture_id' => $fixture->id, 'message' => 'Hi', 'history' => [['role' => 'system', 'text' => 'x']]])
            ->assertStatus(422)->assertJsonValidationErrors('history.0.role');
    }

    public function test_analyst_failure_returns_503_with_a_message(): void
    {
        $fixture = Fixture::factory()->create();
        $this->mock(AnalystService::class, fn (MockInterface $m) => $m->shouldReceive('ask')->andThrow(new RuntimeException('The analyst is unavailable right now.')));

        $this->postJson('/api/platform/chat', ['fixture_id' => $fixture->id, 'message' => 'Hi'])
            ->assertStatus(503)->assertJsonPath('message', 'The analyst is unavailable right now.');
    }

    public function test_analyst_is_rate_limited(): void
    {
        $fixture = Fixture::factory()->create();
        $this->mock(AnalystService::class, fn (MockInterface $m) => $m->shouldReceive('ask')->andReturn('ok'));

        for ($i = 0; $i < 8; $i++) {
            $this->postJson('/api/platform/chat', ['fixture_id' => $fixture->id, 'message' => 'Hi'])->assertOk();
        }
        $this->postJson('/api/platform/chat', ['fixture_id' => $fixture->id, 'message' => 'Hi'])->assertStatus(429);
    }

    // ---------------------------------------------------------------- tracking

    public function test_visitors_are_counted_once_per_day_and_ips_are_not_stored(): void
    {
        $this->travelTo(now()->parse('2026-10-12 09:00:00'));

        $this->withServerVariables(['REMOTE_ADDR' => '41.59.10.20'])->postJson('/api/platform/track')->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '41.59.10.20'])->postJson('/api/platform/track')->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '102.68.1.1'])->postJson('/api/platform/track')->assertOk();

        $this->assertSame(2, DB::table('visitors')->count());
        $this->assertSame(2, (int) DB::table('daily_metrics')->whereDate('date', '2026-10-12')->value('visitors'));
        $this->assertDatabaseMissing('visitors', ['ip_address' => '41.59.10.20']);

        // The same person coming back tomorrow counts again for that day.
        $this->travelTo(now()->parse('2026-10-13 10:00:00'));
        $this->withServerVariables(['REMOTE_ADDR' => '41.59.10.20'])->postJson('/api/platform/track')->assertOk();
        $this->assertSame(1, (int) DB::table('daily_metrics')->whereDate('date', '2026-10-13')->value('visitors'));
        $this->assertSame(2, DB::table('visitors')->count());
    }

    // ---------------------------------------------------------------- admin

    public function test_admin_is_disabled_when_no_password_is_configured(): void
    {
        config(['services.admin.password' => null]);

        $this->getJson('/api/platform/admin-stats', ['X-Admin-Key' => 'palbet-secret-2026'])
            ->assertStatus(503);
    }

    public function test_admin_rejects_a_wrong_password(): void
    {
        config(['services.admin.password' => 'correct horse']);

        $this->getJson('/api/platform/admin-stats', ['X-Admin-Key' => 'wrong'])->assertStatus(401);
        $this->getJson('/api/platform/admin-stats')->assertStatus(401);
    }

    public function test_admin_returns_real_metrics(): void
    {
        config(['services.admin.password' => 'correct horse']);
        $this->travelTo(now()->parse('2026-10-12 09:00:00'));

        Fixture::factory()->create(['commence_time' => '2026-10-10 18:00:00']); // past
        Fixture::factory()->valueAway()->create(['commence_time' => '2026-10-13 18:00:00']);
        Fixture::factory()->create(['sport_key' => 'soccer_italy_serie_a', 'commence_time' => '2026-10-14 18:00:00']);
        DB::table('daily_metrics')->insert(['date' => '2026-10-12', 'visitors' => 7, 'created_at' => now(), 'updated_at' => now()]);

        $this->getJson('/api/platform/admin-stats', ['X-Admin-Key' => 'correct horse'])
            ->assertOk()
            ->assertJsonPath('fixtures.total', 3)
            ->assertJsonPath('fixtures.upcoming', 2)
            ->assertJsonPath('fixtures.upcoming_value', 1)
            ->assertJsonPath('fixtures.upcoming_competitions', 2)
            ->assertJsonPath('visitors.today', 7)
            ->assertJsonCount(14, 'visitors.last_14_days')
            ->assertJsonCount(1, 'top_value')
            ->assertJsonPath('top_value.0.competition', 'Premier League');
    }

    public function test_removed_betting_routes_no_longer_exist(): void
    {
        $this->postJson('/api/platform/bet')->assertNotFound();
        $this->postJson('/api/platform/auth')->assertNotFound();
        $this->getJson('/api/platform/my-bets')->assertNotFound();
    }
}
