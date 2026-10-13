<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\PlatformController;
use App\Http\Controllers\RiskEngineController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['message' => 'PAL-PREDICT API is running']);
});

Route::get('/api/risk-analysis', RiskEngineController::class);

// Matchday schedule with the risk engine's read on every fixture.
Route::get('/api/schedule', [PlatformController::class, 'getDailySchedule'])
    ->middleware('throttle:120,1');

// Find matches by team, competition, day or state ("arsenal", "premier league tomorrow").
Route::get('/api/search', [PlatformController::class, 'searchMatches'])
    ->middleware('throttle:90,1');

// How the model has done against real results.
Route::get('/api/track-record', [PlatformController::class, 'getTrackRecord'])
    ->middleware('throttle:60,1');

// AI analyst: each call costs an LLM request, so it is rate limited per IP.
Route::post('/api/platform/chat', [PlatformController::class, 'askAI'])
    ->middleware('throttle:8,1');

// Accounts (Sanctum bearer tokens) and play-money prediction slips.
Route::post('/api/auth/register', [AccountController::class, 'register'])->middleware('throttle:5,1');
Route::post('/api/auth/login', [AccountController::class, 'login'])->middleware('throttle:10,1');
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/api/auth/logout', [AccountController::class, 'logout']);
    Route::get('/api/me', [AccountController::class, 'me']);
    Route::get('/api/slips', [AccountController::class, 'slips']);
    Route::post('/api/slips', [AccountController::class, 'placeSlip'])->middleware('throttle:30,1');
});

// Unique-visitor tracking + password-protected admin metrics.
Route::post('/api/platform/track', [PlatformController::class, 'trackVisit'])
    ->middleware('throttle:30,1');
Route::get('/api/platform/admin-stats', [PlatformController::class, 'adminStats'])
    ->middleware('throttle:20,1');
