<?php

namespace App\Http\Controllers;

use App\Models\Bet;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Illuminate\Support\Facades\Http;

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
        $date = $request->query('date', now()->format('Y-m-d'));

        // 1. Fetch risk engine database records (3-day buffer to prevent timezone cutoff)
        $start = \Carbon\Carbon::parse($date)->subDays(1)->format('Y-m-d');
        $end = \Carbon\Carbon::parse($date)->addDays(1)->format('Y-m-d');
        $dbFixtures = \App\Models\Fixture::whereBetween('date_str', [$start, $end])->get();

        // 2. Fetch live structural feed from API-Sports for logos, live scores, and country flags
        $apiFixtures = \Illuminate\Support\Facades\Cache::remember("api_fixtures_{$date}", now()->addMinutes(15), function () use ($date) {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'x-apisports-key' => env('FOOTBALL_API_KEY')
            ])->timeout(120)->get('https://v3.football.api-sports.io/fixtures', ['date' => $date]);

            return $response->successful() ? ($response->json()['response'] ?? []) : [];
        });

        $normalize = function ($str) {
            $str = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $str) ?: $str;
            return preg_replace('/[^a-z0-9]/', '', strtolower(trim($str)));
        };

        $grouped = [];

        foreach ($dbFixtures as $f) {
            $key = strtolower($f->sport_key);
            $isSoccer = $f->is_soccer || str_contains($key, 'soccer');

            $homeName = $f->home_team;
            $awayName = $f->away_team;
            $homeLogo = $f->home_logo;
            $awayLogo = $f->away_logo;
            $status = 'NS';
            $homeScore = null;
            $awayScore = null;
            $matchTime = $f->commence_time ? $f->commence_time->format('H:i') : '19:00';

            // Clean league name
            $cleanLeague = ucwords(str_replace([
                'soccer_', 'basketball_', 'tennis_', 'americanfootball_', 'baseball_',
                'icehockey_', 'mma_', 'rugbyleague_', 'rugbyunion_', 'aussierules_', '_'
            ], ['', '', '', '', '', '', '', '', '', '', ' '], $key));

            if ($isSoccer) {
                $category = 'International Clubs';
                $flag = 'https://media.api-sports.io/flags/eu.svg';

                $normH = $normalize($homeName);
                $normA = $normalize($awayName);
                $bestScore = 0;
                $matchedApi = null;

                // Fuzzy match against API-Sports to retrieve official crests and flags
                foreach ($apiFixtures as $apiItem) {
                    $apiH = $normalize($apiItem['teams']['home']['name']);
                    $apiA = $normalize($apiItem['teams']['away']['name']);

                    similar_text($normH, $apiH, $simH);
                    similar_text($normA, $apiA, $simA);
                    $score = ($simH + $simA) / 2;

                    if ($score > 65 && $score > $bestScore) {
                        $bestScore = $score;
                        $matchedApi = $apiItem;
                    }
                }

                if ($matchedApi) {
                    $homeLogo = $matchedApi['teams']['home']['logo'];
                    $awayLogo = $matchedApi['teams']['away']['logo'];
                    $status = $matchedApi['fixture']['status']['short'];
                    $homeScore = $matchedApi['goals']['home'];
                    $awayScore = $matchedApi['goals']['away'];
                    $matchTime = substr($matchedApi['fixture']['date'], 11, 5);
                    $cleanLeague = $matchedApi['league']['name'];

                    $c = $matchedApi['league']['country'] ?? 'World';
                    $category = ($c === 'World') ? 'International Clubs' : $c;
                    $flag = $matchedApi['league']['flag'] ?? null;
                    if ($category === 'Europe' || $category === 'International Clubs') {
                        $flag = 'https://media.api-sports.io/flags/eu.svg';
                    }
                } else {
                    if (str_contains($key, 'epl') || str_contains($key, 'england')) {
                        $category = 'England';
                        $flag = 'https://media.api-sports.io/flags/gb.svg';
                    } elseif (str_contains($key, 'spain') || str_contains($key, 'la_liga')) {
                        $category = 'Spain';
                        $flag = 'https://media.api-sports.io/flags/es.svg';
                    } elseif (str_contains($key, 'germany') || str_contains($key, 'bundesliga')) {
                        $category = 'Germany';
                        $flag = 'https://media.api-sports.io/flags/de.svg';
                    } elseif (str_contains($key, 'italy') || str_contains($key, 'serie_a')) {
                        $category = 'Italy';
                        $flag = 'https://media.api-sports.io/flags/it.svg';
                    } elseif (str_contains($key, 'france') || str_contains($key, 'ligue')) {
                        $category = 'France';
                        $flag = 'https://media.api-sports.io/flags/fr.svg';
                    }
                }
            } else {
                // Non-soccer SofaScore categories
                if (str_contains($key, 'tennis')) {
                    $category = 'Tennis';
                    $flag = null;
                    if (str_contains($key, 'atp')) $cleanLeague = 'ATP';
                    elseif (str_contains($key, 'wta')) $cleanLeague = 'WTA';
                } elseif (str_contains($key, 'basketball')) {
                    $category = 'Basketball';
                    $flag = null;
                    if (str_contains($key, 'nba')) $cleanLeague = 'NBA';
                } elseif (str_contains($key, 'americanfootball')) {
                    $category = 'American Football';
                    $flag = null;
                    if (str_contains($key, 'nfl')) $cleanLeague = 'NFL';
                } elseif (str_contains($key, 'baseball')) {
                    $category = 'Baseball';
                    $flag = null;
                    if (str_contains($key, 'mlb')) $cleanLeague = 'MLB';
                } elseif (str_contains($key, 'icehockey')) {
                    $category = 'Ice Hockey';
                    $flag = null;
                    if (str_contains($key, 'nhl')) $cleanLeague = 'NHL';
                } elseif (str_contains($key, 'mma') || str_contains($key, 'ufc')) {
                    $category = 'MMA';
                    $cleanLeague = 'UFC / MMA';
                    $flag = null;
                } else {
                    $category = ucfirst(explode('_', $key)[0] ?? 'Other Sports');
                    $flag = null;
                }
            }

            if (!isset($grouped[$category])) {
                $grouped[$category] = [
                    'country' => $category,
                    'flag' => $flag,
                    'total_matches' => 0,
                    'leagues' => []
                ];
            }

            $leagueId = md5($category . $cleanLeague);

            if (!isset($grouped[$category]['leagues'][$leagueId])) {
                $grouped[$category]['leagues'][$leagueId] = [
                    'id' => $leagueId,
                    'name' => $cleanLeague,
                    'logo' => null,
                    'matches' => []
                ];
            }

            $grouped[$category]['leagues'][$leagueId]['matches'][] = [
                'id' => $f->id,
                'time' => $matchTime,
                'status' => $status,
                'home' => $homeName,
                'away' => $awayName,
                'home_logo' => $homeLogo,
                'away_logo' => $awayLogo,
                'home_score' => $homeScore,
                'away_score' => $awayScore,
                'odds_home' => number_format($f->odds_home, 2),
                'odds_draw' => ($f->odds_draw && $f->odds_draw > 0) ? number_format($f->odds_draw, 2) : null,
                'odds_away' => number_format($f->odds_away, 2),
                'prob_home' => round($f->prob_home * 100),
                'prob_draw' => round($f->prob_draw * 100),
                'prob_away' => round($f->prob_away * 100),
                'pred_score' => $f->pred_score ?? '1 - 0',
                'market_1_label' => $f->market_1_label ?? 'Market',
                'market_1_val' => $f->market_1_val ?? '-',
                'bookmaker' => $f->bookmaker ?? 'Global',
                'is_value_bet' => (bool)$f->is_value_bet,
                'stake' => number_format($f->stake, 2),
                'is_soccer' => $isSoccer
            ];

            $grouped[$category]['total_matches']++;
        }

        $result = array_values($grouped);
        usort($result, fn($a, $b) => strcasecmp($a['country'], $b['country']));

        return response()->json($result);
    }
}