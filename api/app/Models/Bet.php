<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Bet extends Model
{
    protected $fillable = ['user_id', 'stake', 'total_odds', 'potential_payout', 'matches'];
    
    // Automatically convert the JSON matches back into a PHP array
    protected $casts = ['matches' => 'array'];
}