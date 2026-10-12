<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Record where each team's form string came from (espn_form, espn_streak, synthetic),
     * so the UI only presents real results as real. Nullable: existing rows keep working.
     */
    public function up(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->string('home_form_source', 20)->nullable()->after('away_form');
            $table->string('away_form_source', 20)->nullable()->after('home_form_source');
        });
    }

    public function down(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->dropColumn(['home_form_source', 'away_form_source']);
        });
    }
};
