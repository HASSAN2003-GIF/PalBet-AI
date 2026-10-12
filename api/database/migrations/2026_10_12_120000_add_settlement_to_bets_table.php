<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Prediction slips (the existing `bets` table) settle against real results: record what was
     * paid out and when. Status values: pending, won, lost, void.
     */
    public function up(): void
    {
        Schema::table('bets', function (Blueprint $table) {
            $table->decimal('payout', 12, 2)->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('bets', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'status']);
            $table->dropColumn(['payout', 'settled_at']);
        });
    }
};
