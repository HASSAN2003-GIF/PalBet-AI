<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // The React app is served from a different origin (Vercel) and calls these
        // endpoints without cookies, so CSRF tokens do not apply to them.
        $middleware->validateCsrfTokens(except: [
            'api/*',
        ]);
        $middleware->trustProxies(at: '*');
        // There is no server-rendered login page: signed-out API calls get a JSON 401.
        $middleware->redirectGuestsTo(fn ($request) => $request->is('api/*') ? null : '/');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Everything under /api answers in JSON (401, 404, 422...) even if the client forgets
        // the Accept header, instead of redirecting to a login page that doesn't exist.
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*') || $request->expectsJson());
    })->create();