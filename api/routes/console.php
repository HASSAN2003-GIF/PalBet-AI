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
