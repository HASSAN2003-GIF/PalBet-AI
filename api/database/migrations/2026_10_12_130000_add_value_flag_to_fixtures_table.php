<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The first time the engine flags a value price we keep that price, even if later runs
     * move it or drop the flag. Comparing it with the last pre-kickoff consensus gives the
     * closing-line value (CLV): the honest test of whether value prices are real.
     */
    public function up(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->string('flagged_outcome', 5)->nullable();
            $table->decimal('flagged_price', 7, 2)->nullable();
            $table->decimal('flagged_edge', 6, 4)->nullable();
            $table->timestamp('flagged_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->dropIndex(['flagged_at']);
            $table->dropColumn(['flagged_outcome', 'flagged_price', 'flagged_edge', 'flagged_at']);
        });
    }
};
