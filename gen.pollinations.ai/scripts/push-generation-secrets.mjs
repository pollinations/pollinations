import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SECRET_KEYS = [
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AZURE_MYCELI_PROD_API_KEY",
    "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    "BETTER_AUTH_SECRET",
    "DASHSCOPE_API_KEY",
    "DEEPINFRA_API_KEY",
    "ELEVENLABS_API_KEY",
    "FIREWORKS_API_KEY",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_ID",
    "GOOGLE_PROJECT_ID",
    "MUSIC_SERVICE_URL",
    "OVHCLOUD_API_KEY",
    "PERPLEXITY_API_KEY",
    "PLN_ENTER_TOKEN",
    "PLN_GPU_TOKEN",
    "PORTKEY_GATEWAY_URL",
    "TINYBIRD_INGEST_TOKEN",
];

const [sourcePath, environment, ...extraSourcePaths] = process.argv.slice(2);

if (!sourcePath || !environment) {
    console.error(
        "Usage: node scripts/push-generation-secrets.mjs <decrypted-json-path> <environment> [extra-sops-json-path...]",
    );
    process.exit(1);
}

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

function readSopsJson(path) {
    return JSON.parse(execFileSync("sops", ["-d", path], { encoding: "utf8" }));
}

const source = {
    ...Object.assign({}, ...extraSourcePaths.map(readSopsJson)),
    ...readJson(sourcePath),
};
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

const omitted = Object.keys(source)
    .filter((key) => !REQUIRED_SECRET_KEYS.includes(key))
    .sort();
if (omitted.length > 0) {
    console.log(`Skipping non-generation secrets: ${omitted.join(", ")}`);
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
