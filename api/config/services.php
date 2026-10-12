<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // The Odds API key used by the Python risk engine (app:update-fixtures).
    'odds' => [
        'key' => env('ODDS_API_KEY'),
    ],

    // Gemini key + model for the Python AI analyst (ai_agent.py).
    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL'),
        'fallback_model' => env('GEMINI_FALLBACK_MODEL'),
        // Google Search grounding (injuries, press conferences). Needs a Gemini plan that
        // allows search; when refused, the analyst answers without it and says so.
        'web_search' => (bool) env('ANALYST_WEB_SEARCH', true),
        // ESPN match data (table, last results, head-to-head, news, line-ups). Free.
        'espn' => (bool) env('ANALYST_ESPN', true),
    ],

    // Admin dashboard password. Leave empty to disable the admin endpoints entirely.
    'admin' => [
        'password' => env('ADMIN_PASSWORD'),
    ],

];
