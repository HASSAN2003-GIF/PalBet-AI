<?php

return [

    // Play-money tokens for prediction slips. They can't be bought or cashed out.
    'starting_tokens' => (int) env('PALBET_STARTING_TOKENS', 100),

    // Largest stake allowed on a single slip.
    'max_stake' => (int) env('PALBET_MAX_STAKE', 100),

];
