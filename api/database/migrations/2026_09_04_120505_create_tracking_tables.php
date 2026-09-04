<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Table for tracking Daily Web Traffic
        Schema::create('daily_metrics', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->integer('visitors')->default(0);
            $table->timestamps();
        });

        // 2. Table for tracking Live User Logins & Registrations
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->string('phone');
            $table->string('action');
            $table->string('color')->default('bg-emerald-100 text-emerald-600');
            $table->timestamps();
        });

        // 3. Seed the last 7 days with baseline traffic so your chart isn't empty today!
        for ($i = 6; $i >= 0; $i--) {
            DB::table('daily_metrics')->insert([
                'date' => now()->subDays($i)->toDateString(),
                'visitors' => rand(1000, 3500),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_metrics');
        Schema::dropIfExists('activity_logs');
    }
};