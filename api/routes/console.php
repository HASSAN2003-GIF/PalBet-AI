<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Results first, then settle prediction slips against them. Each scores call costs Odds API
// credits, and the command only calls competitions with matches awaiting a result.
// Runs when a scheduler is active: `php artisan schedule:work` or a cron calling schedule:run.
Schedule::command('app:update-results')->everyThreeHours()->withoutOverlapping();
Schedule::command('ai:settle-predictions')->everyThirtyMinutes()->withoutOverlapping();

// Odds refresh. Prices close to kick-off are the most accurate input the engine can get
// (backtest/experiments.py), but every league scanned costs Odds API credits, so this is
// opt-in with PALBET_ODDS_SCHEDULE=true.
if (config('palbet.odds_schedule')) {
    Schedule::command('app:update-fixtures')->twiceDaily(5, 14)->withoutOverlapping();
    Schedule::command('app:update-fixtures', ['--upcoming' => max(1, (int) config('palbet.odds_refresh_hours'))])
        ->hourlyAt(20)->withoutOverlapping();
}
