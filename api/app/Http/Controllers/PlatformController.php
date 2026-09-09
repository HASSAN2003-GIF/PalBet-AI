<?php

namespace App\Http\Controllers;

use App\Models\Bet;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

class PlatformController extends Controller
{
    /**
     * Record a platform visit for the current day.
     *
     * The existing daily_metrics table is intentionally used so the
     * frontend contract and database architecture remain unchanged.
     */
    public function trackVisit(): JsonResponse
    {
        $today = today()->toDateString();

        DB::transaction(function () use ($today): void {
            $metric = DB::table('daily_metrics')
                ->where('date', $today)
                ->lockForUpdate()
                ->first();

            if ($metric) {
                DB::table('daily_metrics')
                    ->where('date', $today)
                    ->increment('visitors');
                return;
            }

            DB::table('daily_metrics')->insert([
                'date' => $today,
                'visitors' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json([
            'status' => 'tracked',
        ]);
    }

    /**
     * Authenticate an existing player or create a new player account.
     *
     * The current phone-as-email identity convention is preserved because
     * other parts of the application already depend on it.
     */
    public function authenticate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
            'password' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', 'string', 'in:player,admin'],
        ]);

        $phone = trim($validated['phone']);
        $role = $validated['role'] ?? 'player';
        $email = $phone . '@palbet.local';

        $user = User::where('email', $email)->first();

        if (!$user) {
            $user = User::create([
                'name' => 'Player',
                'email' => $email,
                'password' => bcrypt($validated['password'] ?? ''),
            ]);

            $action = 'Created account';
            $color = 'bg-sky-100 text-sky-600';
        } else {
            $action = 'Logged in';
            $color = 'bg-emerald-100 text-emerald-600';
        }

        $this->logActivity($phone, $action, $color);

        return response()->json([
            'id' => $user->id,
            'role' => $role,
            'phone' => $phone,
            'balanceUsd' => $role === 'admin' ? 0 : (float) $user->balance,
        ]);
    }

    /**
     * Place a bet and deduct the stake from the user's balance.
     *
     * The operation is transactional so the balance update and bet creation
     * succeed or fail together.
     */
    public function placeBet(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
            'stake' => ['required', 'numeric', 'gt:0'],
            'totalOdds' => ['required', 'numeric', 'gte:1'],
            'potentialPayout' => ['required', 'numeric', 'gte:0'],
            'slip' => ['required'],
        ]);

        $phone = trim($validated['phone']);
        $stake = (float) $validated['stake'];

        $user = User::where('email', $phone . '@palbet.local')->first();

        if (!$user) {
            return response()->json([
                'error' => 'User session is invalid. Please sign in again.',
            ], 401);
        }

        if ((float) $user->balance < $stake) {
            return response()->json([
                'error' => 'Insufficient funds. Please lower your stake.',
            ], 400);
        }

        $newBalance = DB::transaction(function () use ($user, $stake, $validated, $phone): float {
            $lockedUser = User::whereKey($user->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ((float) $lockedUser->balance < $stake) {
                abort(response()->json([
                    'error' => 'Insufficient funds. Please lower your stake.',
                ], 400));
            }

            $lockedUser->balance = (float) $lockedUser->balance - $stake;
            $lockedUser->save();

            Bet::create([
                'user_id' => $lockedUser->id,
                'stake' => $stake,
                'total_odds' => (float) $validated['totalOdds'],
                'potential_payout' => (float) $validated['potentialPayout'],
                'matches' => $validated['slip'],
            ]);

            $this->logActivity(
                $phone,
                'Placed bet',
                'bg-amber-100 text-amber-600'
            );

            return (float) $lockedUser->balance;
        });

        return response()->json([
            'status' => 'success',
            'newBalance' => $newBalance,
        ]);
    }

    /**
     * Return the authenticated user's betting history.
     *
     * The existing `user_id` query parameter is preserved for compatibility
     * with the current frontend.
     */
    public function myBets(Request $request): JsonResponse
    {
        $userId = $request->query('user_id');

        if (!$userId) {
            return response()->json([
                'data' => [],
            ]);
        }

        $bets = Bet::where('user_id', $userId)
            ->latest()
            ->get()
            ->map(function (Bet $bet): array {
                return [
                    'id' => $bet->id,
                    'stake' => (float) $bet->stake,
                    'total_odds' => (float) $bet->total_odds,
                    'potential_payout' => (float) $bet->potential_payout,
                    'matches' => $bet->matches,
                    'date' => Carbon::parse($bet->created_at)->format('M d, Y - h:i A'),
                ];
            });

        return response()->json([
            'data' => $bets,
        ]);
    }

    /**
     * Provide the existing admin dashboard statistics.
     */
    public function adminStats(): JsonResponse
    {
        $today = today();

        $realUserCount = User::count();

        $todayVisits = (int) (
            DB::table('daily_metrics')
                ->where('date', $today->toDateString())
                ->value('visitors') ?? 0
        );

        $loggedInToday = DB::table('activity_logs')
            ->where('action', 'Logged in')
            ->whereDate('created_at', $today)
            ->distinct()
            ->count('phone');

        $activeNow = DB::table('activity_logs')
            ->where('created_at', '>=', now()->subMinutes(15))
            ->distinct()
            ->count('phone');

        $chartData = collect(range(6, 0))
            ->map(function (int $daysAgo): array {
                $date = today()->subDays($daysAgo);

                $visits = (int) (
                    DB::table('daily_metrics')
                        ->where('date', $date->toDateString())
                        ->value('visitors') ?? 0
                );

                return [
                    'day' => $date->format('D'),
                    'visits' => $visits,
                    'height' => $this->getChartHeight($visits),
                ];
            })
            ->values()
            ->all();

        $activities = DB::table('activity_logs')
            ->latest('id')
            ->limit(5)
            ->get()
            ->map(function ($log): array {
                return [
                    'phone' => $log->phone,
                    'action' => $log->action,
                    'time' => Carbon::parse($log->created_at)
                        ->diffForHumans(null, true) . ' ago',
                    'color' => $log->color,
                ];
            });

        return response()->json([
            'totalAccounts' => $realUserCount,
            'loggedIn' => $loggedInToday,
            // Preserve the frontend's expectation that the dashboard never
            // renders zero for the current active-user indicator.
            'activeNow' => max(1, $activeNow),
            'todayVisits' => $todayVisits,
            'chartData' => $chartData,
            'activityFeed' => $activities,
        ]);
    }

    /**
     * Send a prediction/chat request to the existing Python AI engine.
     *
     * The Python integration contract remains unchanged.
     */
    public function askAI(Request $request)
    {
        $matchContext = $request->input('match');
        $userMessage = $request->input('message');
        $history = $request->input('history', []);
        
        $apiKey = env('GEMINI_API_KEY', 'null');
        // 🟢 Grab the new Football API key from the .env
        $footballKey = env('FOOTBALL_API_KEY', 'null'); 

        $pythonBinary = base_path('../venv/bin/python3');
        $scriptPath = base_path('../ai_agent.py');
        $process = new \Symfony\Component\Process\Process([$pythonBinary, $scriptPath]);
        
        // 🟢 Pass BOTH keys into the payload
        $process->setInput(json_encode([
            'api_key' => $apiKey,
            'football_key' => $footballKey, 
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
    
    public function getDailySchedule(Request $request)
    {
        // 1. Get the requested date (defaults to today)
        $date = $request->query('date', now()->format('Y-m-d'));

        // 2. Fetch all matches happening globally on this date
        $response = \Illuminate\Support\Facades\Http::withHeaders([
            'x-apisports-key' => env('FOOTBALL_API_KEY')
        ])->get('https://v3.football.api-sports.io/fixtures', [
            'date' => $date
        ]);

        $fixtures = $response->json()['response'] ?? [];
        $grouped = [];

        // 3. Sort the matches into Country > League folders
        foreach ($fixtures as $item) {
            $country = $item['league']['country'] ?? 'World';
            $leagueId = $item['league']['id'];
            $leagueName = $item['league']['name'];

            // Create the Country folder if it doesn't exist
            if (!isset($grouped[$country])) {
                $grouped[$country] = [
                    'country' => $country,
                    'flag' => $item['league']['flag'],
                    'total_matches' => 0,
                    'leagues' => []
                ];
            }

            // Create the League folder inside the Country
            if (!isset($grouped[$country]['leagues'][$leagueId])) {
                $grouped[$country]['leagues'][$leagueId] = [
                    'id' => $leagueId,
                    'name' => $leagueName,
                    'logo' => $item['league']['logo'],
                    'matches' => []
                ];
            }

            // Add the Match to the League folder
            $grouped[$country]['leagues'][$leagueId]['matches'][] = [
                'id' => $item['fixture']['id'],
                'time' => substr($item['fixture']['date'], 11, 5), // Extracts HH:MM
                'status' => $item['fixture']['status']['short'],
                'home' => $item['teams']['home']['name'],
                'away' => $item['teams']['away']['name'],
                'home_logo' => $item['teams']['home']['logo'],
                'away_logo' => $item['teams']['away']['logo'],
                'home_score' => $item['goals']['home'],
                'away_score' => $item['goals']['away']
            ];

            $grouped[$country]['total_matches']++;
        }

        // 4. Return the folders sorted by which country has the most matches
        $result = array_values($grouped);
        usort($result, function($a, $b) {
            return $b['total_matches'] <=> $a['total_matches'];
        });

        return response()->json($result);
    }
}
