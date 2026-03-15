/**
 * Apply Abuse Blocks Script
 *
 * Reads abuse-report.csv and downgrades all users with "block" action to microbe tier.
 * Processes in batches with rate limiting to avoid D1 overload.
 *
 * Usage:
 *   npx tsx scripts/apply-abuse-blocks.ts --env production
 *   npx tsx scripts/apply-abuse-blocks.ts --env production --dry-run
 *   npx tsx scripts/apply-abuse-blocks.ts --env production --batch-size 50 --delay 1000
 *
 * Options:
 *   --env          Environment (staging|production), default: production
 *   --dry-run      Show what would be done without making changes
 *   --batch-size   Number of users to process per batch (default: 100)
 *   --delay        Delay in ms between batches (default: 500)
 *   --report       Path to abuse report CSV (default: ./abuse-report.csv)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { boolean, command, number, run, string } from "@drizzle-team/brocli";

type Environment = "staging" | "production";

interface AbuseReportRow {
    action: string;
    score: number;
    email: string;
    github_username: string;
    signals: string;
    tier: string;
    registered: string;
}

function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

function parseCSV(content: string): AbuseReportRow[] {
    const lines = content.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",");

    return lines.slice(1).flatMap((line) => {
        const values = parseCSVLine(line);
        if (values.length < headers.length) return [];

        const row: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
            row[headers[i]] = values[i] || "";
        }

        return {
            action: row.action || "",
            score: parseInt(row.score, 10) || 0,
            email: row.email || "",
            github_username: row.github_username || "",
            signals: row.signals || "",
            tier: row.tier || "",
            registered: row.registered || "",
        };
    });
}

function queryD1(env: Environment, sql: string): string {
    const cmd = `npx wrangler d1 execute DB --remote --env ${env} --command "${sql}" --json`;

    try {
        return execSync(cmd, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 100 * 1024 * 1024,
        });
    } catch (error) {
        console.error(
            "D1 query failed:",
            error instanceof Error ? error.message : String(error),
        );
        throw error;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function confirm(message: string): Promise<boolean> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(`${message} (y/N) `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === "y");
        });
    });
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function validateEmail(email: string): boolean {
    return EMAIL_RE.test(email) && email.length <= 254;
}

const applyBlocksCommand = command({
    name: "apply-blocks",
    desc: "Downgrade blocked users to microbe tier",
    options: {
        env: string()
            .alias("e")
            .enum("staging", "production")
            .default("production"),
        "dry-run": boolean()
            .alias("d")
            .default(false)
            .desc("Show what would be done without making changes"),
        "batch-size": number().alias("b").default(100).desc("Users per batch"),
        delay: number().default(500).desc("Delay between batches in ms"),
        report: string()
            .alias("r")
            .default("./abuse-report.csv")
            .desc("Path to abuse report"),
        tier: string()
            .alias("t")
            .desc(
                "Only process users of this tier (e.g., spore, seed, flower)",
            ),
        max: number()
            .alias("m")
            .desc("Maximum number of users to process (for testing)"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const reportPath = opts.report;

        console.log(`\n🚫 Apply Abuse Blocks`);
        console.log(`${"=".repeat(50)}`);
        console.log(`📋 Report: ${reportPath}`);
        console.log(`🌍 Environment: ${env}`);
        console.log(`📦 Batch size: ${opts["batch-size"]}`);
        console.log(`⏱️  Delay: ${opts.delay}ms`);
        if (opts.tier) {
            console.log(`🎯 Tier filter: ${opts.tier} only`);
        }
        if (opts["dry-run"]) {
            console.log(`🔍 Mode: DRY RUN (no changes will be made)\n`);
        }

        if (!existsSync(reportPath)) {
            console.error(`❌ Report file not found: ${reportPath}`);
            process.exit(1);
        }

        const content = readFileSync(reportPath, "utf-8");
        const allRows = parseCSV(content);
        console.log(`📊 Total rows in report: ${allRows.length}`);

        let blockedUsers = allRows.filter((row) => row.action === "block");
        console.log(`🔴 Users to block: ${blockedUsers.length}`);

        if (opts.tier) {
            const beforeCount = blockedUsers.length;
            blockedUsers = blockedUsers.filter((row) => row.tier === opts.tier);
            console.log(
                `🎯 After tier filter (${opts.tier}): ${blockedUsers.length} (excluded ${beforeCount - blockedUsers.length})`,
            );
        }

        let usersToDowngrade = blockedUsers.filter(
            (row) => row.tier !== "microbe",
        );
        console.log(`⬇️  Users needing downgrade: ${usersToDowngrade.length}`);

        if (opts.max && opts.max < usersToDowngrade.length) {
            console.log(`🔢 Limiting to first ${opts.max} users (--max)`);
            usersToDowngrade = usersToDowngrade.slice(0, opts.max);
        }
        console.log(
            `✅ Already microbe (skipped): ${blockedUsers.length - usersToDowngrade.length}`,
        );

        if (usersToDowngrade.length === 0) {
            console.log(`\n✅ No users to downgrade!`);
            return;
        }

        if (!opts["dry-run"] && env === "production") {
            const ok = await confirm(
                `\n⚠️  About to downgrade ${usersToDowngrade.length} users to microbe in PRODUCTION. Continue?`,
            );
            if (!ok) {
                console.log("❌ Aborted.");
                return;
            }
        }

        const batches = Math.ceil(usersToDowngrade.length / opts["batch-size"]);
        let processed = 0;
        let succeeded = 0;
        let failed = 0;

        console.log(`\n🔄 Processing ${batches} batches...\n`);

        for (let b = 0; b < batches; b++) {
            const start = b * opts["batch-size"];
            const end = Math.min(
                start + opts["batch-size"],
                usersToDowngrade.length,
            );
            const batch = usersToDowngrade.slice(start, end);

            console.log(
                `⚡ Batch ${b + 1}/${batches} (${batch.length} users)...`,
            );

            if (!opts["dry-run"]) {
                for (const user of batch) {
                    try {
                        if (!validateEmail(user.email)) {
                            console.error(
                                `   ⚠️  Skipped invalid email: ${user.email}`,
                            );
                            failed++;
                            processed++;
                            continue;
                        }
                        const safeEmail = user.email.replace(/'/g, "''");
                        const sql = `UPDATE user SET tier = 'microbe', tier_balance = 0 WHERE email = '${safeEmail}'`;
                        queryD1(env, sql);
                        succeeded++;
                    } catch {
                        console.error(`   ❌ Failed: ${user.email}`);
                        failed++;
                    }
                    processed++;

                    if (processed % 10 === 0) {
                        process.stdout.write(
                            `   📊 ${processed}/${usersToDowngrade.length}\r`,
                        );
                    }
                }
            } else {
                for (const user of batch) {
                    console.log(
                        `   📝 Would downgrade: ${user.email} (${user.tier} → microbe)`,
                    );
                    processed++;
                }
            }

            if (b < batches - 1) {
                await sleep(opts.delay);
            }
        }

        console.log(`\n${"=".repeat(50)}`);
        console.log(`✅ Processing complete!`);
        console.log(`   📊 Total processed: ${processed}`);
        if (!opts["dry-run"]) {
            console.log(`   ✅ Succeeded: ${succeeded}`);
            console.log(`   ❌ Failed: ${failed}`);
        }
    },
});

run([applyBlocksCommand]);
