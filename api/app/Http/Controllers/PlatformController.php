<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\User;
use App\Models\Bet;
use Carbon\Carbon;

class PlatformController extends Controller
{
    // 🟢 FIXED: Bulletproof tracking logic that handles completely empty tables
    public function trackVisit()
    {
        $today = today()->toDateString();
        
        $exists = DB::table('daily_metrics')->where('date', $today)->exists();

        if ($exists) {
            DB::table('daily_metrics')->where('date', $today)->increment('visitors');
        } else {
            DB::table('daily_metrics')->insert([
                'date' => $today,
                'visitors' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json(['status' => 'tracked']);
    }

    public function authenticate(Request $request)
    {
        $phone = $request->input('phone');
        $role = $request->input('role', 'player');
        
        $action = 'Logged in';
        $color = 'bg-emerald-100 text-emerald-600';

        $user = User::where('email', $phone . '@palbet.local')->first();
        if (!$user) {
            $user = User::create([
                'name' => 'Player',
                'email' => $phone . '@palbet.local',
                'password' => bcrypt($request->input('password')),
            ]);
            $action = 'Created account';
            $color = 'bg-sky-100 text-sky-600';
        }

        DB::table('activity_logs')->insert([
            'phone' => substr($phone, 0, 8) . '***',
            'action' => $action,
            'color' => $color,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'id' => $user->id,
            'role' => $role,
            'phone' => $phone,
            'balanceUsd' => $role === 'admin' ? 0 : (float) $user->balance
        ]);
    }

    public function placeBet(Request $request)
    {
        $phone = $request->input('phone');
        $stake = (float) $request->input('stake');
        
        $user = User::where('email', $phone . '@palbet.local')->first();
        if (!$user) return response()->json(['error' => 'User session invalid.'], 401);
        if ($user->balance < $stake) return response()->json(['error' => 'Insufficient funds. Please lower your stake.'], 400);

        $user->balance -= $stake;
        $user->save();

        Bet::create([
            'user_id' => $user->id,
            'stake' => $stake,
            'total_odds' => (float) $request->input('totalOdds'),
            'potential_payout' => (float) $request->input('potentialPayout'),
            'matches' => $request->input('slip')
        ]);

        DB::table('activity_logs')->insert([
            'phone' => substr($phone, 0, 8) . '***',
            'action' => 'Placed bet',
            'color' => 'bg-amber-100 text-amber-600',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'status' => 'success',
            'newBalance' => (float) $user->balance
        ]);
    }

    public function myBets(Request $request)
    {
        $userId = $request->query('user_id');
        if (!$userId) return response()->json(['data' => []]);

        $bets = Bet::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function($bet) {
                return [
                    'id' => $bet->id,
                    'stake' => (float) $bet->stake,
                    'total_odds' => (float) $bet->total_odds,
                    'potential_payout' => (float) $bet->potential_payout,
                    'matches' => $bet->matches,
                    'date' => Carbon::parse($bet->created_at)->format('M d, Y - h:i A')
                ];
            });

        return response()->json(['data' => $bets]);
    }

    public function adminStats()
    {
        $realUserCount = User::count();
        $todayVisits = DB::table('daily_metrics')->where('date', today()->toDateString())->value('visitors') ?? 0;
        
        $loggedInToday = DB::table('activity_logs')->where('action', 'Logged in')->whereDate('created_at', today())->distinct('phone')->count('phone');
        $activeNow = DB::table('activity_logs')->where('created_at', '>=', now()->subMinutes(15))->distinct('phone')->count('phone');

        $chartData = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = today()->subDays($i);
            $visits = DB::table('daily_metrics')->where('date', $date->toDateString())->value('visitors') ?? 0;
            $height = $visits > 500 ? 'h-48' : ($visits > 100 ? 'h-32' : ($visits > 10 ? 'h-16' : 'h-2'));
            $chartData[] = ['day' => $date->format('D'), 'visits' => $visits, 'height' => $height];
        }

        $activities = DB::table('activity_logs')->orderBy('id', 'desc')->limit(5)->get()->map(function ($log) {
            return ['phone' => $log->phone, 'action' => $log->action, 'time' => Carbon::parse($log->created_at)->diffForHumans(null, true) . ' ago', 'color' => $log->color];
        });

        return response()->json([
            'totalAccounts' => $realUserCount, 
            'loggedIn' => $loggedInToday, 
            'activeNow' => max(1, $activeNow),
            'todayVisits' => $todayVisits,
            'chartData' => $chartData,
            'activityFeed' => $activities
        ]);
    }

    public function askAI(Request $request)
    {
        $matchContext = $request->input('match');
        $userMessage = $request->input('message');
        $history = $request->input('history', []);
        
        $apiKey = env('GEMINI_API_KEY', 'null');

        $pythonBinary = base_path('../venv/bin/python3');
        $scriptPath = base_path('../ai_agent.py');

        // Pass structured payload via STDIN to handle complex strings safely
        $process = new \Symfony\Component\Process\Process([$pythonBinary, $scriptPath]);
        $process->setInput(json_encode([
            'api_key' => $apiKey,
            'match' => $matchContext,
            'history' => $history,
            'message' => $userMessage
        ]));
        $process->setTimeout(60);
        $process->run();

        if ($process->isSuccessful()) {
            $output = json_decode($process->getOutput(), true);
            return response()->json(['response' => $output['response'] ?? 'I could not synthesize an answer.']);
        }

        return response()->json(['response' => 'AI engine communication error.'], 500);
    }
}