<?php

namespace App\Console\Commands;

use App\Services\ResultsService;
use Illuminate\Console\Command;
use RuntimeException;

class UpdateResults extends Command
{
    protected $signature = 'app:update-results';

    protected $description = 'Fetch final scores for recently played fixtures from The Odds API';

    public function handle(ResultsService $results): int
    {
        $apiKey = (string) config('services.odds.key');
        if ($apiKey === '') {
            $this->error('ODDS_API_KEY is missing from your .env file.');

            return self::FAILURE;
        }

        $sports = $results->sportsAwaitingResults();
        if ($sports->isEmpty()) {
            $this->info('No played matches are waiting for a result.');

            return self::SUCCESS;
        }

        $this->info("Checking results for {$sports->count()} competition(s)...");
        $failed = 0;
        foreach ($sports as $sport) {
            try {
                ['checked' => $checked, 'updated' => $updated] = $results->updateSport($sport, $apiKey);
                $this->line("  {$sport}: {$updated} result(s) stored from {$checked} event(s)");
            } catch (RuntimeException $e) {
                $failed++;
                $this->warn("  {$sport}: {$e->getMessage()}");
            }
        }

        return $failed === $sports->count() ? self::FAILURE : self::SUCCESS;
    }
}
