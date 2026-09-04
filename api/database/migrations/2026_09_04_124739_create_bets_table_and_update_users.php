<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Give all players a real wallet balance (Defaulting to a $15.00 signup bonus)
        Schema::table('users', function (Blueprint $table) {
            $table->decimal('balance', 10, 2)->default(15.00);
        });

        // 2. Create the Bets table to store tickets
        Schema::create('bets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->decimal('stake', 10, 2);
            $table->decimal('total_odds', 8, 2);
            $table->decimal('potential_payout', 10, 2);
            $table->json('matches'); // Stores the array of matches on the slip
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bets');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('balance');
        });
    }
};