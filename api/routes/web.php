<?php

use App\Http\Controllers\RiskEngineController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\PlatformController;

Route::get('/', function () {
    return response()->json(['message' => 'PalBet API is running locally']);
});

Route::get('/api/risk-analysis', RiskEngineController::class);

// Tracking & Admin Routes
Route::get('/api/platform/track', [PlatformController::class, 'trackVisit']);
Route::get('/api/platform/admin-stats', [PlatformController::class, 'adminStats']);

// Auth Route
Route::post('/api/platform/auth', [PlatformController::class, 'authenticate'])
    ->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

Route::post('/api/platform/bet', [PlatformController::class, 'placeBet'])
    ->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

    Route::get('/api/platform/my-bets', [\App\Http\Controllers\PlatformController::class, 'myBets']);

    Route::post('/api/platform/chat', [\App\Http\Controllers\PlatformController::class, 'askAI'])
    ->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

    Route::get('/api/schedule', [App\Http\Controllers\PlatformController::class, 'getDailySchedule']);