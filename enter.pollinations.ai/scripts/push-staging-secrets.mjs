import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const runtimeKeys = [
    "BETTER_AUTH_SECRET",
    "CODE_AGENT_DEPLOY_API_TOKEN",
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "PLN_ENTER_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "TINYBIRD_INGEST_TOKEN",
    "TINYBIRD_READ_TOKEN",
    "WEFT_SELLER_API_KEY",
];

const source = JSON.parse(readFileSync(process.argv[2], "utf8"));
const payload = {};
for (const name of runtimeKeys) {
    if (typeof source[name] !== "string" || !source[name].trim()) {
        throw new Error(`Missing or invalid Enter staging secret: ${name}`);
    }
    payload[name] = source[name];
}

execFileSync(
    "npx",
    ["--no-install", "wrangler", "secret", "bulk", "--env", "staging"],
    {
        input: JSON.stringify(payload),
        stdio: ["pipe", "inherit", "inherit"],
    },
);
