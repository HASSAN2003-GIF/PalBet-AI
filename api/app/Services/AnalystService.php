<?php

namespace App\Services;

use App\Models\Fixture;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * Runs the Python AI analyst (ai_agent.py) for one fixture.
 *
 * The match context is built here from the database, never taken from the browser: the
 * analyst is told this data is verified, so it must not be something a client can forge.
 * The analyst adds real-world data itself (ESPN, and Google Search when the Gemini plan
 * allows it) and returns the sources it used.
 */
class AnalystService
{
    /** What a visitor is told for each failure category reported by ai_agent.py. */
    public const MESSAGES = [
        'setup' => 'The analyst is not set up correctly on the server yet. Please try again later.',
        'auth' => 'The analyst cannot reach its AI service: the API key was rejected.',
        'quota' => 'The analyst has reached its AI usage limit for now. Please try again later.',
        'busy' => 'The AI service is busy right now. Please try again in a minute.',
        'model' => 'The analyst\'s AI model is not available. The model setting needs updating.',
        'request' => 'The analyst could not process that question. Please try rephrasing it.',
        'unknown' => 'The analyst is unavailable right now.',
    ];

    public function __construct(
        private ScheduleService $schedule,
        private CompetitionCatalog $catalog,
    ) {}

    /**
     * @param  list<array{role: string, text: string}>  $history  Earlier turns, oldest first.
     * @return array{response: string, sources: list<array{title: string, url: string}>, used: array{espn: bool, web_search: bool}, search_html: ?string}
     *
     * @throws RuntimeException when the analyst cannot produce an answer.
     */
    public function ask(Fixture $fixture, string $question, array $history = []): array
    {
        $context = $this->schedule->presentMatch($fixture);
        $context['competition'] = $this->catalog->describe($fixture->sport_key);
        $context['sport_key'] = $fixture->sport_key;

        $python = base_path('../venv/bin/python3');
        if (! file_exists($python)) {
            $python = 'python3';
        }

        $process = new Process(
            [
                $python, base_path('../ai_agent.py'),
                '--chat', json_encode($context, JSON_UNESCAPED_UNICODE), $question,
                '--history', json_encode(array_slice($history, -8), JSON_UNESCAPED_UNICODE),
            ],
            base_path('..'),
            array_filter([
                'GEMINI_API_KEY' => (string) config('services.gemini.key'),
                'GEMINI_MODEL' => (string) config('services.gemini.model'),
                'GEMINI_FALLBACK_MODEL' => (string) config('services.gemini.fallback_model'),
                'ANALYST_WEB_SEARCH' => config('services.gemini.web_search') ? '1' : '0',
                'ANALYST_ESPN' => config('services.gemini.espn') ? '1' : '0',
            ], fn ($v) => $v !== ''),
        );
        // ai_agent.py stops itself at 50s; this is the hard backstop, under nginx's 60s.
        $process->setTimeout(58);
        $process->run();

        if (! $process->isSuccessful()) {
            Log::error('AI analyst process failed', ['stderr' => mb_substr($process->getErrorOutput(), 0, 2000)]);
            throw new RuntimeException(self::MESSAGES['setup']);
        }

        $payload = json_decode(trim($process->getOutput()), true);
        if (! is_array($payload) || ($payload['ok'] ?? true) === false || empty($payload['response'])) {
            $reason = is_array($payload) ? (string) ($payload['reason'] ?? 'unknown') : 'setup';
            Log::warning('AI analyst returned no answer', [
                'reason' => $reason,
                'error' => is_array($payload) ? ($payload['error'] ?? null) : 'unparseable output',
            ]);
            throw new RuntimeException(self::MESSAGES[$reason] ?? self::MESSAGES['unknown']);
        }

        return [
            'response' => (string) $payload['response'],
            'sources' => $this->cleanSources($payload['sources'] ?? []),
            'used' => [
                'espn' => (bool) ($payload['used']['espn'] ?? false),
                'web_search' => (bool) ($payload['used']['web_search'] ?? false),
            ],
            'search_html' => is_string($payload['search_html'] ?? null) ? $payload['search_html'] : null,
        ];
    }

    /** Only http(s) links with a title reach the browser. */
    private function cleanSources(mixed $sources): array
    {
        if (! is_array($sources)) {
            return [];
        }

        return collect($sources)
            ->filter(fn ($s) => is_array($s) && is_string($s['url'] ?? null) && preg_match('#^https?://#i', $s['url']))
            ->map(fn ($s) => ['title' => mb_substr(trim((string) ($s['title'] ?? '')) ?: 'Source', 0, 140), 'url' => $s['url']])
            ->unique('url')->take(8)->values()->all();
    }
}
