<?php

namespace App\Http\Controllers;

use App\Models\Fixture;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiskEngineController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $sport = $request->query('sport', 'soccer_epl');
        
        // Fetch matching records from the typed PostgreSQL table
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