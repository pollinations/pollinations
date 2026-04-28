import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SECRET_KEYS = [
    "BETTER_AUTH_SECRET",
    "DASHSCOPE_API_KEY",
    "ELEVENLABS_API_KEY",
    "MUSIC_SERVICE_URL",
    "OVHCLOUD_API_KEY",
    "PLN_ENTER_TOKEN",
    "PLN_GPU_TOKEN",
    "TINYBIRD_INGEST_TOKEN",
];

const [sourcePath, environment] = process.argv.slice(2);

if (!sourcePath || !environment) {
    console.error(
        "Usage: node scripts/push-generation-secrets.mjs <decrypted-json-path> <environment>",
    );
    process.exit(1);
}

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const filtered = {};
const missing = [];

for (const key of REQUIRED_SECRET_KEYS) {
    if (source[key] === undefined) {
        missing.push(key);
    } else {
        filtered[key] = source[key];
    }
}

if (missing.length > 0) {
    console.error(`Missing required generation secrets: ${missing.join(", ")}`);
    process.exit(1);
}

if (environment === "local") {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const outputPath = join(scriptDir, "..", ".dev.vars");
    const dotenv = Object.entries(filtered)
        .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
        .join("\n");
    writeFileSync(outputPath, `${dotenv}\n`, { mode: 0o600 });
    console.log(`Wrote ${outputPath}`);
    process.exit(0);
}

const outputPath = join(
    tmpdir(),
    `pollinations-gen-${environment}-secrets-${process.pid}.json`,
);

try {
    writeFileSync(outputPath, `${JSON.stringify(filtered, null, 2)}\n`, {
        mode: 0o600,
    });
    execFileSync(
        "npx",
        ["wrangler", "secret", "bulk", outputPath, "--env", environment],
        {
            stdio: "inherit",
        },
    );
} finally {
    rmSync(outputPath, { force: true });
}
