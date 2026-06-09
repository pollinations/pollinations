#!/usr/bin/env npx tsx
/**
 * Abuse Scan — usage-first, all-tier, READ ONLY.
 * Ranks non-microbe users by hammering/error/credit-burn + IP/name clustering,
 * gates out payers, and writes an apply-compatible CSV. Mutates nothing.
 *
 * USAGE (from enter.pollinations.ai/):
 *   npx tsx src/tier-progression/flows/abuse-scan.ts
 *   npx tsx src/tier-progression/flows/abuse-scan.ts --days 7 --min-failing 5000 --min-error-rate 80
 *   npx tsx src/tier-progression/flows/abuse-scan.ts --no-stripe-fallback
 */
import { execFileSync } from "node:child_process";
import { buildUsageQuery } from "./abuse-scan-lib.ts";

const TB_HOST = "https://api.europe-west2.gcp.tinybird.co";
const OUT = "src/tier-progression/abuse-scan-report.csv";

interface Args {
    days: number;
    minFailing: number;
    minErrorRate: number;
    tiers: string[] | null;
    stripeFallback: boolean;
    out: string;
}

function parseArgs(): Args {
    const a = process.argv.slice(2);
    const str = (f: string, d: string) => {
        const i = a.indexOf(f);
        return i >= 0 && a[i + 1] ? a[i + 1] : d;
    };
    const num = (f: string, d: number) => {
        const v = str(f, "");
        return v ? Number(v) : d;
    };
    const tiersRaw = str("--tiers", "");
    return {
        days: num("--days", 7),
        minFailing: num("--min-failing", 5000),
        minErrorRate: num("--min-error-rate", 80),
        tiers: tiersRaw ? tiersRaw.split(",").map((t) => t.trim()) : null,
        stripeFallback: !a.includes("--no-stripe-fallback"),
        out: str("--out", OUT),
    };
}

function loadSecret(key: string): string {
    const json = execFileSync("sops", ["-d", "secrets/prod.vars.json"], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
    });
    const val = JSON.parse(json)[key];
    if (!val) {
        console.error(`❌ Missing ${key} in secrets/prod.vars.json`);
        process.exit(1);
    }
    return val;
}

async function tb<T>(token: string, sql: string): Promise<T[]> {
    const res = await fetch(`${TB_HOST}/v0/sql`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `q=${encodeURIComponent(sql)}`,
    });
    if (!res.ok) {
        throw new Error(
            `Tinybird ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
    }
    return ((await res.json()) as { data?: T[] }).data ?? [];
}

interface UsageRow {
    user_id: string;
    total_reqs: number;
    failing_reqs: number;
    error_rate: number;
    tier_pollen: number;
    pack_pollen_window: number;
    uniq_ip_hash: number;
}

async function main(): Promise<void> {
    const args = parseArgs();
    console.log("🔎 Abuse Scan (read-only)");
    console.log(
        `   window=${args.days}d minFailing=${args.minFailing} minErrorRate=${args.minErrorRate}%`,
    );

    const tbToken = loadSecret("TINYBIRD_READ_TOKEN");

    console.log("📊 1a. usage sweep...");
    const usage = await tb<UsageRow>(tbToken, buildUsageQuery(args.days));
    const candidates = usage.filter(
        (u) =>
            u.failing_reqs >= args.minFailing &&
            u.error_rate >= args.minErrorRate,
    );
    console.log(
        `   ${usage.length} active users → ${candidates.length} candidates`,
    );
    if (candidates.length === 0) {
        console.log("✅ no candidates");
        return;
    }

    // Stages 1b–4 are added in Tasks 6–7.
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
