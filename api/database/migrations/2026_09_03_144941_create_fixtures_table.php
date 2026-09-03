<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fixtures', function (Blueprint $table) {
            $table->id();
            $table->string('sport_key')->index();
            $table->string('home_team');
            $table->string('away_team');
            $table->string('home_logo')->nullable();
            $table->string('away_logo')->nullable();
            $table->dateTime('commence_time')->index();
            $table->string('date_str')->nullable()->index();
            $table->string('bookmaker');
            
            // Financial & Probability Data
            $table->decimal('odds_home', 6, 2);
            $table->decimal('odds_draw', 6, 2)->nullable();
            $table->decimal('odds_away', 6, 2);
            
            $table->decimal('prob_home', 5, 4);
            $table->decimal('prob_draw', 5, 4)->nullable();
            $table->decimal('prob_away', 5, 4);
            
           $table->string('pred_score');
            
            // Recent Form Data
            $table->string('home_form')->nullable();
            $table->string('away_form')->nullable();
            
            // Dynamic Markets
            $table->string('market_1_label');
            $table->string('market_1_val');
            $table->string('market_2_label');
            $table->string('market_2_val');
            
            // Risk Engine Outputs
            $table->decimal('edge', 6, 4);
            $table->decimal('stake', 8, 2);
            $table->boolean('is_value_bet')->default(false)->index();
            $table->text('rationale');
            $table->boolean('is_soccer')->default(false);

            $table->timestamps();

            $table->unique(['home_team', 'away_team', 'commence_time']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fixtures');
    }
};