<?php

namespace App\Http\Controllers;

use App\Models\Bet;
use App\Models\Fixture;
use App\Models\User;
use App\Services\SlipService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Accounts (Sanctum bearer tokens) and play-money prediction slips.
 */
class AccountController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'email' => ['required', 'string', 'email:rfc', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', Password::min(8)->letters()->numbers()],
            'adult' => ['accepted'],
        ], [
            'adult.accepted' => 'You need to be 18 or older to use prediction slips.',
            'email.unique' => 'An account with that email already exists. Sign in instead.',
        ]);

        $user = new User([
            'name' => trim($data['name']),
            'email' => strtolower($data['email']),
            'password' => $data['password'],
        ]);
        $user->forceFill(['balance' => (int) config('palbet.starting_tokens')])->save();

        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => $user->fresh()->toAccountArray(),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            // Same message either way: don't reveal which emails have accounts.
            throw ValidationException::withMessages(['email' => 'That email and password don\'t match an account.']);
        }

        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => $user->toAccountArray(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['status' => 'signed_out']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()->toAccountArray()]);
    }

    public function slips(Request $request, SlipService $service): JsonResponse
    {
        $slips = $request->user()->slips()->latest('id')->limit(50)->get();
        $fixtures = Fixture::whereIn('id', $slips->flatMap->fixtureIds()->unique())->get()->keyBy('id');

        return response()->json([
            'user' => $request->user()->toAccountArray(),
            'slips' => $slips->map(fn (Bet $s) => $service->present($s, $fixtures))->values(),
        ]);
    }

    public function placeSlip(Request $request, SlipService $service): JsonResponse
    {
        $data = $request->validate([
            'stake' => ['required', 'integer', 'min:1', 'max:'.(int) config('palbet.max_stake')],
            'selections' => ['required', 'array', 'min:1', 'max:'.SlipService::MAX_SELECTIONS],
            'selections.*.fixture_id' => ['required', 'integer'],
            'selections.*.outcome' => ['required', 'string', 'in:home,draw,away'],
        ], [
            'selections.max' => 'A slip can have up to '.SlipService::MAX_SELECTIONS.' picks.',
        ]);

        $slip = $service->place($request->user(), (int) $data['stake'], $data['selections']);
        $fixtures = Fixture::whereIn('id', $slip->fixtureIds())->get()->keyBy('id');

        return response()->json([
            'slip' => $service->present($slip, $fixtures),
            'user' => $request->user()->fresh()->toAccountArray(),
        ], 201);
    }
}
