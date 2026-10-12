<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

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
        // Note: this migration used to insert random "baseline" visitor counts. Admin metrics
        // must reflect real traffic only, so tables now start empty.
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_metrics');
        Schema::dropIfExists('activity_logs');
    }
};