<?php

namespace App\Services;

use App\Models\Bet;
use App\Models\Fixture;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Prediction slips paid with play-money tokens.
 *
 * Prices always come from the database, never from the client, and every balance change
 * happens inside a transaction with the user row locked, so a slip can't be paid for twice
 * or settled twice.
 */
class SlipService
{
    public const MAX_SELECTIONS = 10;
    public const MAX_TOTAL_ODDS = 1000;

    /** A match must not have started; this margin covers clock skew and slow requests. */
    private const KICKOFF_MARGIN_SECONDS = 60;

    /** Unresolved picks this long after kickoff are voided (postponed / abandoned / no data). */
    private const VOID_AFTER_DAYS = 4;

    public function __construct(private CompetitionCatalog $catalog) {}

    /**
     * @param  list<array{fixture_id: int, outcome: string}>  $selections
     *
     * @throws ValidationException
     */
    public function place(User $user, int $stake, array $selections): Bet
    {
        $ids = array_map(fn ($s) => (int) $s['fixture_id'], $selections);
        if (count($ids) !== count(array_unique($ids))) {
            throw ValidationException::withMessages(['selections' => 'Pick at most one result per match.']);
        }

        $fixtures = Fixture::whereIn('id', $ids)->get()->keyBy('id');
        $cutoff = now()->addSeconds(self::KICKOFF_MARGIN_SECONDS);
        $picks = [];
        $totalOdds = 1.0;

        foreach ($selections as $i => $s) {
            $f = $fixtures->get((int) $s['fixture_id']);
            if (! $f) {
                throw ValidationException::withMessages(["selections.$i.fixture_id" => 'That match no longer exists.']);
            }
            if ($f->commence_time->lessThanOrEqualTo($cutoff)) {
                throw ValidationException::withMessages(["selections.$i.fixture_id" => "{$f->home_team} v {$f->away_team} has already kicked off."]);
            }
            if (! in_array($s['outcome'], $f->availableOutcomes(), true) || ! ($price = $f->priceFor($s['outcome']))) {
                throw ValidationException::withMessages(["selections.$i.outcome" => "That result can't be picked for {$f->home_team} v {$f->away_team}."]);
            }

            $totalOdds *= $price;
            $picks[] = [
                'fixture_id' => $f->id,
                'outcome' => $s['outcome'],
                'price' => $price,
                'label' => $f->teamName($s['outcome']),
                'home' => $f->home_team,
                'away' => $f->away_team,
                'kickoff' => $f->commence_time->toIso8601ZuluString(),
                'competition' => $this->catalog->describe($f->sport_key)['name'],
            ];
        }

        if ($totalOdds > self::MAX_TOTAL_ODDS) {
            throw ValidationException::withMessages(['selections' => 'Combined price is over '.self::MAX_TOTAL_ODDS.'. Remove a pick.']);
        }

        return DB::transaction(function () use ($user, $stake, $picks, $totalOdds) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ((float) $locked->balance < $stake) {
                throw ValidationException::withMessages(['stake' => "You have {$this->tokens($locked->balance)} tokens. Lower the stake."]);
            }

            $locked->forceFill(['balance' => round((float) $locked->balance - $stake, 2)])->save();
            $user->setAttribute('balance', $locked->balance);

            return Bet::create([
                'user_id' => $locked->id,
                'stake' => $stake,
                'total_odds' => round($totalOdds, 2),
                'potential_payout' => round($stake * $totalOdds, 2),
                'matches' => $picks,
                'status' => Bet::PENDING,
            ]);
        });
    }

    /**
     * Settle every pending slip whose matches allow it. Returns counts per outcome.
     *
     * @return array{won: int, lost: int, void: int, pending: int}
     */
    public function settlePending(?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now('UTC');
        $counts = ['won' => 0, 'lost' => 0, 'void' => 0, 'pending' => 0];

        Bet::where('status', Bet::PENDING)->chunkById(200, function (Collection $slips) use ($now, &$counts) {
            $fixtures = Fixture::whereIn('id', $slips->flatMap->fixtureIds()->unique())->get()->keyBy('id');
            foreach ($slips as $slip) {
                $counts[$this->settle($slip, $fixtures, $now)]++;
            }
        });

        return $counts;
    }

    /**
     * @param  Collection<int, Fixture>  $fixtures
     */
    private function settle(Bet $slip, Collection $fixtures, CarbonImmutable $now): string
    {
        $verdicts = array_map(fn ($p) => $this->pickStatus($p, $fixtures->get((int) $p['fixture_id']), $now), $slip->matches);

        if (in_array('lost', $verdicts, true)) {
            $status = Bet::LOST;
            $payout = 0.0;
        } elseif (in_array('pending', $verdicts, true)) {
            return 'pending';
        } else {
            $live = array_filter($slip->matches, fn ($p, $i) => $verdicts[$i] === 'won', ARRAY_FILTER_USE_BOTH);
            // Void picks count as a price of 1; an all-void slip just returns the stake.
            $odds = array_product(array_map(fn ($p) => (float) $p['price'], $live)) ?: 1.0;
            $status = $live ? Bet::WON : Bet::VOID;
            $payout = round((float) $slip->stake * $odds, 2);
        }

        DB::transaction(function () use ($slip, $status, $payout) {
            // Re-check under lock so two settlement runs can never pay the same slip twice.
            $fresh = Bet::whereKey($slip->id)->lockForUpdate()->first();
            if (! $fresh || $fresh->status !== Bet::PENDING) {
                return;
            }
            $fresh->forceFill(['status' => $status, 'payout' => $payout, 'settled_at' => now()])->save();
            if ($payout > 0) {
                $user = User::whereKey($fresh->user_id)->lockForUpdate()->first();
                $user?->forceFill(['balance' => round((float) $user->balance + $payout, 2)])->save();
            }
        });

        return $status;
    }

    /** won | lost | void | pending for one pick. */
    public function pickStatus(array $pick, ?Fixture $fixture, ?CarbonImmutable $now = null): string
    {
        $now ??= CarbonImmutable::now('UTC');
        if (! $fixture) {
            return 'void';
        }
        if ($fixture->hasResult()) {
            return $fixture->actualOutcome() === $pick['outcome'] ? 'won' : 'lost';
        }
        if (CarbonImmutable::parse($fixture->commence_time)->addDays(self::VOID_AFTER_DAYS)->lessThan($now)) {
            return 'void';
        }

        return 'pending';
    }

    /** @return array<string, mixed> */
    public function present(Bet $slip, Collection $fixtures): array
    {
        return [
            'id' => $slip->id,
            'status' => $slip->status,
            'stake' => (float) $slip->stake,
            'total_odds' => (float) $slip->total_odds,
            'potential_payout' => (float) $slip->potential_payout,
            'payout' => $slip->payout !== null ? (float) $slip->payout : null,
            'placed_at' => $slip->created_at?->toIso8601ZuluString(),
            'settled_at' => $slip->settled_at?->toIso8601ZuluString(),
            'picks' => array_map(function ($p) use ($fixtures) {
                $f = $fixtures->get((int) $p['fixture_id']);

                return $p + [
                    'status' => $this->pickStatus($p, $f),
                    'score' => $f?->hasResult() ? ['home' => $f->home_score, 'away' => $f->away_score] : null,
                ];
            }, $slip->matches),
        ];
    }

    private function tokens(mixed $amount): string
    {
        return rtrim(rtrim(number_format((float) $amount, 2, '.', ''), '0'), '.');
    }
}
