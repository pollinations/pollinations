#!/usr/bin/env node
/**
 * Seed staging D1 database with a stratified random sample from production.
 *
 * Copies ~5,000 users (stratified by tier) plus their apikeys and accounts
 * from production into staging. Clears staging tables before inserting.
 *
 * PRODUCTION IS READ-ONLY — only SELECT queries. Never modified.
 * STAGING is the target — DELETE + INSERT.
 *
 * Edit the SAMPLE object below to adjust tier sizes.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   node scripts/user-pipeline/test/seed-staging.mjs
 */

import { execFileSync } from "child_process";

const PROD_DB = "production-pollinations-enter-db";
const STAGING_DB = "staging-pollinations-enter-db";

const SAMPLE = {
  spore: 3250,
  microbe: 1000,
  seed: 650,
  flower: 70,
  nectar: 25,
  router: 1,
};

const USER_COLS = [
  "id", "name", "email", "email_verified", "image",
  "created_at", "updated_at", "role", "banned", "ban_reason",
  "ban_expires", "github_id", "github_username", "tier",
  "tier_balance", "pack_balance", "last_tier_grant", "crypto_balance",
];

const APIKEY_COLS = [
  "id", "name", "start", "prefix", "key", "user_id",
  "refill_interval", "refill_amount", "last_refill_at", "enabled",
  "rate_limit_enabled", "rate_limit_time_window", "rate_limit_max",
  "request_count", "remaining", "last_request", "expires_at",
  "created_at", "updated_at", "permissions", "metadata", "pollen_balance",
];

const ACCOUNT_COLS = [
  "id", "account_id", "provider_id", "user_id", "access_token",
  "refresh_token", "id_token", "access_token_expires_at",
  "refresh_token_expires_at", "scope", "password", "created_at", "updated_at",
];

// ─── Helpers ─────────────────────────────────────────────────────────

function wrangler(args) {
  const out = execFileSync("npx", ["wrangler", ...args], {
    cwd: process.cwd(),
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf-8",
  });
  return out;
}

function queryProd(sql) {
  const out = wrangler(["d1", "execute", PROD_DB, "--remote", "--command", sql, "--json"]);
  const parsed = JSON.parse(out);
  return parsed[0]?.results || [];
}

function execStaging(sql) {
  wrangler(["d1", "execute", STAGING_DB, "--remote", "--command", sql]);
}

function queryStaging(sql) {
  const out = wrangler(["d1", "execute", STAGING_DB, "--remote", "--command", sql, "--json"]);
  const parsed = JSON.parse(out);
  return parsed[0]?.results || [];
}

function escapeVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildInsert(table, cols, rows) {
  const valuesClauses = rows.map(row => {
    const vals = cols.map(c => escapeVal(row[c]));
    return `(${vals.join(",")})`;
  });
  return `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(",")}) VALUES ${valuesClauses.join(",")};`;
}

// ─── Phase 1: Sample user IDs from production (READ-ONLY) ───────────

console.log("=== Phase 1: Sampling user IDs from production (READ-ONLY) ===\n");

const allUserIds = [];

for (const [tier, count] of Object.entries(SAMPLE)) {
  console.log(`  Sampling ${count} ${tier} users...`);
  const sql = `SELECT id FROM user WHERE tier = '${tier}' ORDER BY RANDOM() LIMIT ${count}`;
  const rows = queryProd(sql);
  const ids = rows.map(r => r.id);
  console.log(`    Got ${ids.length} ${tier} user IDs`);
  allUserIds.push(...ids);
}

console.log(`\nTotal sampled user IDs: ${allUserIds.length}\n`);

// ─── Phase 2: Export full rows from production (READ-ONLY) ──────────

console.log("=== Phase 2: Exporting full rows from production (READ-ONLY) ===\n");

const allUsers = [];
const allApikeys = [];
const allAccounts = [];

const ID_BATCH = 100;

for (let i = 0; i < allUserIds.length; i += ID_BATCH) {
  const batch = allUserIds.slice(i, i + ID_BATCH);
  const inClause = batch.map(id => `'${id.replace(/'/g, "''")}'`).join(",");

  if (i % 500 === 0) {
    console.log(`  Exporting batch ${Math.floor(i / ID_BATCH) + 1}/${Math.ceil(allUserIds.length / ID_BATCH)}...`);
  }

  const users = queryProd(`SELECT ${USER_COLS.map(c => '"' + c + '"').join(",")} FROM user WHERE id IN (${inClause})`);
  allUsers.push(...users);

  const keys = queryProd(`SELECT ${APIKEY_COLS.map(c => '"' + c + '"').join(",")} FROM apikey WHERE user_id IN (${inClause})`);
  allApikeys.push(...keys);

  const accounts = queryProd(`SELECT ${ACCOUNT_COLS.map(c => '"' + c + '"').join(",")} FROM account WHERE user_id IN (${inClause})`);
  allAccounts.push(...accounts);
}

console.log(`  Exported: ${allUsers.length} users, ${allApikeys.length} apikeys, ${allAccounts.length} accounts\n`);

// ─── Phase 3: Clear staging ─────────────────────────────────────────

console.log("=== Phase 3: Clearing staging tables ===\n");

for (const table of ["apikey", "account", "session", "verification", "user"]) {
  console.log(`  Deleting all from ${table}...`);
  try {
    execStaging(`DELETE FROM "${table}";`);
  } catch (e) {
    console.log(`    Warning: could not clear ${table}: ${e.message}`);
  }
}

console.log();

// ─── Phase 4: Insert into staging ───────────────────────────────────

console.log("=== Phase 4: Inserting into staging ===\n");

const INSERT_BATCH = 25;

function batchInsert(table, cols, rows, label) {
  console.log(`  Inserting ${rows.length} ${label}...`);
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const sql = buildInsert(table, cols, batch);
    try {
      execStaging(sql);
    } catch (e) {
      console.error(`    ERROR inserting ${label} batch ${i}: ${e.message.slice(0, 200)}`);
      for (const row of batch) {
        try {
          execStaging(buildInsert(table, cols, [row]));
        } catch (e2) {
          console.error(`    SKIP ${label} ${row.id}: ${e2.message.slice(0, 200)}`);
        }
      }
    }
    if ((i + INSERT_BATCH) % 250 < INSERT_BATCH) {
      console.log(`    ${Math.min(i + INSERT_BATCH, rows.length)} / ${rows.length}`);
    }
  }
}

batchInsert("user", USER_COLS, allUsers, "users");
batchInsert("apikey", APIKEY_COLS, allApikeys, "apikeys");
batchInsert("account", ACCOUNT_COLS, allAccounts, "accounts");

// ─── Phase 5: Verify ────────────────────────────────────────────────

console.log("\n=== Phase 5: Verification ===\n");

const userCount = queryStaging("SELECT COUNT(*) as c FROM user");
const apikeyCount = queryStaging("SELECT COUNT(*) as c FROM apikey");
const accountCount = queryStaging("SELECT COUNT(*) as c FROM account");
const tierDist = queryStaging("SELECT tier, COUNT(*) as c FROM user GROUP BY tier ORDER BY c DESC");
const bannedCount = queryStaging("SELECT COUNT(*) as c FROM user WHERE banned = 1");

console.log(`  Users:    ${userCount[0]?.c}`);
console.log(`  API keys: ${apikeyCount[0]?.c}`);
console.log(`  Accounts: ${accountCount[0]?.c}`);
console.log(`  Banned:   ${bannedCount[0]?.c}`);
console.log(`\n  Tier distribution:`);
for (const row of tierDist) {
  console.log(`    ${row.tier}: ${row.c}`);
}

console.log("\n=== Done! ===");
