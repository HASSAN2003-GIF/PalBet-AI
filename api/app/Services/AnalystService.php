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
 */
class AnalystService
{
    public function __construct(
        private ScheduleService $schedule,
        private CompetitionCatalog $catalog,
    ) {}

    /**
     * @param  list<array{role: string, text: string}>  $history  Earlier turns, oldest first.
     *
     * @throws RuntimeException when the analyst cannot produce an answer.
     */
    public function ask(Fixture $fixture, string $question, array $history = []): string
    {
        $context = $this->schedule->presentMatch($fixture);
        $context['competition'] = $this->catalog->describe($fixture->sport_key);

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
            null,
            array_filter([
                'GEMINI_API_KEY' => (string) config('services.gemini.key'),
                'GEMINI_MODEL' => (string) config('services.gemini.model'),
            ]),
        );
        $process->setTimeout(45);
        $process->run();

        if (! $process->isSuccessful()) {
            Log::error('AI analyst process failed', ['stderr' => mb_substr($process->getErrorOutput(), 0, 2000)]);
            throw new RuntimeException('The analyst is unavailable right now.');
        }

        $payload = json_decode(trim($process->getOutput()), true);
        if (! is_array($payload) || ($payload['ok'] ?? true) === false || empty($payload['response'])) {
            Log::warning('AI analyst returned no answer', ['error' => $payload['error'] ?? 'unparseable output']);
            throw new RuntimeException('The analyst is unavailable right now.');
        }

        return (string) $payload['response'];
    }
}
