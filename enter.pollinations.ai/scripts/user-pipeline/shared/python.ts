import { execFileSync } from "node:child_process";

const PYTHON_CANDIDATES = ["python3.11", "python3"] as const;

function getPythonBin(): string {
    const configured = process.env.PYTHON_BIN?.trim();
    if (configured) return configured;

    for (const candidate of PYTHON_CANDIDATES) {
        try {
            execFileSync(candidate, ["-c", "import sys"], {
                stdio: "ignore",
            });
            return candidate;
        } catch {
            // Try the next candidate.
        }
    }

    console.error(
        "❌ No usable Python interpreter found. Set PYTHON_BIN explicitly.",
    );
    process.exit(1);
}

export function runInlinePython(source: string): string {
    const pythonBin = getPythonBin();
    return execFileSync(pythonBin, ["-c", source], {
        encoding: "utf-8",
        maxBuffer: 100 * 1024 * 1024,
    });
}
