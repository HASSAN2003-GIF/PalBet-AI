<?php

use App\Http\Controllers\RiskEngineController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/api/risk-analysis', RiskEngineController::class);