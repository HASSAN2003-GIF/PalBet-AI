<?php

return [

    // Play-money tokens for prediction slips. They can't be bought or cashed out.
    'starting_tokens' => (int) env('PALBET_STARTING_TOKENS', 100),

    // Largest stake allowed on a single slip.
    'max_stake' => (int) env('PALBET_MAX_STAKE', 100),

    // Automatic odds refresh (costs Odds API credits, so it is off until switched on):
    // a full scan of every league twice a day, plus an hourly refresh of only the leagues
    // with a match kicking off in the next few hours, where fresh prices matter most.
    'odds_schedule' => (bool) env('PALBET_ODDS_SCHEDULE', false),
    'odds_refresh_hours' => (int) env('PALBET_ODDS_REFRESH_HOURS', 3),

];
