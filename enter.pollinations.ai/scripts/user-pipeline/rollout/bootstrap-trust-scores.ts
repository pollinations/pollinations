#!/usr/bin/env npx tsx
/**
 * One-time rollout helper: apply trust bootstrap semantics to existing users.
 *
 * Safe by default. Use --apply to write.
 *
 * This mirrors the trust bootstrap rules in
 * drizzle/0017_add_score_and_trust_score.sql:
 * - tier = microbe -> trust_score = 0
 * - tier in (spore, seed, flower, nectar, router) -> trust_score = 100
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/rollout/bootstrap-trust-scores.ts --env staging
 *   npx tsx scripts/user-pipeline/rollout/bootstrap-trust-scores.ts --env production --apply
 */

import { executeD1, queryD1 } from "../shared/d1.ts";

type Environment = "staging" | "production";

interface ParsedArgs {
    env: Environment;
    apply: boolean;
}

interface TrustBootstrapSummary {
    microbe_null: number | string | null;
    elevated_null: number | string | null;
    other_null: number | string | null;
    total_null: number | string | null;
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "staging";

    if (env !== "staging" && env !== "production") {
        console.error(
            `❌ Unsupported --env ${env}. Use --env staging or --env production.`,
        );
        process.exit(1);
    }

    return {
        env,
        apply: args.includes("--apply"),
    };
}

function fetchSummary(env: Environment): {
    microbeNull: number;
    elevatedNull: number;
    otherNull: number;
    totalNull: number;
} {
    const rows = queryD1(
        env,
        `SELECT
            SUM(CASE WHEN tier = 'microbe' AND trust_score IS NULL THEN 1 ELSE 0 END) AS microbe_null,
            SUM(CASE WHEN tier IN ('spore', 'seed', 'flower', 'nectar', 'router') AND trust_score IS NULL THEN 1 ELSE 0 END) AS elevated_null,
            SUM(CASE WHEN trust_score IS NULL AND (tier IS NULL OR tier NOT IN ('microbe', 'spore', 'seed', 'flower', 'nectar', 'router')) THEN 1 ELSE 0 END) AS other_null,
            SUM(CASE WHEN trust_score IS NULL THEN 1 ELSE 0 END) AS total_null
         FROM user`,
    ) as unknown as TrustBootstrapSummary[];

    return {
        microbeNull: Number(rows[0]?.microbe_null ?? 0),
        elevatedNull: Number(rows[0]?.elevated_null ?? 0),
        otherNull: Number(rows[0]?.other_null ?? 0),
        totalNull: Number(rows[0]?.total_null ?? 0),
    };
}

function applyBootstrap(env: Environment): void {
    const elevatedOk = executeD1(
        env,
        "UPDATE user SET trust_score = 100 WHERE tier IN ('spore', 'seed', 'flower', 'nectar', 'router') AND trust_score IS NULL",
    );
    if (!elevatedOk) {
        throw new Error("Failed to set trust_score = 100 for elevated tiers");
    }

    const microbeOk = executeD1(
        env,
        "UPDATE user SET trust_score = 0 WHERE tier = 'microbe' AND trust_score IS NULL",
    );
    if (!microbeOk) {
        throw new Error("Failed to set trust_score = 0 for microbe tier");
    }
}

function printSummary(
    label: string,
    summary: {
        microbeNull: number;
        elevatedNull: number;
        otherNull: number;
        totalNull: number;
    },
): void {
    console.log(`\n${label}`);
    console.log(`   microbe -> 0 pending: ${summary.microbeNull}`);
    console.log(`   elevated -> 100 pending: ${summary.elevatedNull}`);
    console.log(`   unknown tier pending: ${summary.otherNull}`);
    console.log(`   total null trust_score: ${summary.totalNull}`);
}

async function main(): Promise<void> {
    const config = parseArguments();

    console.log("🔧 Trust Bootstrap");
    console.log(`   Environment: ${config.env}`);
    console.log(`   Mode: ${config.apply ? "APPLY" : "DRY RUN"}`);
    console.log("=".repeat(50));

    const before = fetchSummary(config.env);
    printSummary("Before", before);

    if (!config.apply) {
        console.log(
            "\nℹ️ Dry run only. Re-run with --apply to write bootstrap trust scores.",
        );
        return;
    }

    applyBootstrap(config.env);

    const after = fetchSummary(config.env);
    printSummary("After", after);

    if (after.otherNull > 0) {
        console.warn(
            "\n⚠️ Some users still have NULL trust_score because their tier is outside the bootstrap mapping.",
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
