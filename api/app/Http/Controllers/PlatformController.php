<?php

namespace App\Http\Controllers;

use App\Models\Fixture;
use App\Services\AnalystService;
use App\Services\CompetitionCatalog;
use App\Services\ScheduleService;
use App\Services\TrackRecordService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PlatformController extends Controller
{
    // ==========================================
    // AI ANALYST
    // ==========================================
    public function askAI(Request $request, AnalystService $analyst): JsonResponse
    {
        $validated = $request->validate([
            'fixture_id' => ['required', 'integer', 'exists:fixtures,id'],
            'message' => ['required', 'string', 'max:600'],
            'history' => ['sometimes', 'array', 'max:16'],
            'history.*.role' => ['required_with:history', 'in:user,ai'],
            'history.*.text' => ['required_with:history', 'string', 'max:4000'],
        ]);

        try {
            $answer = $analyst->ask(
                Fixture::findOrFail($validated['fixture_id']),
                trim($validated['message']),
                $validated['history'] ?? [],
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        }

        return response()->json($answer);
    }

    // ==========================================
    // DAILY SCHEDULE
    // ==========================================
    public function getDailySchedule(Request $request, ScheduleService $schedule): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['sometimes', 'date_format:Y-m-d'],
            'tz' => ['sometimes', 'string', 'timezone:all'],
        ]);

        $tz = $validated['tz'] ?? 'UTC';
        $date = $validated['date'] ?? CarbonImmutable::now($tz)->toDateString();

        // Fixtures only change when the engine runs, so a short cache is safe.
        $payload = Cache::remember(
            "schedule:{$date}:{$tz}",
            now()->addSeconds(60),
            fn () => $schedule->forDay($date, $tz)
        );

        return response()->json($payload);
    }

    // ==========================================
    // TRACK RECORD
    // ==========================================
    public function getTrackRecord(Request $request, TrackRecordService $trackRecord): JsonResponse
    {
        $validated = $request->validate(['days' => ['sometimes', 'integer', 'in:7,30,90,365']]);
        $days = (int) ($validated['days'] ?? 30);

        $payload = Cache::remember("track-record:{$days}", now()->addMinutes(5), fn () => $trackRecord->summary($days));

        return response()->json($payload);
    }

    // ==========================================
    // VISITOR TRACKING
    // ==========================================
    /**
     * Counts unique visitors. Only a keyed hash of the IP is stored, never the address itself.
     */
    public function trackVisit(Request $request): JsonResponse
    {
        $hash = hash_hmac('sha256', (string) $request->ip(), (string) config('app.key'));
        $today = now()->toDateString();

        DB::transaction(function () use ($hash, $today) {
            $visitor = DB::table('visitors')->where('ip_address', $hash)->lockForUpdate()->first();

            $isFirstVisitToday = ! $visitor || substr((string) $visitor->updated_at, 0, 10) !== $today;

            if ($visitor) {
                DB::table('visitors')->where('id', $visitor->id)->update(['updated_at' => now()]);
            } else {
                DB::table('visitors')->insert(['ip_address' => $hash, 'created_at' => now(), 'updated_at' => now()]);
            }

            if ($isFirstVisitToday) {
                $updated = DB::table('daily_metrics')->where('date', $today)->increment('visitors');
                if ($updated === 0) {
                    DB::table('daily_metrics')->insert([
                        'date' => $today, 'visitors' => 1, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
            }
        });

        return response()->json(['status' => 'ok']);
    }

    // ==========================================
    // ADMIN
    // ==========================================
    public function adminStats(Request $request, CompetitionCatalog $catalog): JsonResponse
    {
        $password = (string) config('services.admin.password');
        if ($password === '') {
            return response()->json(['message' => 'Admin access is not configured. Set ADMIN_PASSWORD on the server.'], 503);
        }
        if (! hash_equals($password, (string) $request->header('X-Admin-Key'))) {
            return response()->json(['message' => 'That admin password is not correct.'], 401);
        }

        $now = now();
        $from = $now->copy()->subDays(13)->toDateString();
        $daily = DB::table('daily_metrics')->where('date', '>=', $from)->pluck('visitors', 'date');
        $days = collect(range(13, 0))->map(function ($ago) use ($now, $daily) {
            $date = $now->copy()->subDays($ago)->toDateString();
            // Dates may come back as "Y-m-d" or "Y-m-d 00:00:00" depending on the driver.
            $count = $daily->first(fn ($v, $k) => str_starts_with((string) $k, $date)) ?? 0;

            return ['date' => $date, 'visitors' => (int) $count];
        })->values();

        $upcoming = Fixture::where('commence_time', '>=', $now);

        $topValue = (clone $upcoming)->where('is_value_bet', true)
            ->orderByDesc('edge')->limit(5)->get()
            ->map(fn (Fixture $f) => [
                'id' => $f->id,
                'match' => "{$f->home_team} vs {$f->away_team}",
                'competition' => $catalog->describe($f->sport_key)['name'],
                'kickoff' => $f->commence_time?->toIso8601ZuluString(),
                'edge' => round((float) $f->edge, 4),
            ]);

        $lastRun = Fixture::max('updated_at');

        return response()->json([
            'visitors' => [
                'total' => DB::table('visitors')->count(),
                'today' => (int) ($days->last()['visitors'] ?? 0),
                'last_14_days' => $days,
            ],
            'fixtures' => [
                'total' => Fixture::count(),
                'upcoming' => (clone $upcoming)->count(),
                'upcoming_value' => (clone $upcoming)->where('is_value_bet', true)->count(),
                'upcoming_competitions' => (clone $upcoming)->distinct()->count('sport_key'),
                'last_engine_run' => $lastRun ? CarbonImmutable::parse($lastRun)->toIso8601ZuluString() : null,
            ],
            'players' => [
                'accounts' => DB::table('users')->count(),
                'new_today' => DB::table('users')->where('created_at', '>=', $now->copy()->startOfDay())->count(),
                'pending_slips' => DB::table('bets')->where('status', 'pending')->count(),
                'slips_total' => DB::table('bets')->count(),
            ],
            'top_value' => $topValue,
        ]);
    }
}
