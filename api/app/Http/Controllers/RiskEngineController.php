<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class RiskEngineController extends Controller
{
    public function __invoke(): JsonResponse
    {
        // Use absolute paths to eliminate Python RuntimeWarnings
        $pythonBinary = base_path('../venv/bin/python3');
        $scriptPath = base_path('../risk_engine.py');

        $process = new Process([$pythonBinary, $scriptPath, '--json']);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }

        $output = json_decode($process->getOutput(), true);

        return response()->json([
            'status' => 'success',
            'data' => $output,
        ]);
    }
}