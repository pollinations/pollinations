#!/usr/bin/env npx tsx
/**
 * Full GitHub account audit for all D1 users.
 *
 * Scans GitHub REST account state directly to detect deleted accounts and
 * renamed usernames, then applies those updates to D1.
 *
 * Runs in two phases:
 *   audit  — scan all users via GitHub REST API, save results to /tmp/github-audit-<env>.json
 *   apply  — apply changes from the saved report: ban deleted, update renamed usernames
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/audit-github-accounts.ts audit --env production
 *   npx tsx scripts/user-pipeline/audit-github-accounts.ts audit --env production --resume
 *   npx tsx scripts/user-pipeline/audit-github-accounts.ts audit --env production --limit 100
 *   npx tsx scripts/user-pipeline/audit-github-accounts.ts apply --env production
 *   npx tsx scripts/user-pipeline/audit-github-accounts.ts apply --env production --no-dryRun
 *
 * Environment variables:
 *   GITHUB_TOKEN                - PAT for GitHub API (5,000 req/hr)
 *   GITHUB_APP_ID               - GitHub App ID (15,000 req/hr)
 *   GITHUB_APP_PRIVATE_KEY_PATH - Path to .pem private key
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { boolean, command, number, run, string } from "@drizzle-team/brocli";
import { executeD1, queryD1 } from "./shared/d1.ts";
import { githubRestRequest } from "./shared/github.ts";
import { banUsersByGithubIds } from "./shared/github-identity.ts";

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
const D1_WRITE_BATCH_SIZE = 50;

function getReportPath(env: string): string {
    return `/tmp/github-audit-${env}.json`;
}

function saveReport(report: AuditReport, path: string): void {
    report.updatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(report, null, 2));
}

function loadReport(env: string): AuditReport {
    const reportPath = getReportPath(env);
    if (!existsSync(reportPath)) {
        console.error(`❌ No audit report found at ${reportPath}`);
        console.error("   Run 'audit' first.");
        process.exit(1);
    }
    return JSON.parse(readFileSync(reportPath, "utf-8"));
}

function describeGithubAuth(): string {
    if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY_PATH) {
        return "GitHub App";
    }
    const tokenStr = process.env.GITHUB_TOKENS || process.env.GITHUB_TOKEN;
    if (!tokenStr) {
        console.error(
            "❌ Set GITHUB_APP_ID+GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_TOKEN",
        );
        process.exit(1);
    }
    const tokenCount = tokenStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean).length;
    return tokenCount > 1 ? `${tokenCount} PATs` : "PAT";
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// GitHub usernames: alphanumeric + hyphens only
function sanitizeUsername(username: string): string {
    return username.replace(/[^a-zA-Z0-9-]/g, "");
}

function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, "");
}

// ── Audit command ──────────────────────────────────────────────

const auditCommand = command({
    name: "audit",
    desc: "Scan all D1 users via GitHub REST API — detect deleted and renamed accounts",
    options: {
        env: string().enum("staging", "production").default("production"),
        resume: boolean()
            .default(false)
            .desc("Resume from previous saved audit"),
        limit: number().desc("Max users to process (for testing)"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const authLabel = describeGithubAuth();
        console.log(`🔑 Using ${authLabel}`);

        const reportPath = getReportPath(env);
        let report: AuditReport;

        if (opts.resume && existsSync(reportPath)) {
            report = JSON.parse(readFileSync(reportPath, "utf-8"));
            console.log(
                `📋 Resuming: ${report.processedCount}/${report.totalUsers} already processed`,
            );
        } else {
            const countRows = queryD1(
                env,
                "SELECT COUNT(*) as count FROM user WHERE github_id IS NOT NULL;",
            );
            const totalUsers = Number(countRows[0]?.count) || 0;
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
        for (const r of report.results) stats[r.status]++;

        let baseDelayMs = 750;
        let detectedLimit = false;

        console.log(`\n🔍 Auditing users (env: ${env})...\n`);

        while (newlyProcessed < maxToProcess) {
            const users = queryD1(
                env,
                `SELECT id, github_id, github_username FROM user WHERE github_id IS NOT NULL ORDER BY github_id LIMIT ${D1_BATCH_SIZE} OFFSET ${offset};`,
            ) as D1User[];

            if (users.length === 0) break;
            offset += users.length;

            for (const user of users) {
                if (newlyProcessed >= maxToProcess) break;
                if (processedIds.has(user.github_id)) continue;

                const result = await githubRestRequest<{ login?: string }>(
                    `https://api.github.com/user/${user.github_id}`,
                    { userAgent: "pollinations-github-audit" },
                );
                const rateLimitTotal = result.total ?? 0;

                if (!detectedLimit && rateLimitTotal > 0) {
                    detectedLimit = true;
                    baseDelayMs = Math.ceil(
                        (3600 / rateLimitTotal) * 1.1 * 1000,
                    );
                    const rps = (1000 / baseDelayMs).toFixed(1);
                    console.log(
                        `  ⚡ Rate limit: ${rateLimitTotal}/hr → ${rps} req/sec\n`,
                    );
                }

                let entry: AuditEntry;
                if (result.status === 200 && result.data?.login) {
                    const currentLogin = result.data.login;
                    if (
                        currentLogin.toLowerCase() ===
                        (user.github_username || "").toLowerCase()
                    ) {
                        entry = {
                            userId: user.id,
                            githubId: user.github_id,
                            d1Username: user.github_username,
                            currentUsername: currentLogin,
                            status: "ok",
                        };
                        stats.ok++;
                    } else {
                        entry = {
                            userId: user.id,
                            githubId: user.github_id,
                            d1Username: user.github_username,
                            currentUsername: currentLogin,
                            status: "renamed",
                        };
                        stats.renamed++;
                        console.log(
                            `  🔄 Renamed: ${user.github_username} → ${currentLogin} (ID: ${user.github_id})`,
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
                }

                report.results.push(entry);
                report.processedCount++;
                newlyProcessed++;

                if ((result.remaining ?? 5000) < 100) {
                    const waitMs = Math.max(
                        (result.reset ?? 0) * 1000 - Date.now() + 1000,
                        0,
                    );
                    if (waitMs > 0) {
                        saveReport(report, reportPath);
                        console.log(
                            `\n⏳ Rate limit low, pausing ${Math.ceil(waitMs / 1000)}s...\n`,
                        );
                        await sleep(waitMs);
                    }
                } else if ((result.remaining ?? 5000) < 500) {
                    await sleep(baseDelayMs * 3);
                } else {
                    await sleep(baseDelayMs);
                }

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

const applyCommand = command({
    name: "apply",
    desc: "Apply audit results: ban deleted accounts, update renamed usernames in D1",
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
        console.log(
            `   Mode: ${opts.dryRun ? "DRY RUN" : "LIVE — changes will be applied"}\n`,
        );

        // Ban deleted accounts via shared helper
        if (deleted.length > 0) {
            console.log(`\n🚫 Banning ${deleted.length} deleted accounts...`);
            if (opts.dryRun) {
                for (const entry of deleted) {
                    console.log(
                        `   [dry] Would ban: ${entry.d1Username} (github_id: ${entry.githubId})`,
                    );
                }
            } else {
                const deletedIds = deleted.map((e) => e.githubId);
                const banned = banUsersByGithubIds(env, deletedIds);
                console.log(`   ✅ Banned ${banned} users`);
            }
        }

        // Update D1 usernames for renamed accounts
        if (renamed.length > 0) {
            console.log(
                `\n🔄 Updating ${renamed.length} renamed usernames in D1...`,
            );
            for (let i = 0; i < renamed.length; i += D1_WRITE_BATCH_SIZE) {
                const batch = renamed.slice(i, i + D1_WRITE_BATCH_SIZE);
                for (const entry of batch) {
                    if (typeof entry.currentUsername !== "string") continue;
                    const safeName = sanitizeUsername(entry.currentUsername);
                    if (opts.dryRun) {
                        console.log(
                            `   [dry] ${entry.d1Username} → ${safeName}`,
                        );
                    } else {
                        const ok = executeD1(
                            env,
                            `UPDATE user SET github_username = '${safeName}' WHERE id = '${sanitizeId(entry.userId)}';`,
                        );
                        if (ok) {
                            console.log(
                                `   ✅ ${entry.d1Username} → ${safeName}`,
                            );
                        } else {
                            console.error(
                                `   ❌ Failed: ${entry.d1Username} → ${safeName}`,
                            );
                        }
                    }
                }
            }
        }

        // Update APPS.md
        if (opts.updateApps && renamed.length > 0) {
            console.log(`\n📝 Checking APPS.md for username updates...`);
            const appsPath = `${process.cwd()}/../apps/APPS.md`;
            if (!existsSync(appsPath)) {
                console.error(`   ❌ APPS.md not found at ${appsPath}`);
            } else {
                const lines = readFileSync(appsPath, "utf-8").split("\n");
                const renamedById = new Map(
                    renamed.flatMap((e) =>
                        typeof e.currentUsername === "string"
                            ? [
                                  [
                                      e.githubId,
                                      {
                                          old: e.d1Username,
                                          current: e.currentUsername,
                                      },
                                  ] as const,
                              ]
                            : [],
                    ),
                );
                let appsUpdated = 0;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.startsWith("|") || line.startsWith("| ---"))
                        continue;
                    const cols = line.split("|");
                    const githubId = Number.parseInt(cols[9]?.trim() ?? "", 10);
                    if (Number.isNaN(githubId)) continue;
                    const rename = renamedById.get(githubId);
                    if (!rename) continue;
                    const newCol = cols[8].replace(
                        /@\S+/,
                        `@${rename.current}`,
                    );
                    if (cols[8] !== newCol) {
                        cols[8] = newCol;
                        lines[i] = cols.join("|");
                        appsUpdated++;
                        console.log(
                            `   ${opts.dryRun ? "[dry] " : "✅ "}APPS.md: @${rename.old} → @${rename.current}`,
                        );
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

        console.log(`🔄 Retrying ${errors.length} errored entries...`);
        let fixed = 0;

        for (const entry of errors) {
            const result = await githubRestRequest<{ login?: string }>(
                `https://api.github.com/user/${entry.githubId}`,
                { userAgent: "pollinations-github-audit" },
            );

            if (result.status === 200 && result.data?.login) {
                if (
                    result.data.login.toLowerCase() ===
                    (entry.d1Username || "").toLowerCase()
                ) {
                    entry.status = "ok";
                    entry.currentUsername = result.data.login;
                    delete entry.error;
                    console.log(
                        `   ✅ OK: ${entry.d1Username} (${entry.githubId})`,
                    );
                } else {
                    entry.status = "renamed";
                    entry.currentUsername = result.data.login;
                    delete entry.error;
                    console.log(
                        `   🔄 Renamed: ${entry.d1Username} → ${result.data.login} (${entry.githubId})`,
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

run([auditCommand, applyCommand, retryCommand]);
