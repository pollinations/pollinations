import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// secrets.vars.json is keyed by environment: { production: {...}, staging: {...} }
const REQUIRED_SECRET_NAMES = ["WEBUI_SECRET_KEY", "DATABASE_URL"];

const secretPath = process.argv[2];
const target = process.argv[3] || "production";

if (!secretPath) {
    console.error(
        "Usage: node scripts/push-secrets.mjs <json-path> [production|staging|local]",
    );
    process.exit(1);
}

const all = JSON.parse(await readFile(secretPath, "utf8"));
const section = all[target === "local" ? "staging" : target];
if (!section) {
    throw new Error(`No "${target}" section in ${secretPath}`);
}

const secrets = {};
for (const name of REQUIRED_SECRET_NAMES) {
    if (!section[name]) {
        throw new Error(`Missing required secret ${name} for ${target}`);
    }
    secrets[name] = section[name];
}

if (target === "local") {
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

const dir = await mkdtemp(join(tmpdir(), "openwebui-secrets-"));
const filteredPath = join(dir, "secrets.json");
const args = ["wrangler", "secret", "bulk", filteredPath];
if (target === "staging") args.push("--env", "staging");

try {
    await writeFile(filteredPath, JSON.stringify(secrets, null, 2));
    await new Promise((resolve, reject) => {
        const child = spawn("npx", args, { stdio: "inherit" });
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`wrangler secret bulk failed with ${code}`));
        });
    });
} finally {
    await rm(dir, { recursive: true, force: true });
}
