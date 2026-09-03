<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;
use App\Models\Fixture;
use Carbon\Carbon;

class UpdateFixtures extends Command
{
    protected $signature = 'app:update-fixtures';
    protected $description = 'Runs Python risk engine and stores global fixtures in the database';

    public function handle()
    {
        $sports = ['soccer_epl', 'basketball_nba', 'tennis_atp'];
        $pythonBinary = base_path('../venv/bin/python3');
        $scriptPath = base_path('../risk_engine.py');
        $apiKey = env('ODDS_API_KEY', '');

        foreach ($sports as $sport) {
            $this->info("Fetching data for: {$sport}");
            $process = new Process([$pythonBinary, $scriptPath, '--json', $apiKey, 'odds', $sport]);
            $process->run();

            if ($process->isSuccessful()) {
                $matches = json_decode($process->getOutput(), true);
                
                if (is_array($matches)) {
                    foreach ($matches as $match) {
                        $commenceTime = Carbon::parse($match['commence_time']);

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
                                'odds_draw' => $match['odds_draw'] ?? null,
                                'odds_away' => $match['odds_away'],
                                'prob_home' => $match['prob_home'],
                                'prob_draw' => $match['prob_draw'] ?? null,
                                'prob_away' => $match['prob_away'],
                                'pred_score' => $match['pred_score'],
                                'home_form' => $match['home_form'] ?? 'W,D,L,W,D',
                            'away_form' => $match['away_form'] ?? 'W,D,L,W,D',
                                'market_1_label' => $match['market_1_label'],
                                'market_1_val' => $match['market_1_val'],
                                'market_2_label' => $match['market_2_label'],
                                'market_2_val' => $match['market_2_val'],
                                'edge' => $match['edge'],
                                'stake' => $match['stake'],
                                'is_value_bet' => $match['is_value_bet'],
                                'rationale' => $match['rationale'],
                                'is_soccer' => $match['is_soccer'] ?? false,
                            ]
                        );
                    }
                }
            } else {
                $this->error("Process failed for {$sport}: " . $process->getErrorOutput());
            }
        }
        $this->info("Database updated successfully.");
    }
}