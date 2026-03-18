import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PYTHON_CANDIDATES = ["python3.11", "python3"] as const;
const APP_ROOT = dirname(
    dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);
const WORKSPACE_ROOT = dirname(APP_ROOT);
const DOTENV_PATHS = [
    join(APP_ROOT, ".env"),
    join(WORKSPACE_ROOT, ".env"),
] as const;

function loadDotenvEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    for (const dotenvPath of DOTENV_PATHS) {
        if (!existsSync(dotenvPath)) {
            continue;
        }

        for (const rawLine of readFileSync(dotenvPath, "utf-8").split(
            /\r?\n/,
        )) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#") || !line.includes("=")) continue;
            const [rawKey, ...rawValueParts] = line.split("=");
            const key = rawKey.trim();
            let value = rawValueParts.join("=").trim();
            if (
                value.length >= 2 &&
                ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'")))
            ) {
                value = value.slice(1, -1);
            }
            if (!(key in env)) {
                env[key] = value;
            }
        }
    }

    const keyPath = env.GITHUB_APP_PRIVATE_KEY_PATH?.trim();
    if (keyPath && !existsSync(keyPath)) {
        const workspacePem = readdirSync(WORKSPACE_ROOT).find((entry) =>
            entry.endsWith(".pem"),
        );
        if (workspacePem) {
            env.GITHUB_APP_PRIVATE_KEY_PATH = join(
                WORKSPACE_ROOT,
                workspacePem,
            );
        } else {
            delete env.GITHUB_APP_PRIVATE_KEY_PATH;
            delete env.GITHUB_APP_ID;
        }
    }

    return env;
}

export function getPythonBin(): string {
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

export function getPythonEnv(): NodeJS.ProcessEnv {
    const pythonBin = getPythonBin();
    return {
        ...loadDotenvEnv(),
        PYTHON_BIN: process.env.PYTHON_BIN?.trim() || pythonBin,
    };
}

export function runInlinePython(source: string): string {
    const pythonBin = getPythonBin();
    return execFileSync(pythonBin, ["-c", source], {
        encoding: "utf-8",
        maxBuffer: 100 * 1024 * 1024,
        env: getPythonEnv(),
    });
}
