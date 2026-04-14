/**
 * GitHub Users Cleanup Script
 *
 * Audits all D1 users with a github_id against the GitHub API.
 * Detects renamed accounts (updates username) and deleted accounts (flags for review).
 * Optionally updates APPS.md with corrected usernames.
 *
 * Usage:
 *   npx tsx scripts/cleanup-github-users.ts audit --env production
 *   npx tsx scripts/cleanup-github-users.ts audit --env production --resume
 *   npx tsx scripts/cleanup-github-users.ts audit --env production --limit 50
 *   npx tsx scripts/cleanup-github-users.ts apply --env production
 *   npx tsx scripts/cleanup-github-users.ts apply --env production --no-dryRun
 *
 * Environment variables:
 *   CLOUDFLARE_API_TOKEN  - Required for D1 access via wrangler
 *   CLOUDFLARE_ACCOUNT_ID - Required for D1 access via wrangler
 *   GITHUB_TOKEN          - Required for GitHub API (5000 req/hr)
 *   GITHUB_APP_ID         - GitHub App ID (for 15k/hr Enterprise rate limit)
 *   GITHUB_APP_PRIVATE_KEY_PATH - Path to .pem private key
 */

import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { boolean, command, number, run, string } from "@drizzle-team/brocli";

type Environment = "staging" | "production";

interface D1User {
    id: string;
    github_id: number;
    github_username: string;
}

interface AuditEntry {
    userId: string;
    githubId: number;
    d1Username: string;
    currentUsername?: string;
    status: "ok" | "renamed" | "deleted" | "error";
    error?: string;
}

interface AuditReport {
    env: string;
    startedAt: string;
    updatedAt: string;
    totalUsers: number;
    processedCount: number;
    results: AuditEntry[];
}

const D1_BATCH_SIZE = 500;

function getReportPath(env: string): string {
    return `/tmp/github-users-audit-${env}.json`;
}

function queryD1(env: Environment, sql: string): string {
    const envFlag = env === "production" ? "--env production" : "--env staging";
    const cmd = `npx wrangler d1 execute DB --remote ${envFlag} --command "${sql}" --json`;

    try {
        return execSync(cmd, {
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "inherit"],
        });
    } catch (error) {
        console.error(
            "D1 query failed:",
            error instanceof Error ? error.message : String(error),
        );
        throw error;
    }
}

function parseD1Results(result: string): D1User[] {
    try {
        const parsed = JSON.parse(result);
        return (parsed[0]?.results || parsed.results || []) as D1User[];
    } catch {
        console.error("Failed to parse D1 response");
        return [];
    }
}

function parseD1Count(result: string): number {
    try {
        const parsed = JSON.parse(result);
        const results = parsed[0]?.results || parsed.results || [];
        return results[0]?.count || 0;
    } catch {
        return 0;
    }
}

interface GitHubResult {
    login?: string;
    status: number;
    rateLimitRemaining: number;
    rateLimitReset: number;
    rateLimitTotal: number;
}

async function checkGitHubUser(
    githubId: number,
    token: string,
): Promise<GitHubResult> {
    const res = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "pollinations-cleanup",
        },
    });

    const rateLimitRemaining = Number.parseInt(
        res.headers.get("x-ratelimit-remaining") || "5000",
        10,
    );
    const rateLimitReset = Number.parseInt(
        res.headers.get("x-ratelimit-reset") || "0",
        10,
    );
    const rateLimitTotal = Number.parseInt(
        res.headers.get("x-ratelimit-limit") || "5000",
        10,
    );

    if (res.status === 200) {
        const data = (await res.json()) as { login: string };
        return {
            login: data.login,
            status: 200,
            rateLimitRemaining,
            rateLimitReset,
            rateLimitTotal,
        };
    }

    await res.text(); // consume body
    return {
        status: res.status,
        rateLimitRemaining,
        rateLimitReset,
        rateLimitTotal,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveReport(report: AuditReport, path: string): void {
    report.updatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(report, null, 2));
}

// ── GitHub App auth (15k/hr on Enterprise Cloud) ─────────────

function generateJWT(appId: string, privateKey: string): string {
    const header = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
        JSON.stringify({ iat: now - 60, exp: now + 10 * 60, iss: appId }),
    ).toString("base64url");
    const signature = crypto
        .sign("SHA256", Buffer.from(`${header}.${payload}`), privateKey)
        .toString("base64url");
    return `${header}.${payload}.${signature}`;
}

async function getInstallationToken(
    appId: string,
    privateKey: string,
): Promise<{ token: string; expiresAt: number }> {
    const jwt = generateJWT(appId, privateKey);

    // Find first installation
    const installRes = await fetch("https://api.github.com/app/installations", {
        headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "pollinations-audit",
        },
    });
    const installations = (await installRes.json()) as {
        id: number;
        account: { login: string };
    }[];
    if (installations.length === 0) {
        throw new Error(
            "No installations found — install the app on an org first",
        );
    }
    const installationId = installations[0].id;

    // Get token
    const tokenRes = await fetch(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "pollinations-audit",
            },
        },
    );
    const tokenData = (await tokenRes.json()) as {
        token: string;
        expires_at: string;
    };
    // Refresh 5 min before expiry
    const expiresAt = new Date(tokenData.expires_at).getTime() - 5 * 60 * 1000;
    return { token: tokenData.token, expiresAt };
}

interface TokenProvider {
    getToken: () => Promise<string>;
    label: string;
}

async function createTokenProvider(): Promise<TokenProvider> {
    const appId = process.env.GITHUB_APP_ID;
    const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

    // Prefer GitHub App (15k/hr) over PAT (5k/hr)
    if (appId && keyPath && existsSync(keyPath)) {
        const privateKey = readFileSync(keyPath, "utf-8");
        let current = await getInstallationToken(appId, privateKey);
        console.log(
            `🔑 GitHub App auth (15k/hr) — token expires ${new Date(current.expiresAt + 5 * 60 * 1000).toISOString()}`,
        );

        return {
            label: "GitHub App (15k/hr)",
            getToken: async () => {
                if (Date.now() >= current.expiresAt) {
                    console.log("  🔄 Refreshing installation token...");
                    current = await getInstallationToken(appId, privateKey);
                    console.log(
                        `  ✅ New token expires ${new Date(current.expiresAt + 5 * 60 * 1000).toISOString()}`,
                    );
                }
                return current.token;
            },
        };
    }

    // Fallback: PAT(s)
    const tokenStr = process.env.GITHUB_TOKENS || process.env.GITHUB_TOKEN;
    if (!tokenStr) {
        console.error(
            "❌ Set GITHUB_APP_ID+GITHUB_APP_PRIVATE_KEY_PATH (15k/hr) or GITHUB_TOKEN (5k/hr)",
        );
        process.exit(1);
    }
    const tokens = tokenStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    let tokenIndex = 0;
    const label =
        tokens.length > 1
            ? `${tokens.length} PATs (~${tokens.length * 5000}/hr)`
            : "PAT (5k/hr)";
    console.log(`🔑 Using ${label}`);

    return {
        label,
        getToken: async () => {
            const t = tokens[tokenIndex % tokens.length];
            tokenIndex++;
            return t;
        },
    };
}

// GitHub usernames: alphanumeric + hyphens, max 39 chars
function sanitizeUsername(username: string): string {
    return username.replace(/[^a-zA-Z0-9-]/g, "");
}

function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, "");
}

// ── Audit command ──────────────────────────────────────────────

const auditCommand = command({
    name: "audit",
    desc: "Audit all D1 users against GitHub API — detect renames and deletions",
    options: {
        env: string().enum("staging", "production").default("production"),
        resume: boolean()
            .default(false)
            .desc("Resume from previous saved audit"),
        limit: number().desc("Max users to process (for testing)"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;

        const tokenProvider = await createTokenProvider();

        const reportPath = getReportPath(env);
        let report: AuditReport;

        if (opts.resume && existsSync(reportPath)) {
            report = JSON.parse(readFileSync(reportPath, "utf-8"));
            console.log(
                `📋 Resuming audit: ${report.processedCount}/${report.totalUsers} already processed`,
            );
        } else {
            const countResult = queryD1(
                env,
                "SELECT COUNT(*) as count FROM user WHERE github_id IS NOT NULL;",
            );
            const totalUsers = parseD1Count(countResult);
            console.log(`📊 Total D1 users with github_id: ${totalUsers}`);

            report = {
                env,
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalUsers,
                processedCount: 0,
                results: [],
            };
        }

        const processedIds = new Set(report.results.map((r) => r.githubId));
        const maxToProcess = opts.limit || Number.POSITIVE_INFINITY;
        let newlyProcessed = 0;
        let offset = 0;
        const stats = { ok: 0, renamed: 0, deleted: 0, error: 0 };

        // Tally stats from resumed results
        for (const r of report.results) {
            stats[r.status]++;
        }

        // Auto-detect rate limit from first request
        let baseDelayMs = 750; // conservative default
        let detectedLimit = false;

        console.log(`\n🔍 Auditing users (env: ${env})...\n`);

        while (newlyProcessed < maxToProcess) {
            const sql = `SELECT id, github_id, github_username FROM user WHERE github_id IS NOT NULL ORDER BY github_id LIMIT ${D1_BATCH_SIZE} OFFSET ${offset};`;
            const users = parseD1Results(queryD1(env, sql));

            if (users.length === 0) break;
            offset += users.length;

            for (const user of users) {
                if (newlyProcessed >= maxToProcess) break;
                if (processedIds.has(user.github_id)) continue;

                const result = await checkGitHubUser(
                    user.github_id,
                    await tokenProvider.getToken(),
                );

                // Auto-tune delay based on actual rate limit
                if (!detectedLimit && result.rateLimitTotal > 0) {
                    detectedLimit = true;
                    // 3600s / limit = seconds per request, with 10% safety margin
                    baseDelayMs = Math.ceil(
                        (3600 / result.rateLimitTotal) * 1.1 * 1000,
                    );
                    const rps = (1000 / baseDelayMs).toFixed(1);
                    console.log(
                        `  ⚡ Rate limit: ${result.rateLimitTotal}/hr (${tokenProvider.label}) → ${rps} req/sec (${baseDelayMs}ms delay)\n`,
                    );
                }

                let entry: AuditEntry;
                if (result.status === 200 && result.login) {
                    if (
                        result.login.toLowerCase() ===
                        (user.github_username || "").toLowerCase()
                    ) {
                        entry = {
                            userId: user.id,
                            githubId: user.github_id,
                            d1Username: user.github_username,
                            currentUsername: result.login,
                            status: "ok",
                        };
                        stats.ok++;
                    } else {
                        entry = {
                            userId: user.id,
                            githubId: user.github_id,
                            d1Username: user.github_username,
                            currentUsername: result.login,
                            status: "renamed",
                        };
                        stats.renamed++;
                        console.log(
                            `  🔄 Renamed: ${user.github_username} → ${result.login} (ID: ${user.github_id})`,
                        );
                    }
                } else if (result.status === 404) {
                    entry = {
                        userId: user.id,
                        githubId: user.github_id,
                        d1Username: user.github_username,
                        status: "deleted",
                    };
                    stats.deleted++;
                    console.log(
                        `  ❌ Deleted: ${user.github_username} (ID: ${user.github_id})`,
                    );
                } else {
                    entry = {
                        userId: user.id,
                        githubId: user.github_id,
                        d1Username: user.github_username,
                        status: "error",
                        error: `HTTP ${result.status}`,
                    };
                    stats.error++;
                    console.log(
                        `  ⚠️  Error: ${user.github_username} (ID: ${user.github_id}) → HTTP ${result.status}`,
                    );
                }

                report.results.push(entry);
                report.processedCount++;
                newlyProcessed++;

                // Rate limit handling — adaptive based on detected limit
                if (result.rateLimitRemaining < 100) {
                    const waitMs =
                        result.rateLimitReset * 1000 - Date.now() + 1000;
                    if (waitMs > 0) {
                        saveReport(report, reportPath);
                        console.log(
                            `\n⏳ Rate limit low (${result.rateLimitRemaining} left), pausing ${Math.ceil(waitMs / 1000)}s...\n`,
                        );
                        await sleep(waitMs);
                    }
                } else if (result.rateLimitRemaining < 500) {
                    await sleep(baseDelayMs * 3);
                } else {
                    await sleep(baseDelayMs);
                }

                // Save progress every 100 users
                if (newlyProcessed % 100 === 0) {
                    saveReport(report, reportPath);
                    console.log(
                        `  📝 Progress: ${report.processedCount}/${report.totalUsers} | ok:${stats.ok} renamed:${stats.renamed} deleted:${stats.deleted} err:${stats.error}`,
                    );
                }
            }
        }

        saveReport(report, reportPath);

        console.log(`\n${"═".repeat(50)}`);
        console.log(`📊 Audit Summary (${env})`);
        console.log(`${"═".repeat(50)}`);
        console.log(
            `   Processed: ${report.processedCount} / ${report.totalUsers}`,
        );
        console.log(`   ✅ OK:      ${stats.ok}`);
        console.log(`   🔄 Renamed: ${stats.renamed}`);
        console.log(`   ❌ Deleted: ${stats.deleted}`);
        console.log(`   ⚠️  Errors:  ${stats.error}`);
        console.log(`\n📄 Report: ${reportPath}`);

        if (stats.renamed > 0 || stats.deleted > 0) {
            console.log(
                `\n💡 Run 'apply --env ${env}' to preview changes (dry-run by default)`,
            );
        }
    },
});

// ── Apply command ──────────────────────────────────────────────

const D1_WRITE_BATCH_SIZE = 50;

function loadReport(env: string): AuditReport {
    const reportPath = getReportPath(env);
    if (!existsSync(reportPath)) {
        console.error(`❌ No audit report found at ${reportPath}`);
        console.error("   Run 'audit' first.");
        process.exit(1);
    }
    return JSON.parse(readFileSync(reportPath, "utf-8"));
}

const applyCommand = command({
    name: "apply",
    desc: "Apply changes from audit report — rename usernames and ban deleted accounts",
    options: {
        env: string().enum("staging", "production").default("production"),
        updateApps: boolean()
            .default(true)
            .desc("Also update APPS.md usernames"),
        dryRun: boolean()
            .default(true)
            .desc("Show what would change without applying"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const report = loadReport(env);
        const renamed = report.results.filter((r) => r.status === "renamed");
        const deleted = report.results.filter((r) => r.status === "deleted");

        console.log(
            `📋 Loaded audit report (${report.processedCount} users processed)`,
        );
        console.log(`   🔄 Renamed: ${renamed.length}`);
        console.log(`   🚫 To ban:  ${deleted.length}`);
        if (opts.dryRun) console.log(`   Mode: DRY RUN\n`);
        else console.log(`   Mode: LIVE — changes will be applied\n`);

        // ── Update D1 usernames for renamed users (batched) ──
        if (renamed.length > 0) {
            console.log(
                `\n🔄 Updating ${renamed.length} renamed users in D1...`,
            );
            for (let i = 0; i < renamed.length; i += D1_WRITE_BATCH_SIZE) {
                const batch = renamed.slice(i, i + D1_WRITE_BATCH_SIZE);
                for (const entry of batch) {
                    const safeName = sanitizeUsername(entry.currentUsername!);
                    if (opts.dryRun) {
                        console.log(
                            `   [dry] ${entry.d1Username} → ${safeName} (${entry.userId})`,
                        );
                    } else {
                        try {
                            queryD1(
                                env,
                                `UPDATE user SET github_username = '${safeName}' WHERE id = '${sanitizeId(entry.userId)}';`,
                            );
                            console.log(
                                `   ✅ ${entry.d1Username} → ${safeName}`,
                            );
                        } catch {
                            console.error(
                                `   ❌ Failed: ${entry.d1Username} → ${safeName}`,
                            );
                        }
                    }
                }
                if (!opts.dryRun && i + D1_WRITE_BATCH_SIZE < renamed.length) {
                    console.log(
                        `   📝 Batch ${Math.floor(i / D1_WRITE_BATCH_SIZE) + 1}/${Math.ceil(renamed.length / D1_WRITE_BATCH_SIZE)} done`,
                    );
                }
            }
        }

        // ── Ban deleted GitHub accounts (no deletion from DB) ──
        if (deleted.length > 0) {
            console.log(
                `\n🚫 Banning ${deleted.length} deleted accounts in D1...`,
            );
            let banned = 0;
            let failed = 0;
            for (let i = 0; i < deleted.length; i += D1_WRITE_BATCH_SIZE) {
                const batch = deleted.slice(i, i + D1_WRITE_BATCH_SIZE);
                for (const entry of batch) {
                    if (opts.dryRun) {
                        console.log(
                            `   [dry] Would ban: ${entry.d1Username} (github_id: ${entry.githubId})`,
                        );
                    } else {
                        try {
                            queryD1(
                                env,
                                `UPDATE user SET banned = 1, ban_reason = 'github_account_deleted' WHERE id = '${sanitizeId(entry.userId)}';`,
                            );
                            banned++;
                        } catch {
                            console.error(
                                `   ❌ Failed to ban: ${entry.d1Username}`,
                            );
                            failed++;
                        }
                    }
                }
                if (!opts.dryRun) {
                    const batchNum = Math.floor(i / D1_WRITE_BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(
                        deleted.length / D1_WRITE_BATCH_SIZE,
                    );
                    console.log(
                        `   📝 Batch ${batchNum}/${totalBatches} done (${banned} banned, ${failed} failed)`,
                    );
                }
            }
            if (!opts.dryRun) {
                console.log(`   ✅ Banned ${banned} users, ${failed} failures`);
            }
        }

        // ── Update APPS.md ──
        if (opts.updateApps && renamed.length > 0) {
            console.log(`\n📝 Checking APPS.md for username updates...`);
            const appsPath = `${process.cwd()}/../apps/APPS.md`;

            if (!existsSync(appsPath)) {
                console.error(`   ❌ APPS.md not found at ${appsPath}`);
            } else {
                const content = readFileSync(appsPath, "utf-8");
                const lines = content.split("\n");

                const renamedById = new Map<
                    number,
                    { old: string; current: string }
                >();
                for (const entry of renamed) {
                    renamedById.set(entry.githubId, {
                        old: entry.d1Username,
                        current: entry.currentUsername!,
                    });
                }

                let appsUpdated = 0;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.startsWith("|") || line.startsWith("| ---")) {
                        continue;
                    }

                    const cols = line.split("|");
                    const userIdStr = cols[9]?.trim();
                    if (!userIdStr) continue;
                    const githubId = Number.parseInt(userIdStr, 10);
                    if (Number.isNaN(githubId)) continue;

                    const rename = renamedById.get(githubId);
                    if (!rename) continue;

                    const oldCol = cols[8];
                    const newCol = oldCol.replace(/@\S+/, `@${rename.current}`);

                    if (oldCol !== newCol) {
                        cols[8] = newCol;
                        lines[i] = cols.join("|");
                        appsUpdated++;

                        if (opts.dryRun) {
                            console.log(
                                `   [dry] APPS.md: ${oldCol.trim()} → @${rename.current}`,
                            );
                        } else {
                            console.log(
                                `   ✅ APPS.md: ${oldCol.trim()} → @${rename.current}`,
                            );
                        }
                    }
                }

                if (appsUpdated > 0 && !opts.dryRun) {
                    writeFileSync(appsPath, lines.join("\n"));
                    console.log(
                        `   📝 Wrote ${appsUpdated} updates to APPS.md`,
                    );
                } else if (appsUpdated === 0) {
                    console.log(`   No renamed users found in APPS.md`);
                }
            }
        }

        console.log();
        if (opts.dryRun) {
            console.log(`💡 Run with --no-dryRun to apply changes for real`);
        } else {
            console.log(`✅ All changes applied!`);
        }
    },
});

// ── Split command ──────────────────────────────────────────────

const splitCommand = command({
    name: "split",
    desc: "Split audit report into separate files (renamed, deleted, errors)",
    options: {
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const report = loadReport(env);

        const renamed = report.results.filter((r) => r.status === "renamed");
        const deleted = report.results.filter((r) => r.status === "deleted");
        const errors = report.results.filter((r) => r.status === "error");

        const dir = `${process.cwd()}/scripts`;

        writeFileSync(
            `${dir}/audit-renamed.json`,
            JSON.stringify(renamed, null, 2),
        );
        writeFileSync(
            `${dir}/audit-deleted.json`,
            JSON.stringify(deleted, null, 2),
        );
        writeFileSync(
            `${dir}/audit-errors.json`,
            JSON.stringify(errors, null, 2),
        );

        console.log(`📂 Split audit report into:`);
        console.log(
            `   scripts/audit-renamed.json  (${renamed.length} entries)`,
        );
        console.log(
            `   scripts/audit-deleted.json  (${deleted.length} entries)`,
        );
        console.log(
            `   scripts/audit-errors.json   (${errors.length} entries)`,
        );
    },
});

// ── Retry command ──────────────────────────────────────────────

const retryCommand = command({
    name: "retry",
    desc: "Retry errored entries from the audit report",
    options: {
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const reportPath = getReportPath(env);
        const report = loadReport(env);
        const errors = report.results.filter((r) => r.status === "error");

        if (errors.length === 0) {
            console.log("✅ No errors to retry!");
            return;
        }

        console.log(`🔄 Retrying ${errors.length} errored entries...\n`);

        const tokenProvider = await createTokenProvider();
        let fixed = 0;

        for (const entry of errors) {
            const result = await checkGitHubUser(
                entry.githubId,
                await tokenProvider.getToken(),
            );

            if (result.status === 200 && result.login) {
                if (
                    result.login.toLowerCase() ===
                    (entry.d1Username || "").toLowerCase()
                ) {
                    entry.status = "ok";
                    entry.currentUsername = result.login;
                    delete entry.error;
                    console.log(
                        `   ✅ OK: ${entry.d1Username} (${entry.githubId})`,
                    );
                } else {
                    entry.status = "renamed";
                    entry.currentUsername = result.login;
                    delete entry.error;
                    console.log(
                        `   🔄 Renamed: ${entry.d1Username} → ${result.login} (${entry.githubId})`,
                    );
                }
                fixed++;
            } else if (result.status === 404) {
                entry.status = "deleted";
                delete entry.error;
                console.log(
                    `   ❌ Deleted: ${entry.d1Username} (${entry.githubId})`,
                );
                fixed++;
            } else {
                console.log(
                    `   ⚠️  Still error: ${entry.d1Username} (${entry.githubId}) → HTTP ${result.status}`,
                );
                entry.error = `HTTP ${result.status}`;
            }

            await sleep(750);
        }

        saveReport(report, reportPath);

        const remaining = report.results.filter(
            (r) => r.status === "error",
        ).length;
        console.log(
            `\n📊 Retry results: ${fixed} resolved, ${remaining} still errored`,
        );
        console.log(`📄 Updated report: ${reportPath}`);
    },
});

run([auditCommand, applyCommand, splitCommand, retryCommand]);
