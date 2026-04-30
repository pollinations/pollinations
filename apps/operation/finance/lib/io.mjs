import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
    copyFile,
    mkdir,
    readdir,
    readFile,
    writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_PATH = join(APP_DIR, "config.local.json");
const VENDORS_PATH = join(APP_DIR, "secrets", "vendors.json");
const INPUT_DIR = join(APP_DIR, "secrets", "input");
const ENV_PATH = join(APP_DIR, "secrets", ".env");
// Source-of-truth for provider/model API keys lives with the gen worker.
// Finance pulls from there so no key needs to be duplicated locally.
const SHARED_MODEL_SECRETS_PATH = join(
    APP_DIR,
    "..",
    "..",
    "..",
    "gen.pollinations.ai",
    "secrets",
    "env.json",
);

export function appDir() {
    return APP_DIR;
}

export async function loadConfig() {
    if (!existsSync(CONFIG_PATH)) {
        throw new Error(
            `Missing ${CONFIG_PATH}. Copy config.example.json to config.local.json and edit it.`,
        );
    }
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

export async function loadVendors() {
    if (!existsSync(VENDORS_PATH)) {
        await mkdir(dirname(VENDORS_PATH), { recursive: true });
        await writeFile(VENDORS_PATH, "{}\n");
        return {};
    }
    return JSON.parse(await readFile(VENDORS_PATH, "utf8"));
}

export async function saveVendors(vendors) {
    await mkdir(dirname(VENDORS_PATH), { recursive: true });
    await writeFile(VENDORS_PATH, `${JSON.stringify(vendors, null, 2)}\n`);
}

export async function listInputCsvs() {
    if (!existsSync(INPUT_DIR)) {
        await mkdir(INPUT_DIR, { recursive: true });
        return [];
    }
    const files = await readdir(INPUT_DIR);
    return files
        .filter((f) => f.endsWith(".csv"))
        .sort()
        .map((f) => join(INPUT_DIR, f));
}

export async function readText(path) {
    return readFile(path, "utf8");
}

export async function copyIntoInput(sourcePath, destName) {
    await mkdir(INPUT_DIR, { recursive: true });
    const dest = join(INPUT_DIR, destName);
    await copyFile(sourcePath, dest);
    return dest;
}

/**
 * Decrypt the gen worker's SOPS-encrypted env.json (the source of truth
 * for provider/model API keys) and merge any keys not already set into the
 * given target. Used so we don't duplicate keys like DEEPINFRA_API_KEY,
 * ANTHROPIC_API_KEY, etc. into a separate finance .env file.
 *
 * No-op if the file is missing or `sops` isn't on PATH / can't decrypt
 * (e.g. user's age key isn't loaded). Logs a warning in that case so the
 * caller knows live MTD won't work — but doesn't fail the run, since the
 * Wise feed and forecast still work without provider keys.
 */
export async function loadSharedModelSecrets(target = process.env) {
    if (!existsSync(SHARED_MODEL_SECRETS_PATH)) return target;
    const stdout = await new Promise((resolve) => {
        execFile(
            "sops",
            ["-d", SHARED_MODEL_SECRETS_PATH],
            { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
            (err, out, stderr) => {
                if (err) {
                    console.warn(
                        `Could not decrypt shared model secrets (${SHARED_MODEL_SECRETS_PATH}): ${err.message}\n${stderr || ""}`.trim(),
                    );
                    resolve(null);
                    return;
                }
                resolve(out);
            },
        );
    });
    if (!stdout) return target;
    let data;
    try {
        data = JSON.parse(stdout);
    } catch (e) {
        console.warn(`Shared model secrets is not valid JSON: ${e.message}`);
        return target;
    }
    for (const [key, value] of Object.entries(data)) {
        if (typeof value !== "string") continue;
        if (target[key] === undefined) target[key] = value;
    }
    return target;
}

/**
 * Load secrets from apps/operation/finance/secrets/.env into the given object
 * (defaults to process.env). Idempotent: existing keys are NOT overridden.
 *
 * Format: standard dotenv — `KEY=value`, comments start with `#`, blank lines
 * ignored, quotes around values are stripped. Does NOT support multiline values
 * or variable interpolation (not needed for our use case).
 */
export async function loadDotenv(target = process.env) {
    if (!existsSync(ENV_PATH)) return target;
    const text = await readFile(ENV_PATH, "utf8");
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (target[key] === undefined) target[key] = value;
    }
    return target;
}
