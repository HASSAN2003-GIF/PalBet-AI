<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Final scores from The Odds API /scores endpoint. They let the app show real results,
     * measure the model's track record and settle prediction slips honestly.
     */
    public function up(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->unsignedSmallInteger('home_score')->nullable();
            $table->unsignedSmallInteger('away_score')->nullable();
            $table->boolean('completed')->default(false)->index();
            $table->timestamp('result_fetched_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->dropIndex(['completed']);
            $table->dropColumn(['home_score', 'away_score', 'completed', 'result_fetched_at']);
        });
    }
};
