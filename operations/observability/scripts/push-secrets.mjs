import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REQUIRED_SECRET_NAMES = [
    "GF_ADMIN_PASSWORD",
    "TINYBIRD_READ_TOKEN",
    "TINYBIRD_LEGACY_READ_TOKEN",
    "DISCORD_WEBHOOK_URL",
];

const secretPath = process.argv[2];
const mode = process.argv[3] || "remote";

if (!secretPath) {
    console.error("Usage: node scripts/push-secrets.mjs <json-path> [local]");
    process.exit(1);
}

const raw = await readFile(secretPath, "utf8");
const allSecrets = JSON.parse(raw);
const secrets = {};

for (const name of REQUIRED_SECRET_NAMES) {
    const value = allSecrets[name];
    if (!value) {
        throw new Error(`Missing required secret ${name} in ${secretPath}`);
    }
    secrets[name] = value;
}

for (const name of Object.keys(allSecrets)) {
    if (!REQUIRED_SECRET_NAMES.includes(name)) {
        console.log(`Skipping non-Worker secret ${name}`);
    }
}

if (mode === "local") {
    const lines = Object.entries(secrets).map(([key, value]) => {
        const escaped = String(value)
            .replaceAll("\\", "\\\\")
            .replaceAll('"', '\\"');
        return `${key}="${escaped}"`;
    });
    await writeFile(".dev.vars", `${lines.join("\n")}\n`);
    console.log("Wrote .dev.vars");
    process.exit(0);
}

const dir = await mkdtemp(join(tmpdir(), "observability-grafana-secrets-"));
const filteredPath = join(dir, "secrets.json");

try {
    await writeFile(filteredPath, JSON.stringify(secrets, null, 2));
    await new Promise((resolve, reject) => {
        const child = spawn(
            "npx",
            ["wrangler", "secret", "bulk", filteredPath],
            {
                stdio: "inherit",
            },
        );
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`wrangler secret bulk failed with ${code}`));
        });
    });
} finally {
    await rm(dir, { recursive: true, force: true });
}
