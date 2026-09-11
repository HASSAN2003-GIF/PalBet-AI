<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Fixture;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Illuminate\Support\Facades\Log;

class PlatformController extends Controller
{
    // ==========================================
    // AI AGENT INTEGRATION (Restored)
    // ==========================================
    public function askAI(Request $request)
    {
        // FIX: Accept the full array context
        $matchContext = $request->input('matchContext');
        $message = $request->input('message');

        if (!$matchContext || !$message) {
            return response()->json(['error' => 'Missing match context or message payload'], 400);
        }

        $pythonBinary = base_path('../venv/bin/python3');
        if (!file_exists($pythonBinary)) {
            $pythonBinary = 'python3'; 
        }
        $scriptPath = base_path('../ai_agent.py');

        try {
            // FIX: Safely pass the JSON encoded data to the Python agent
            $process = new Process([$pythonBinary, $scriptPath, '--chat', json_encode($matchContext), $message]);
            $process->setTimeout(45); // Extended timeout for quality LLM generation
            $process->run();

            if (!$process->isSuccessful()) {
                Log::error('AI Agent Failure: ' . $process->getErrorOutput());
                return response()->json(['error' => 'The AI Analyst is currently offline.'], 503);
            }

            $output = trim($process->getOutput());
            $parsed = json_decode($output, true);
            
            return response()->json([
                'response' => $parsed['response'] ?? $output
            ]);
            
        } catch (\Exception $e) {
            Log::error('AI Agent Exception: ' . $e->getMessage());
            return response()->json(['error' => 'Internal AI processing error.'], 500);
        }
    }

    // ==========================================
    // DAILY SCHEDULE & MERGE ENGINE
    // ==========================================
    public function getDailySchedule(Request $request)
    {
        $date = $request->query('date', now()->format('Y-m-d'));

        $start = \Carbon\Carbon::parse($date)->subDays(1)->format('Y-m-d');
        $end = \Carbon\Carbon::parse($date)->addDays(1)->format('Y-m-d');
        $dbFixtures = Fixture::whereBetween('date_str', [$start, $end])->get();

        $apiFixtures = Cache::remember("api_fixtures_{$date}", now()->addMinutes(15), function () use ($date) {
            $response = Http::withHeaders(['x-apisports-key' => env('FOOTBALL_API_KEY')])
                ->timeout(60)->get('https://v3.football.api-sports.io/fixtures', ['date' => $date]);
            
            $data = $response->json();
            return (is_array($data) && isset($data['response']) && is_array($data['response'])) ? $data['response'] : [];
        });

        $normalize = function ($str) {
            $str = Str::ascii((string)$str);
            $str = strtolower(trim($str));
            $stopWords = ['1. ', ' fc', 'fc ', ' cf', 'cf ', 'real ', ' club', ' de ', ' sporting', ' united', ' city', ' athletic', ' balompie', '04', '05'];
            $str = str_replace($stopWords, ' ', $str);
            return preg_replace('/[^a-z0-9]/', '', $str);
        };

        // NEW: Dynamic SVG Logo Generator for Non-Football Sports
        $generateAvatar = function ($teamName) {
            $cleanName = trim(preg_replace('/[^a-zA-Z0-9\s]/', '', (string)$teamName));
            if (empty($cleanName)) $cleanName = 'TBA';
            
            // Hash the name to generate a consistent, unique hex color for this specific team
            $hash = md5($cleanName);
            $bg = substr($hash, 0, 6); 
            $urlName = urlencode($cleanName);
            
            // Return a professional SVG badge
            return "https://ui-avatars.com/api/?name={$urlName}&background={$bg}&color=fff&bold=true&format=svg";
        };

        $mergedMap = [];
        $unmatchedApi = [];
        
        foreach ($apiFixtures as $item) {
            if (!is_array($item)) continue;
            
            $h = $normalize(data_get($item, 'teams.home.name', ''));
            $a = $normalize(data_get($item, 'teams.away.name', ''));
            $hash = $h . '_' . $a;

            $country = data_get($item, 'league.country', 'World');
            $flag = data_get($item, 'league.flag');
            if ($country === 'World') $country = 'International Clubs';
            if ($country === 'Europe' || $country === 'International Clubs') $flag = 'https://media.api-sports.io/flags/eu.svg';

            $matchData = [
                'source' => 'api',
                'sport' => 'Football',
                'category' => $country,
                'flag' => $flag,
                'league' => data_get($item, 'league.name', 'Unknown League'),
                'match' => [
                    'id' => 'api_' . data_get($item, 'fixture.id', rand(1000,9999)),
                    'time' => data_get($item, 'fixture.date') ? substr(data_get($item, 'fixture.date'), 11, 5) : 'TBA',
                    'status' => data_get($item, 'fixture.status.short', 'NS'),
                    'home' => data_get($item, 'teams.home.name', 'Unknown'),
                    'away' => data_get($item, 'teams.away.name', 'Unknown'),
                    'home_logo' => data_get($item, 'teams.home.logo'),
                    'away_logo' => data_get($item, 'teams.away.logo'),
                    'home_score' => data_get($item, 'goals.home'),
                    'away_score' => data_get($item, 'goals.away'),
                    'odds_home' => '-', 'odds_draw' => '-', 'odds_away' => '-',
                    'prob_home' => 0, 'prob_draw' => 0, 'prob_away' => 0,
                    'pred_score' => '-', 'market_1_label' => '-', 'market_1_val' => '-',
                    'bookmaker' => '-', 'is_value_bet' => false, 'stake' => '0.00', 'is_soccer' => true,
                    'has_odds' => false
                ]
            ];
            
            $mergedMap[$hash] = $matchData;
            $unmatchedApi[$hash] = $hash; 
        }

        foreach ($dbFixtures as $f) {
            $key = strtolower($f->sport_key ?? 'other');
            $isSoccer = $f->is_soccer || str_contains($key, 'soccer');
            
            $h = $normalize($f->home_team);
            $a = $normalize($f->away_team);
            $hash = $h . '_' . $a;

            $matchFound = false;
            $matchedKey = null;

            if ($isSoccer && isset($mergedMap[$hash])) {
                $matchFound = true;
                $matchedKey = $hash;
                unset($unmatchedApi[$hash]);
            } 
            elseif ($isSoccer) {
                $bestScore = 0;
                $bestKey = null;
                foreach ($unmatchedApi as $apiKey) {
                    similar_text($hash, $apiKey, $sim);
                    if ($sim > 80 && $sim > $bestScore) { 
                        $bestScore = $sim;
                        $bestKey = $apiKey;
                    }
                }
                if ($bestKey) {
                    $matchFound = true;
                    $matchedKey = $bestKey;
                    unset($unmatchedApi[$bestKey]);
                }
            }

            $safeTime = 'TBA';
            try { 
                if (!empty($f->commence_time)) {
                    $safeTime = \Carbon\Carbon::parse($f->commence_time)->format('H:i'); 
                }
            } catch (\Exception $e) {}

            if ($matchFound && $matchedKey) {
                $m = &$mergedMap[$matchedKey]['match'];
                
                $m['id'] = $f->id;
                $m['odds_home'] = number_format((float)$f->odds_home, 2);
                $m['odds_draw'] = (float)$f->odds_draw > 0 ? number_format((float)$f->odds_draw, 2) : '-';
                $m['odds_away'] = number_format((float)$f->odds_away, 2);
                $m['prob_home'] = round((float)$f->prob_home * 100);
                $m['prob_draw'] = round((float)$f->prob_draw * 100);
                $m['prob_away'] = round((float)$f->prob_away * 100);
                $m['pred_score'] = $f->pred_score ?? '-';
                $m['market_1_label'] = $f->market_1_label ?? 'Market';
                $m['market_1_val'] = $f->market_1_val ?? '-';
                $m['bookmaker'] = $f->bookmaker ?? 'Global';
                $m['is_value_bet'] = (bool)$f->is_value_bet;
                $m['stake'] = number_format((float)$f->stake, 2);
                $m['has_odds'] = true;
                
                // If matched but official logo is missing, generate one
                if (empty($m['home_logo'])) $m['home_logo'] = $generateAvatar($m['home']);
                if (empty($m['away_logo'])) $m['away_logo'] = $generateAvatar($m['away']);
                
                unset($m);
            } else {
                if ($f->date_str !== $date) { continue; }

                $keyParts = explode('_', $key);
                $rawSport = $keyParts[0] ?? 'other';
                
                $sportGroup = ucwords(str_replace(['americanfootball', 'icehockey', 'rugbyleague', 'rugbyunion', 'aussierules'], ['American Football', 'Ice Hockey', 'Rugby', 'Rugby', 'Aussie Rules'], $rawSport));
                if (strtolower($sportGroup) === 'soccer') $sportGroup = 'Football';
                
                $category = 'Global';
                if (isset($keyParts[1])) {
                    $category = ucwords(str_replace(['nba', 'nfl', 'mlb', 'nhl', 'mls'], ['USA (NBA)', 'USA (NFL)', 'USA (MLB)', 'USA (NHL)', 'USA (MLS)'], $keyParts[1]));
                }
                
                $cleanLeague = ucwords(str_replace('_', ' ', str_replace($rawSport . '_', '', $key)));

                $mergedMap['db_'.$f->id] = [
                    'source' => 'db',
                    'sport' => $sportGroup,
                    'category' => $category,
                    'flag' => null,
                    'league' => strtoupper($cleanLeague) === $cleanLeague ? $cleanLeague : ucwords($cleanLeague),
                    'match' => [
                        'id' => $f->id,
                        'time' => $safeTime,
                        'status' => 'NS',
                        'home' => $f->home_team ?? 'Unknown', 'away' => $f->away_team ?? 'Unknown',
                        // INJECT GENERATIVE LOGOS HERE
                        'home_logo' => $f->home_logo ?? $generateAvatar($f->home_team ?? 'Unknown'),
                        'away_logo' => $f->away_logo ?? $generateAvatar($f->away_team ?? 'Unknown'),
                        'home_score' => null, 'away_score' => null,
                        'odds_home' => number_format((float)$f->odds_home, 2),
                        'odds_draw' => (float)$f->odds_draw > 0 ? number_format((float)$f->odds_draw, 2) : '-',
                        'odds_away' => number_format((float)$f->odds_away, 2),
                        'prob_home' => round((float)$f->prob_home * 100),
                        'prob_draw' => round((float)$f->prob_draw * 100),
                        'prob_away' => round((float)$f->prob_away * 100),
                        'pred_score' => $f->pred_score ?? '-',
                        'market_1_label' => $f->market_1_label ?? 'Market', 'market_1_val' => $f->market_1_val ?? '-',
                        'bookmaker' => $f->bookmaker ?? 'Global', 'is_value_bet' => (bool)$f->is_value_bet, 'stake' => number_format((float)$f->stake, 2),
                        'is_soccer' => $isSoccer,
                        'has_odds' => true
                    ]
                ];
            }
        }

        $platformData = [];
        foreach ($mergedMap as $entry) {
            $sport = (string)$entry['sport']; $cat = (string)$entry['category']; $league = (string)$entry['league'];
            
            if (!isset($platformData[$sport])) $platformData[$sport] = ['sport' => $sport, 'categories' => []];
            if (!isset($platformData[$sport]['categories'][$cat])) $platformData[$sport]['categories'][$cat] = ['name' => $cat, 'flag' => $entry['flag'], 'total_matches' => 0, 'leagues' => []];
            
            $lid = md5($sport.$cat.$league);
            if (!isset($platformData[$sport]['categories'][$cat]['leagues'][$lid])) {
                $platformData[$sport]['categories'][$cat]['leagues'][$lid] = ['id' => $lid, 'name' => $league, 'matches' => []];
            }
            
            $platformData[$sport]['categories'][$cat]['leagues'][$lid]['matches'][] = $entry['match'];
            $platformData[$sport]['categories'][$cat]['total_matches']++;
        }

        $finalOutput = array_values($platformData);
        foreach ($finalOutput as &$s) {
            $cats = array_values($s['categories']);
            foreach ($cats as &$c) { $c['leagues'] = array_values($c['leagues']); }
            usort($cats, fn($a, $b) => strcasecmp((string)($a['name'] ?? ''), (string)($b['name'] ?? '')));
            $s['categories'] = $cats;
        }
        usort($finalOutput, fn($a, $b) => strcasecmp((string)($a['sport'] ?? ''), (string)($b['sport'] ?? '')));

        return response()->json($finalOutput);
    }
}