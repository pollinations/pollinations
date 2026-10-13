#!/usr/bin/env node
/**
 * Seed a known API key into the LOCAL D1 that Enter and gen share, and give
 * every local user (including GitHub sign-ins to local Enter) Quest Pollen.
 *
 * Why this exists
 * ---------------
 * gen validates `Authorization: Bearer sk_…` against its own local D1 `apikey`
 * table via better-auth `verifyApiKey`. better-auth stores keys hashed as
 * `base64url(sha256(plaintext))` and NEVER stores the plaintext of secret keys.
 * So a key minted via the dashboard is unrecoverable, and a token sitting in
 * `_local/.env` only authenticates if ITS hash happens to be in THIS D1 — which
 * it usually isn't (the D1 gets recreated, or the token came from another clone).
 * That's why curl-based e2e against `npm run dev` 401s "almost every day".
 *
 * This script computes the same hash better-auth uses and upserts a key whose
 * plaintext we control. Idempotent — safe to re-run after any D1 reset.
 *
 * Usage
 * -----
 *   npm run seed:local                          # seed POLLINATIONS_TOKEN_LOCAL from _local/.env
 *   POLLINATIONS_TOKEN_LOCAL=sk_xxx npm run seed:local
 *
 * If no token is found it generates one, seeds it, and appends it to _local/.env.
 * Create the D1 + schema first: `npm run migrate:development` in enter.pollinations.ai.
 */
import { execFileSync } from "node:child_process";
import { createHash, getRandomValues } from "node:crypto";
import {
    appendFileSync,
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GEN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(GEN_ROOT, "..");
const ENV_FILE = join(REPO_ROOT, "_local", ".env");
const D1_DIR = join(
    REPO_ROOT,
    "enter.pollinations.ai/.wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const USER_ID = "local-e2e-user";
const KEY_ID = "local-e2e-key";
const MIGRATE_HINT =
    "Create it first: npm run migrate:development (in enter.pollinations.ai)";

const die = (msg) => {
    console.error(`\n✖ ${msg}\n`);
    process.exit(1);
};

// better-auth apiKey plugin hashing: base64url(sha256(utf8(key))), no padding.
// Mirrors defaultKeyHasher in better-auth/dist/plugins/api-key/index.mjs.
const hashKey = (key) =>
    createHash("sha256").update(key, "utf8").digest("base64url");

function readEnvToken() {
    if (process.env.POLLINATIONS_TOKEN_LOCAL)
        return process.env.POLLINATIONS_TOKEN_LOCAL.trim();
    if (!existsSync(ENV_FILE)) return null;
    for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
        const m = line.match(/^\s*POLLINATIONS_TOKEN_LOCAL\s*=\s*(.+?)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
    return null;
}

function generateToken() {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = getRandomValues(new Uint8Array(32));
    return `sk_${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}

function findDb() {
    if (!existsSync(D1_DIR))
        die(`No local D1 found at ${D1_DIR}\n  ${MIGRATE_HINT}`);
    const files = readdirSync(D1_DIR)
        .filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")
        .map((f) => join(D1_DIR, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (!files.length) die(`No .sqlite in ${D1_DIR}\n  ${MIGRATE_HINT}`);
    return files[0];
}

function sql(db, statement) {
    try {
        return execFileSync("sqlite3", [db, statement], {
            encoding: "utf8",
        }).trim();
    } catch (err) {
        if (err.code === "ENOENT")
            die(
                "`sqlite3` CLI not found — install it (macOS: preinstalled; Debian: apt install sqlite3).",
            );
        die(`sqlite3 failed: ${err.stderr || err.message}`);
    }
}

// --- main ---------------------------------------------------------------
const db = findDb();

const hasTable = sql(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='apikey';",
);
if (!hasTable) die(`Local D1 has no \`apikey\` table yet.\n  ${MIGRATE_HINT}`);

let token = readEnvToken();
let generated = false;
if (!token) {
    token = generateToken();
    generated = true;
}

const keyHash = hashKey(token);
const start = token.slice(0, 10);
const esc = (s) => s.replace(/'/g, "''");

// Self-contained: a dedicated user with generous balances so paid-only gates
// and spend both pass. Fixed ids → INSERT OR REPLACE is a clean upsert.
sql(
    db,
    `INSERT OR REPLACE INTO user
       (id, name, email, email_verified, tier_balance, pack_balance,
        created_at, updated_at, auto_top_up_enabled)
     VALUES
       ('${USER_ID}', 'Local E2E', 'local-e2e@test.local', 1,
        1000000, 1000000, strftime('%s','now'), strftime('%s','now'), 0);`,
);
sql(
    db,
    `INSERT OR REPLACE INTO apikey
       (id, name, start, prefix, key, user_id, enabled, rate_limit_enabled,
        request_count, created_at, updated_at)
     VALUES
       ('${KEY_ID}', 'local-e2e', '${esc(start)}', 'sk', '${esc(keyHash)}',
        '${USER_ID}', 1, 0, 0, strftime('%s','now'), strftime('%s','now'));`,
);

// Quest Pollen for every local account, e.g. one signed in through GitHub.
const users = sql(
    db,
    "UPDATE user SET tier_balance = MAX(COALESCE(tier_balance, 0), 1000000); SELECT changes();",
);

if (generated && existsSync(ENV_FILE)) {
    appendFileSync(ENV_FILE, `\nPOLLINATIONS_TOKEN_LOCAL=${token}\n`);
}

console.log(`
✔ Seeded local API key into the shared local D1
  db:    ${db}
  user:  ${USER_ID} (balances=1,000,000)
  users: ${users} local users have at least 1,000,000 Quest Pollen
  key:   ${KEY_ID} (enabled, no expiry, full access)
  token: ${token}${generated ? "  (generated → appended to _local/.env)" : "  (from _local/.env)"}

Test it:
  curl "http://localhost:8788/v1/chat/completions" \\
    -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
    -d '{"model":"minimax-m3","max_tokens":20,"messages":[{"role":"user","content":"hi"}]}'
`);
