<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Bet;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class SettlePredictions extends Command
{
    protected $signature = 'ai:settle-predictions';
    protected $description = 'Resolves pending AI predictions and updates user virtual token portfolios';

    public function handle()
    {
        $this->info("Scanning for pending AI predictions...");
        
        $pendingPredictions = Bet::where('status', 'pending')->get();

        if ($pendingPredictions->isEmpty()) {
            $this->info("No pending predictions to resolve.");
            return;
        }

        foreach ($pendingPredictions as $prediction) {
            // SIMULATION LOGIC: We calculate a realistic win chance based on the total multiplier.
            // In a production environment, this would query a Live Score API instead.
            $winProbability = (1 / $prediction->total_odds) * 100;
            $randomRoll = rand(1, 100); 

            $user = User::find($prediction->user_id);

            if ($randomRoll <= $winProbability) {
                // Prediction was Correct!
                $prediction->status = 'won';
                if ($user) {
                    $user->balance += $prediction->potential_payout; // Add tokens to portfolio
                    $user->save();
                }
                $this->info("Prediction ID {$prediction->id} WON. Tokens added.");
            } else {
                // Prediction was Incorrect
                $prediction->status = 'lost';
                $this->info("Prediction ID {$prediction->id} LOST.");
            }

            $prediction->save();

            // Log it in the Admin Activity Stream
            if ($user) {
                DB::table('activity_logs')->insert([
                    'phone' => substr(str_replace('@palbet.local', '', $user->email), 0, 8) . '***',
                    'action' => $prediction->status === 'won' ? 'Prediction Won' : 'Prediction Lost',
                    'color' => $prediction->status === 'won' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        $this->info("All pending predictions have been resolved.");
    }
}