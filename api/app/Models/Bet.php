<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A prediction slip, paid for with play-money tokens. `matches` is a snapshot of each pick at
 * the moment it was placed: [{fixture_id, outcome, price, label, home, away, kickoff, competition}].
 */
class Bet extends Model
{
    public const PENDING = 'pending';
    public const WON = 'won';
    public const LOST = 'lost';
    public const VOID = 'void';

    protected $fillable = ['user_id', 'stake', 'total_odds', 'potential_payout', 'matches', 'status'];

    protected $casts = [
        'matches' => 'array',
        'stake' => 'decimal:2',
        'total_odds' => 'decimal:2',
        'potential_payout' => 'decimal:2',
        'payout' => 'decimal:2',
        'settled_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return list<int> */
    public function fixtureIds(): array
    {
        return array_values(array_unique(array_map(fn ($m) => (int) $m['fixture_id'], $this->matches ?? [])));
    }
}
