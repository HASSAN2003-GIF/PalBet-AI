<?php

namespace App\Console\Commands;

use App\Services\SlipService;
use Illuminate\Console\Command;

/**
 * Settles prediction slips against real final scores (see app:update-results).
 * Previously this rolled a random number; now a slip only wins if its matches really did.
 */
class SettlePredictions extends Command
{
    protected $signature = 'ai:settle-predictions';

    protected $description = 'Settle pending prediction slips against real match results';

    public function handle(SlipService $slips): int
    {
        $counts = $slips->settlePending();

        $this->info(sprintf(
            'Settled: %d won, %d lost, %d void. Still waiting for results: %d.',
            $counts['won'], $counts['lost'], $counts['void'], $counts['pending'],
        ));

        return self::SUCCESS;
    }
}
