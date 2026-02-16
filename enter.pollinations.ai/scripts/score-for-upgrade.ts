#!/usr/bin/env npx tsx
/**
 * Tier Upgrade Scorer
 *
 * Uses the shared LLM scoring pipeline to evaluate user legitimacy and upgrade tiers.
 * Replaces the Python-based user_upgrade_spore_to_seed.py and user_validate_github_profile.py.
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/score-for-upgrade.ts upgrade --dry-run --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --model claude --verbose
 *
 * Tier thresholds (legitimacy score 0-100):
 *   Microbe (0-29)  - New/unverified account
 *   Spore   (30+)   - Basic legitimate account (~1 week old, has GitHub)
 *   Seed    (60+)   - Active developer with real activity
 *   Flower  (80+)   - Contributor with merged work in pollinations org
 */

import { execSync } from "node:child_process";
import { boolean, command, run, string } from "@drizzle-team/brocli";
import type { TierName } from "../src/tier-config.ts";
import { type ScoredUser, scoreUsers } from "./llm-scorer.ts";

// Tier hierarchy for comparison
const TIER_HIERARCHY: TierName[] = [
    "microbe",
    "spore",
    "seed",
    "flower",
    "nectar",
    "router",
];

function getTierRank(tier: string): number {
    return TIER_HIERARCHY.indexOf(tier as TierName);
}

// Legitimacy score -> target tier
const TIER_THRESHOLDS: Array<{ minScore: number; tier: TierName }> = [
    { minScore: 80, tier: "flower" },
    { minScore: 60, tier: "seed" },
    { minScore: 30, tier: "spore" },
];

function getTargetTier(score: number): TierName {
    for (const { minScore, tier } of TIER_THRESHOLDS) {
        if (score >= minScore) return tier;
    }
    return "microbe";
}

/**
 * Build the legitimacy scoring prompt for the LLM
 */
function buildLegitimacyPrompt(csvRows: string[]): string {
    return `Evaluate these users for account legitimacy. Score 0-100 (higher = more legitimate).

SIGNALS (use these codes):
aged=account >7 days old (+20)
active=has repos/commits/stars based on username patterns (+25)
organic=normal username/email pattern (+20)
github=has linked GitHub account (non-null username) (+15)
contributed=username appears to be a known open-source contributor (+30)
newacct=account <3 days old (-20)
suspicious=patterns matching abuse like gibberish names, disposable emails (-30)

SCORING GUIDE:
- 80-100: Established developer, real GitHub activity, organic patterns
- 60-79: Active developer, has repos/commits, normal patterns
- 30-59: Basic legitimate account, has GitHub, normal email
- 0-29: Very new, no GitHub, suspicious patterns, or gibberish

Output CSV: github,score,signals
johndeveloper,85,aged+active+organic+github
newuser123,25,newacct
realdev,65,aged+active+github

Use + to combine signals. Empty if no signals detected.

Data (github,email,registered,upgraded):
${csvRows.join("\n")}`;
}

/**
 * Build the D1 query for users eligible for upgrade evaluation.
 * Uses day-based slicing: all new users (last 24h) + 1/7th of older users.
 */
function buildUserQuery(): string {
    const weekday = new Date().getUTCDay(); // 0=Sun, 1=Mon, etc.
    const yesterday = Math.floor(Date.now() / 1000) - 86400;

    // Fetch users at microbe, spore, or seed tier (not already flower+)
    // New users first, then slice of older users
    // Use modulo-based slicing for even distribution
    return `
        SELECT email, github_username, created_at, tier FROM user
        WHERE tier IN ('microbe', 'spore', 'seed')
        AND (
            created_at > ${yesterday}
            OR (created_at <= ${yesterday} AND abs(created_at) % 7 = ${weekday})
        )
        ORDER BY created_at DESC
        LIMIT 5000
    `;
}

/**
 * Upgrade a user via tier-update-user.ts
 */
function upgradeUser(
    username: string,
    targetTier: TierName,
    env: string,
    dryRun: boolean,
): boolean {
    if (dryRun) {
        console.log(`  [DRY RUN] Would upgrade ${username} -> ${targetTier}`);
        return true;
    }

    try {
        const result = execSync(
            `npx tsx scripts/tier-update-user.ts update-tier --githubUsername "${username}" --tier ${targetTier} --env ${env}`,
            {
                encoding: "utf-8",
                cwd: process.cwd(),
                stdio: ["pipe", "pipe", "pipe"],
                timeout: 120_000,
            },
        );

        if (result.includes("SKIP_UPGRADE=true")) {
            console.log(`  ${username}: already at higher tier`);
            return true;
        }

        console.log(`  ${username}: upgraded to ${targetTier}`);
        return true;
    } catch (error) {
        console.error(
            `  ${username}: upgrade failed -`,
            error instanceof Error ? error.message : String(error),
        );
        return false;
    }
}

const upgradeCommand = command({
    name: "upgrade",
    desc: "Score users for legitimacy and upgrade tiers",
    options: {
        env: string().enum("staging", "production").default("production"),
        dryRun: boolean()
            .default(false)
            .desc("Show what would be done without making changes"),
        model: string().default("gemini").desc("LLM model to use"),
        chunkSize: string().default("100").desc("Users per API chunk"),
        verbose: boolean().default(false).desc("Show detailed scoring"),
        singleChunk: boolean()
            .default(false)
            .desc("Only process first chunk (testing)"),
    },
    handler: async (opts) => {
        const env = opts.env as string;
        const weekday = new Date().getUTCDay();
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        console.log("Tier Upgrade Scorer");
        console.log("=".repeat(50));
        console.log(`Environment: ${env}`);
        console.log(`Mode: ${opts.dryRun ? "DRY RUN" : "LIVE"}`);
        console.log(`Day slice: ${dayNames[weekday]} (${weekday}/7)`);
        console.log(`Model: ${opts.model}`);
        console.log();

        const scored = await scoreUsers({
            name: "tier-upgrade",
            userQuery: buildUserQuery(),
            buildPrompt: buildLegitimacyPrompt,
            chunkSize: parseInt(opts.chunkSize, 10),
            model: opts.model,
            singleChunk: opts.singleChunk,
            overlapSize: 0, // No overlap needed for legitimacy scoring
        });

        if (scored.length === 0) {
            console.log("No users to evaluate");
            return;
        }

        // Determine upgrades
        const upgrades: Array<{
            user: ScoredUser;
            targetTier: TierName;
        }> = [];

        for (const user of scored) {
            const targetTier = getTargetTier(user.score);
            const currentRank = getTierRank(user.tier);
            const targetRank = getTierRank(targetTier);

            // Only upgrade, never downgrade
            if (targetRank > currentRank && user.github_username) {
                upgrades.push({ user, targetTier });
            }
        }

        // Stats
        const tierCounts = {
            microbe: scored.filter((u) => getTargetTier(u.score) === "microbe")
                .length,
            spore: scored.filter((u) => getTargetTier(u.score) === "spore")
                .length,
            seed: scored.filter((u) => getTargetTier(u.score) === "seed")
                .length,
            flower: scored.filter((u) => getTargetTier(u.score) === "flower")
                .length,
        };

        console.log("\nScoring Summary:");
        console.log(`  Total evaluated: ${scored.length}`);
        console.log(
            `  Target microbe (<30): ${tierCounts.microbe}`,
        );
        console.log(
            `  Target spore (30-59): ${tierCounts.spore}`,
        );
        console.log(
            `  Target seed (60-79): ${tierCounts.seed}`,
        );
        console.log(
            `  Target flower (80+): ${tierCounts.flower}`,
        );
        console.log(`  Eligible for upgrade: ${upgrades.length}`);

        if (opts.verbose) {
            console.log("\nDetailed scores (first 30):");
            for (const user of scored.slice(0, 30)) {
                const target = getTargetTier(user.score);
                const arrow =
                    getTierRank(target) > getTierRank(user.tier) ? " ->" : "   ";
                console.log(
                    `  ${user.github_username || user.email} | score=${user.score} | ${user.tier}${arrow}${getTierRank(target) > getTierRank(user.tier) ? target : ""} | ${user.signals.join("+")}`,
                );
            }
        }

        if (upgrades.length === 0) {
            console.log("\nNo upgrades needed");
            return;
        }

        // Apply upgrades
        console.log(
            `\n${opts.dryRun ? "[DRY RUN] " : ""}Processing ${upgrades.length} upgrades...`,
        );

        let success = 0;
        let failed = 0;

        for (const { user, targetTier } of upgrades) {
            if (
                upgradeUser(
                    user.github_username!,
                    targetTier,
                    env,
                    opts.dryRun,
                )
            ) {
                success++;
            } else {
                failed++;
            }
        }

        console.log(`\nResults:`);
        console.log(`  Upgraded: ${success}`);
        console.log(`  Failed: ${failed}`);

        if (failed > 0) {
            process.exit(1);
        }
    },
});

run([upgradeCommand]);
