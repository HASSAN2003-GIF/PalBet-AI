<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;
use App\Models\Fixture;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;

class UpdateFixtures extends Command
{
    protected $signature = 'app:update-fixtures';
    protected $description = 'Dynamically fetches all active global sports, runs the Python risk engine, and stores fixtures.';

    public function handle()
    {
        $pythonBinary = base_path('../venv/bin/python3');
        $scriptPath = base_path('../risk_engine.py');
        $apiKey = env('ODDS_API_KEY', '');

        if (empty($apiKey)) {
            $this->error('ODDS_API_KEY is missing from your .env file.');
            return;
        }

        $this->info("1. Asking The Odds API for all active global sports...");

        // Fetch every active sport currently offered by global bookmakers
        $response = Http::get('https://api.the-odds-api.com/v4/sports', [
            'apiKey' => $apiKey
        ]);

        if (!$response->successful()) {
            $this->error("Failed to fetch the active sports list.");
            return;
        }

        $allSports = $response->json();
        
        $this->info("Found " . count($allSports) . " active global sports/leagues. Starting Risk Engine pipeline...");

        foreach ($allSports as $sportObj) {
            $sport = $sportObj['key'];
            $this->info("Scouting: {$sport}");
            
            // 120s timeout allows the engine to process massive global leagues
            $process = new Process([$pythonBinary, $scriptPath, '--json', $apiKey, 'odds', $sport]);
            $process->setTimeout(120); 
            $process->run();

            if ($process->isSuccessful()) {
                $matches = json_decode($process->getOutput(), true);

                if (is_array($matches)) {
                    foreach ($matches as $match) {
                        $commenceTime = Carbon::parse($match['commence_time']);
                        $isSoccer = str_contains(strtolower($sport), 'soccer');

                        Fixture::updateOrCreate(
                            [
                                'home_team' => $match['home_team'],
                                'away_team' => $match['away_team'],
                                'commence_time' => $commenceTime
                            ],
                            [
                                'sport_key' => $sport,
                                'home_logo' => $match['home_logo'] ?? null,
                                'away_logo' => $match['away_logo'] ?? null,
                                'date_str' => $commenceTime->format('Y-m-d'),
                                'bookmaker' => $match['bookmaker'],
                                'odds_home' => $match['odds_home'],
                                'odds_draw' => $match['odds_draw'] ?? 0,
                                'odds_away' => $match['odds_away'],
                                'prob_home' => $match['prob_home'],
                                'prob_draw' => $match['prob_draw'] ?? 0,
                                'prob_away' => $match['prob_away'],
                                'pred_score' => $match['pred_score'],
                                'home_form' => $match['home_form'] ?? '-',
                                'away_form' => $match['away_form'] ?? '-',
                                'market_1_label' => $match['market_1_label'] ?? 'Market',
                                'market_1_val' => $match['market_1_val'] ?? '-',
                                'market_2_label' => $match['market_2_label'] ?? 'Market',
                                'market_2_val' => $match['market_2_val'] ?? '-',
                                'edge' => $match['edge'],
                                'stake' => $match['stake'],
                                'is_value_bet' => $match['is_value_bet'],
                                'rationale' => $match['rationale'],
                                'is_soccer' => $isSoccer,
                            ]
                        );
                    }
                }
            } else {
                $this->error("Engine failed for {$sport}: " . $process->getErrorOutput());
            }
        }

        $this->info("✅ Global database updated successfully.");
    }
}