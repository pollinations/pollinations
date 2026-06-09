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
import {
    buildSubnetClusterQuery,
    buildUsageQuery,
    type UserSignals,
} from "./abuse-scan-lib.ts";

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
    subnets: string[];
}

interface D1UserRow {
    id: string;
    email: string;
    github_username: string | null;
    tier: string;
    created_at: number;
    pack_balance: number | null;
    stripe_customer_id: string | null;
    has_checkout: number | null;
}

// Live D1 fetch (current, authoritative) for candidate ids — identity + paid status.
// Uses execFileSync (no shell) so user ids never hit a shell command line.
function d1Users(ids: string[]): D1UserRow[] {
    const out: D1UserRow[] = [];
    for (let i = 0; i < ids.length; i += 50) {
        const inList = ids
            .slice(i, i + 50)
            .map((x) => `'${x.replace(/'/g, "''")}'`)
            .join(",");
        const sql =
            `SELECT u.id, u.email, u.github_username, u.tier, u.created_at, u.pack_balance, u.stripe_customer_id, ` +
            `(SELECT 1 FROM stripe_checkout_credits c WHERE c.user_id = u.id LIMIT 1) AS has_checkout ` +
            `FROM user u WHERE u.id IN (${inList})`;
        const raw = execFileSync(
            "npx",
            [
                "wrangler",
                "d1",
                "execute",
                "DB",
                "--remote",
                "--env",
                "production",
                "--json",
                "--command",
                sql,
            ],
            { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
        );
        out.push(...((JSON.parse(raw)[0]?.results as D1UserRow[]) ?? []));
    }
    return out;
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

    const ids = candidates.map((c) => c.user_id);

    console.log("📊 1b. subnet clusters...");
    const candidateSubnets = [
        ...new Set(candidates.flatMap((c) => c.subnets ?? [])),
    ].filter((s) => s && s !== "undefined");
    const clusterRows = candidateSubnets.length
        ? await tb<{ ip_subnet: string; cluster_size: number }>(
              tbToken,
              buildSubnetClusterQuery(candidateSubnets, args.days),
          )
        : [];
    const clusterSize = new Map(
        clusterRows.map((r) => [r.ip_subnet, Number(r.cluster_size)]),
    );

    console.log("📊 1c. D1 identity + paid...");
    const d1 = new Map(d1Users(ids).map((r) => [r.id, r]));

    const signals: UserSignals[] = [];
    for (const c of candidates) {
        const u = d1.get(c.user_id);
        if (!u) continue; // not in D1 (deleted) — skip
        if (u.tier === "microbe") continue; // already at floor
        if (args.tiers && !args.tiers.includes(u.tier)) continue;
        const subnets = c.subnets ?? [];
        const ipClusterSize = subnets.reduce(
            (m, s) => Math.max(m, clusterSize.get(s) ?? 1),
            1,
        );
        signals.push({
            id: u.id,
            email: u.email,
            githubUsername: u.github_username ?? "",
            tier: u.tier,
            createdAt: Number(u.created_at),
            totalReqs: Number(c.total_reqs),
            failingReqs: Number(c.failing_reqs),
            errorRate: Number(c.error_rate),
            tierPollen: Number(c.tier_pollen),
            packPollenWindow: Number(c.pack_pollen_window),
            uniqIpHash: Number(c.uniq_ip_hash),
            topIpSubnet: subnets[0] ?? "",
            ipClusterSize,
            hasCheckoutCredits: u.has_checkout === 1,
            packBalance: Number(u.pack_balance ?? 0),
            hasStripeCustomerId: !!u.stripe_customer_id,
        });
    }
    console.log(`   ${signals.length} candidates after tier/D1 filtering`);

    // Stages 2–4 are added in Task 7.
    void signals;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
