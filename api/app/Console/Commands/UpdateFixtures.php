<?php

namespace App\Console\Commands;

use App\Models\Fixture;
use App\Services\FixtureImporter;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Process\Process;

class UpdateFixtures extends Command
{
    protected $signature = 'app:update-fixtures
        {--sport=* : Only these Odds API sport keys (default: every active football league)}
        {--upcoming= : Only leagues with a stored match kicking off within this many hours (cheap near-kick-off refresh)}';

    protected $description = 'Fetch odds for football leagues, run the Python risk engine, and store its read on every upcoming match.';

    public function handle(FixtureImporter $importer): int
    {
        $pythonBinary = base_path('../venv/bin/python3');
        if (! file_exists($pythonBinary)) {
            $pythonBinary = 'python3'; // Docker image: /opt/venv is on PATH
        }
        $scriptPath = base_path('../risk_engine.py');
        $apiKey = (string) config('services.odds.key', '');

        if ($apiKey === '') {
            $this->error('ODDS_API_KEY is missing from your .env file.');

            return self::FAILURE;
        }

        $sports = $this->option('sport');
        $upcoming = $this->option('upcoming');
        if (! $sports && $upcoming !== null) {
            $hours = (int) $upcoming;
            if ($hours < 1 || $hours > 72) {
                $this->error('--upcoming must be a number of hours between 1 and 72.');

                return self::FAILURE;
            }
            $sports = Fixture::sportsKickingOffWithin($hours);
            if (! $sports) {
                $this->info("No stored matches kick off in the next {$hours} hour(s); nothing to refresh.");

                return self::SUCCESS;
            }
        }
        if (! $sports) {
            $this->info('1. Asking The Odds API for active football leagues...');
            $response = Http::timeout(60)->get('https://api.the-odds-api.com/v4/sports', ['apiKey' => $apiKey]);
            if (! $response->successful()) {
                $this->error("Failed to fetch the active sports list (HTTP {$response->status()}).");

                return self::FAILURE;
            }
            // Keep every football league the API lists (cups and lower tiers included).
            $sports = collect($response->json())
                ->pluck('key')
                ->filter(fn ($key) => str_contains(strtolower((string) $key), 'soccer'))
                ->values()
                ->all();
        }
        $this->info('Scouting '.count($sports).' league(s)...');

        $totals = ['stored' => 0, 'skipped_started' => 0, 'flagged' => 0];
        foreach ($sports as $sport) {
            // The key goes through the environment ("-" placeholder), not argv: command-line
            // arguments are visible to every local user via `ps`.
            $process = new Process(
                [$pythonBinary, $scriptPath, '--json', '-', 'odds', $sport],
                null,
                ['ODDS_API_KEY' => $apiKey]
            );
            $process->setTimeout(120);
            $process->run();

            if (! $process->isSuccessful()) {
                $this->error("Engine failed for {$sport}: ".mb_substr($process->getErrorOutput(), 0, 500));

                continue;
            }

            $matches = json_decode($process->getOutput(), true);
            if (! is_array($matches)) {
                $this->warn("Engine returned no JSON for {$sport}.");

                continue;
            }

            $counts = $importer->import($sport, $matches);
            foreach ($counts as $k => $v) {
                $totals[$k] += $v;
            }
            $this->line("  {$sport}: {$counts['stored']} stored, {$counts['skipped_started']} already started, {$counts['flagged']} new value flags");
        }

        $this->info("Done: {$totals['stored']} matches stored, {$totals['flagged']} new value flags, {$totals['skipped_started']} in-play matches left untouched.");

        return self::SUCCESS;
    }
}
