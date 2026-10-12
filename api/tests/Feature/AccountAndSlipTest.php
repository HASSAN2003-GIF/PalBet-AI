<?php

namespace Tests\Feature;

use App\Models\Bet;
use App\Models\Fixture;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountAndSlipTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->parse('2026-10-12 12:00:00', 'UTC'));
    }

    private function player(float $balance = 100): User
    {
        $user = User::factory()->create();
        $user->forceFill(['balance' => $balance])->save();

        return $user;
    }

    // ---------------------------------------------------------------- accounts

    public function test_register_creates_an_account_with_starting_tokens_and_a_token(): void
    {
        $r = $this->postJson('/api/auth/register', [
            'name' => 'Hassan', 'email' => 'Hassan@Example.com', 'password' => 'goal2026', 'adult' => true,
        ])->assertCreated()
            ->assertJsonPath('user.email', 'hassan@example.com')
            ->assertJsonPath('user.balance', 100);

        $this->getJson('/api/me', ['Authorization' => 'Bearer '.$r->json('token')])
            ->assertOk()->assertJsonPath('user.name', 'Hassan');
    }

    public function test_register_requires_adult_confirmation_strong_password_and_unique_email(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/auth/register', ['name' => 'A', 'email' => 'taken@example.com', 'password' => 'short'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password', 'adult']);
    }

    public function test_register_cannot_set_its_own_balance(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Greedy', 'email' => 'g@example.com', 'password' => 'goal2026', 'adult' => true, 'balance' => 999999,
        ])->assertCreated()->assertJsonPath('user.balance', 100);
    }

    public function test_login_and_logout(): void
    {
        User::factory()->create(['email' => 'p@example.com', 'password' => 'goal2026']);

        $this->postJson('/api/auth/login', ['email' => 'p@example.com', 'password' => 'wrong123'])
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $token = $this->postJson('/api/auth/login', ['email' => 'P@example.com', 'password' => 'goal2026'])
            ->assertOk()->json('token');

        $this->postJson('/api/auth/logout', [], ['Authorization' => "Bearer $token"])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/me', ['Authorization' => "Bearer $token"])->assertUnauthorized();
    }

    public function test_slip_routes_require_sign_in_and_answer_json_without_accept_header(): void
    {
        $this->getJson('/api/slips')->assertUnauthorized();
        $this->post('/api/slips')->assertUnauthorized()->assertJsonStructure(['message']);
    }

    // ---------------------------------------------------------------- placing slips

    public function test_placing_a_slip_uses_server_prices_and_takes_the_stake(): void
    {
        $user = $this->player(100);
        Sanctum::actingAs($user);
        $a = Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00', 'odds_home' => 2.10]);
        $b = Fixture::factory()->create(['commence_time' => '2026-10-13 20:00:00', 'odds_draw' => 3.40]);

        $this->postJson('/api/slips', [
            'stake' => 10,
            'selections' => [
                ['fixture_id' => $a->id, 'outcome' => 'home', 'price' => 99],
                ['fixture_id' => $b->id, 'outcome' => 'draw'],
            ],
        ])->assertCreated()
            ->assertJsonPath('slip.total_odds', 7.14)
            ->assertJsonPath('slip.potential_payout', 71.4)
            ->assertJsonPath('slip.picks.0.price', 2.1)
            ->assertJsonPath('slip.picks.1.label', 'Draw')
            ->assertJsonPath('user.balance', 90);

        $this->assertSame('90.00', $user->fresh()->balance);
    }

    public function test_slip_rejects_started_matches_bad_outcomes_duplicates_and_overspending(): void
    {
        Sanctum::actingAs($this->player(5));
        $started = Fixture::factory()->create(['commence_time' => '2026-10-12 11:00:00']);
        $twoWay = Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00', 'odds_draw' => 0, 'prob_draw' => 0]);
        $ok = Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00']);

        $this->postJson('/api/slips', ['stake' => 1, 'selections' => [['fixture_id' => $started->id, 'outcome' => 'home']]])
            ->assertStatus(422)->assertJsonValidationErrors('selections.0.fixture_id');

        $this->postJson('/api/slips', ['stake' => 1, 'selections' => [['fixture_id' => $twoWay->id, 'outcome' => 'draw']]])
            ->assertStatus(422)->assertJsonValidationErrors('selections.0.outcome');

        $this->postJson('/api/slips', ['stake' => 1, 'selections' => [
            ['fixture_id' => $ok->id, 'outcome' => 'home'], ['fixture_id' => $ok->id, 'outcome' => 'away'],
        ]])->assertStatus(422)->assertJsonValidationErrors('selections');

        $this->postJson('/api/slips', ['stake' => 6, 'selections' => [['fixture_id' => $ok->id, 'outcome' => 'home']]])
            ->assertStatus(422)->assertJsonValidationErrors('stake');

        $this->postJson('/api/slips', ['stake' => 0, 'selections' => [['fixture_id' => $ok->id, 'outcome' => 'home']]])
            ->assertStatus(422)->assertJsonValidationErrors('stake');

        $this->assertSame(0, Bet::count());
    }

    public function test_players_only_see_their_own_slips(): void
    {
        $f = Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00']);
        $mine = $this->player();
        $theirs = $this->player();

        Sanctum::actingAs($theirs);
        $this->postJson('/api/slips', ['stake' => 3, 'selections' => [['fixture_id' => $f->id, 'outcome' => 'home']]])->assertCreated();

        Sanctum::actingAs($mine);
        $this->getJson('/api/slips')->assertOk()->assertJsonCount(0, 'slips');
    }

    // ---------------------------------------------------------------- settlement

    public function test_settlement_pays_winners_only_once_and_follows_real_results(): void
    {
        $user = $this->player(100);
        Sanctum::actingAs($user);
        $a = Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00', 'odds_home' => 2.0]);
        $b = Fixture::factory()->create(['commence_time' => '2026-10-13 20:00:00', 'odds_away' => 3.0]);
        $this->postJson('/api/slips', ['stake' => 10, 'selections' => [
            ['fixture_id' => $a->id, 'outcome' => 'home'], ['fixture_id' => $b->id, 'outcome' => 'away'],
        ]])->assertCreated();

        // Only one match finished: still pending.
        $a->forceFill(['home_score' => 2, 'away_score' => 0, 'completed' => true])->save();
        $this->artisan('ai:settle-predictions')->expectsOutputToContain('Still waiting for results: 1');
        $this->assertSame(Bet::PENDING, Bet::first()->status);

        $b->forceFill(['home_score' => 1, 'away_score' => 3, 'completed' => true])->save();
        $this->artisan('ai:settle-predictions')->assertSuccessful();
        $this->artisan('ai:settle-predictions')->assertSuccessful(); // second run must not pay again

        $slip = Bet::first();
        $this->assertSame(Bet::WON, $slip->status);
        $this->assertSame('60.00', $slip->payout);
        $this->assertSame('150.00', $user->fresh()->balance); // 100 - 10 + 60
    }

    public function test_a_wrong_pick_loses_the_slip_immediately(): void
    {
        $user = $this->player(50);
        Sanctum::actingAs($user);
        $a = Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00']);
        $b = Fixture::factory()->create(['commence_time' => '2026-10-14 18:00:00']);
        $this->postJson('/api/slips', ['stake' => 5, 'selections' => [
            ['fixture_id' => $a->id, 'outcome' => 'home'], ['fixture_id' => $b->id, 'outcome' => 'home'],
        ]])->assertCreated();

        $a->forceFill(['home_score' => 0, 'away_score' => 0, 'completed' => true])->save();
        $this->artisan('ai:settle-predictions')->assertSuccessful();

        $this->assertSame(Bet::LOST, Bet::first()->status);
        $this->assertSame('45.00', $user->fresh()->balance);

        $this->getJson('/api/slips')->assertJsonPath('slips.0.picks.0.status', 'lost')
            ->assertJsonPath('slips.0.picks.0.score.home', 0)
            ->assertJsonPath('slips.0.picks.1.status', 'pending');
    }

    public function test_matches_without_a_result_after_four_days_are_voided_and_refunded(): void
    {
        $user = $this->player(20);
        Sanctum::actingAs($user);
        $f = Fixture::factory()->create(['commence_time' => '2026-10-13 18:00:00']);
        $this->postJson('/api/slips', ['stake' => 4, 'selections' => [['fixture_id' => $f->id, 'outcome' => 'away']]])->assertCreated();

        $this->travelTo(now()->parse('2026-10-18 12:00:00', 'UTC'));
        $this->artisan('ai:settle-predictions')->assertSuccessful();

        $this->assertSame(Bet::VOID, Bet::first()->status);
        $this->assertSame('20.00', $user->fresh()->balance);
    }
}
