<?php

namespace App\Http\Controllers;

use App\Models\Fixture;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiskEngineController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $action = $request->query('action', 'odds');

        // 1. Sidebar Directory (Sofascore Categorization)
        if ($action === 'menu') {
            // Count how many fixtures exist in the database for each sport
            $fixtureCounts = Fixture::selectRaw('sport_key, count(*) as total')
                ->where('commence_time', '>=', now()->startOfDay())
                ->groupBy('sport_key')
                ->pluck('total', 'sport_key');

            $menu = [
                [
                    'category' => 'England',
                    'icon' => '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
                    'leagues' => [
                        ['key' => 'soccer_epl', 'title' => 'Premier League (EPL)', 'count' => $fixtureCounts['soccer_epl'] ?? 0],
                        ['key' => 'soccer_england_championship', 'title' => 'Championship', 'count' => $fixtureCounts['soccer_england_championship'] ?? 0],
                    ]
                ],
                [
                    'category' => 'Spain',
                    'icon' => '🇪🇸',
                    'leagues' => [
                        ['key' => 'soccer_spain_la_liga', 'title' => 'La Liga', 'count' => $fixtureCounts['soccer_spain_la_liga'] ?? 0],
                        ['key' => 'soccer_spain_segunda_division', 'title' => 'Segunda División', 'count' => $fixtureCounts['soccer_spain_segunda_division'] ?? 0],
                    ]
                ],
                [
                    'category' => 'Italy',
                    'icon' => '🇮🇹',
                    'leagues' => [
                        ['key' => 'soccer_italy_serie_a', 'title' => 'Serie A', 'count' => $fixtureCounts['soccer_italy_serie_a'] ?? 0],
                        ['key' => 'soccer_italy_serie_b', 'title' => 'Serie B', 'count' => $fixtureCounts['soccer_italy_serie_b'] ?? 0],
                    ]
                ],
                [
                    'category' => 'Germany',
                    'icon' => '🇩🇪',
                    'leagues' => [
                        ['key' => 'soccer_germany_bundesliga', 'title' => 'Bundesliga', 'count' => $fixtureCounts['soccer_germany_bundesliga'] ?? 0],
                    ]
                ],
                [
                    'category' => 'France',
                    'icon' => '🇫🇷',
                    'leagues' => [
                        ['key' => 'soccer_france_ligue_one', 'title' => 'Ligue 1', 'count' => $fixtureCounts['soccer_france_ligue_one'] ?? 0],
                    ]
                ],
                [
                    'category' => 'International Clubs',
                    'icon' => '🌍',
                    'leagues' => [
                        ['key' => 'soccer_uefa_champs_league', 'title' => 'UEFA Champions League', 'count' => $fixtureCounts['soccer_uefa_champs_league'] ?? 0],
                        ['key' => 'soccer_uefa_europa_league', 'title' => 'UEFA Europa League', 'count' => $fixtureCounts['soccer_uefa_europa_league'] ?? 0],
                    ]
                ],
                [
                    'category' => 'North & Central America',
                    'icon' => '🌎',
                    'leagues' => [
                        ['key' => 'soccer_usa_mls', 'title' => 'Major League Soccer (MLS)', 'count' => $fixtureCounts['soccer_usa_mls'] ?? 0],
                    ]
                ],
                [
                    'category' => 'Basketball',
                    'icon' => '🏀',
                    'leagues' => [
                        ['key' => 'basketball_nba', 'title' => 'NBA', 'count' => $fixtureCounts['basketball_nba'] ?? 0],
                        ['key' => 'basketball_euroleague', 'title' => 'EuroLeague', 'count' => $fixtureCounts['basketball_euroleague'] ?? 0],
                    ]
                ],
                [
                    'category' => 'ATP Tennis',
                    'icon' => '🎾',
                    'leagues' => [
                        ['key' => 'tennis_atp', 'title' => 'ATP Men Tour', 'count' => $fixtureCounts['tennis_atp'] ?? 0],
                    ]
                ],
                [
                    'category' => 'WTA Tennis',
                    'icon' => '🎾',
                    'leagues' => [
                        ['key' => 'tennis_wta', 'title' => 'WTA Women Tour', 'count' => $fixtureCounts['tennis_wta'] ?? 0],
                    ]
                ],
            ];

            return response()->json([
                'status' => 'success',
                'data' => $menu,
            ]);
        }

        // 2. Fetch Fixtures
        $sport = $request->query('sport', 'soccer_epl');
        
        $fixtures = Fixture::where('sport_key', $sport)
            ->where('commence_time', '>=', now()->startOfDay())
            ->orderBy('commence_time', 'asc')
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => $fixtures,
        ]);
    }
}