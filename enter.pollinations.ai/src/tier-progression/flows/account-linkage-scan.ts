#!/usr/bin/env npx tsx
/**
 * Account Linkage Scan — multi-account cluster detection for bonus protection.
 * READ ONLY.
 *
 * Free tier is ending; a real-money tier bonus replaces it (e.g. seed = $50).
 * This finds clusters of linked accounts (shared email-root / exact IP / IP+UA)
 * across the bonus-eligible population so one operator can't collect N × bonus.
 * Linkage is the primary axis; per-account usage/error rides along as a
 * corroborating signal. Mutates nothing — writes two CSVs for human review.
 *
 * USAGE (from enter.pollinations.ai/):
 *   npx tsx src/tier-progression/flows/account-linkage-scan.ts
 *   npx tsx src/tier-progression/flows/account-linkage-scan.ts --usage-days 14 --ip-cap 15
 *   npx tsx src/tier-progression/flows/account-linkage-scan.ts --no-usage
 *
 * Then review, and (optionally) dry-run the existing apply on the members CSV:
 *   npx tsx src/tier-progression/flows/spore-to-microbe-apply.ts apply-blocks \
 *     --env production --report src/tier-progression/account-linkage-members.csv --dry-run
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildUsageQuery } from "./abuse-scan-lib.ts";
import {
    type AccountRow,
    type Cluster,
    clusterAccounts,
    type IdGroup,
    IP_CAP,
    type LinkUsage,
    scoreCluster,
    toClustersCsv,
    toMembersCsv,
} from "./account-linkage-lib.ts";

const TB_HOST = "https://api.europe-west2.gcp.tinybird.co";
// Outputs hold real user emails (PII) — write to the gitignored local scratch
// area, never the repo tree. Per-project folder under _local/ (run cwd = enter.pollinations.ai/).
const OUT_DIR = "../_local/abuse-detection";
const OUT_CLUSTERS = `${OUT_DIR}/account-linkage-clusters.csv`;
const OUT_MEMBERS = `${OUT_DIR}/account-linkage-members.csv`;
const PAGE = 10_000; // D1 keyset page size for the account pull

interface Args {
    usageDays: number;
    ipCap: number;
    usage: boolean;
    outClusters: string;
    outMembers: string;
}

function parseArgs(): Args {
    const a = process.argv.slice(2);
    const str = (f: string, d: string): string => {
        const i = a.indexOf(f);
        return i >= 0 && a[i + 1] ? a[i + 1] : d;
    };
    const num = (f: string, d: number): number => {
        const v = str(f, "");
        return v ? Number(v) : d;
    };
    return {
        usageDays: num("--usage-days", 30),
        ipCap: num("--ip-cap", IP_CAP),
        usage: !a.includes("--no-usage"),
        outClusters: str("--out-clusters", OUT_CLUSTERS),
        outMembers: str("--out-members", OUT_MEMBERS),
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

// One D1 query via wrangler (no shell — args are passed as an array).
function d1<T>(sql: string): T[] {
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
        { encoding: "utf-8", maxBuffer: 200 * 1024 * 1024 },
    );
    return (JSON.parse(raw)[0]?.results as T[]) ?? [];
}

const sqlStr = (s: string): string => s.replace(/'/g, "''");

interface D1AccountRow {
    id: string;
    email: string;
    tier: string;
    github_username: string | null;
    created_at: number;
    pack_balance: number | null;
    stripe_customer_id: string | null;
    has_checkout: number | null;
}

// All bonus-eligible (non-microbe) accounts, keyset-paginated by id.
function fetchAccounts(): AccountRow[] {
    const out: AccountRow[] = [];
    let last = "";
    for (;;) {
        const rows = d1<D1AccountRow>(
            `SELECT u.id, u.email, u.tier, u.github_username, u.created_at, u.pack_balance, u.stripe_customer_id, ` +
                `(SELECT 1 FROM stripe_checkout_credits c WHERE c.user_id = u.id LIMIT 1) AS has_checkout ` +
                `FROM user u WHERE u.tier != 'microbe' AND u.id > '${sqlStr(last)}' ` +
                `ORDER BY u.id LIMIT ${PAGE}`,
        );
        if (rows.length === 0) break;
        for (const r of rows) {
            out.push({
                id: r.id,
                email: r.email ?? "",
                tier: r.tier,
                githubUsername: r.github_username ?? "",
                createdAt: Number(r.created_at) || 0,
                packBalance: Number(r.pack_balance ?? 0),
                hasCheckout: r.has_checkout === 1,
                hasStripeCustomerId: !!r.stripe_customer_id,
            });
        }
        last = rows[rows.length - 1].id;
        process.stdout.write(`   accounts: ${out.length}\r`);
        if (rows.length < PAGE) break;
    }
    process.stdout.write("\n");
    return out;
}

interface SessionGroupRow {
    n: number;
    ids: string; // GROUP_CONCAT(DISTINCT user_id) — comma separated
}

// Shared linkage keys done server-side: only IPs (or IP+UA pairs) shared by
// 3..cap distinct accounts come back, so we never pull raw sessions. The cap
// keeps shared-infra (office/VPN/CGNAT) IPs from unioning the whole table.
function fetchSessionGroups(cap: number, byUa: boolean): IdGroup[] {
    const groupCols = byUa ? "ip_address, user_agent" : "ip_address";
    const keyCol = byUa
        ? "ip_address || '|' || COALESCE(user_agent, '')"
        : "ip_address";
    const rows = d1<SessionGroupRow & { key: string }>(
        `SELECT ${keyCol} AS key, COUNT(DISTINCT user_id) AS n, GROUP_CONCAT(DISTINCT user_id) AS ids ` +
            `FROM session WHERE ip_address IS NOT NULL AND ip_address != '' ` +
            `GROUP BY ${groupCols} ` +
            `HAVING COUNT(DISTINCT user_id) >= 3 AND COUNT(DISTINCT user_id) <= ${cap}`,
    );
    return rows.map((r) => ({
        key: r.key,
        ids: (r.ids ?? "").split(",").filter(Boolean),
    }));
}

interface UsageRow {
    user_id: string;
    failing_reqs: number;
    error_rate: number;
    tier_pollen: number;
    pack_pollen_window: number;
}

// Best-effort usage enrichment. Linkage is primary; if Tinybird times out on a
// long window, we proceed without usage rather than fail the whole scan.
async function fetchUsage(
    token: string,
    days: number,
): Promise<Map<string, LinkUsage>> {
    const map = new Map<string, LinkUsage>();
    try {
        const rows = await tb<UsageRow>(token, buildUsageQuery(days));
        for (const r of rows) {
            map.set(r.user_id, {
                failingReqs: Number(r.failing_reqs),
                errorRate: Number(r.error_rate),
                tierPollen: Number(r.tier_pollen),
                packPollen: Number(r.pack_pollen_window),
            });
        }
        console.log(`   usage rows: ${map.size}`);
    } catch (e) {
        console.warn(
            `   ⚠️ usage enrichment skipped (${e instanceof Error ? e.message : e})`,
        );
    }
    return map;
}

const maskEmail = (e: string): string => {
    const at = e.indexOf("@");
    if (at <= 0) return "***";
    const name = e.slice(0, at);
    return `${name.slice(0, 2)}***${e.slice(at)}`;
};

async function main(): Promise<void> {
    const args = parseArgs();
    console.log("🔗 Account Linkage Scan (read-only)");
    console.log(
        `   usageDays=${args.usage ? args.usageDays : "off"} ipCap=${args.ipCap}`,
    );

    console.log("📇 1. accounts (non-microbe)...");
    const accounts = fetchAccounts();
    console.log(`   ${accounts.length} bonus-eligible accounts`);
    if (accounts.length === 0) {
        console.log("✅ nothing to scan");
        return;
    }

    console.log("🌐 2. session linkage groups...");
    const ipGroups = fetchSessionGroups(args.ipCap, false);
    const ipUaGroups = fetchSessionGroups(args.ipCap, true);
    console.log(
        `   ip groups=${ipGroups.length} ip+ua groups=${ipUaGroups.length}`,
    );

    const usageByUser = args.usage
        ? await (async () => {
              console.log(`📊 3. usage enrichment (${args.usageDays}d)...`);
              return fetchUsage(
                  loadSecret("TINYBIRD_READ_TOKEN"),
                  args.usageDays,
              );
          })()
        : new Map<string, LinkUsage>();

    console.log("🧮 4. clustering...");
    const clusters: Cluster[] = clusterAccounts(
        accounts,
        ipGroups,
        ipUaGroups,
        args.ipCap,
    )
        .map((c) => scoreCluster(c, usageByUser))
        .sort((a, b) => b.confidence - a.confidence);

    mkdirSync(dirname(args.outClusters), { recursive: true });
    writeFileSync(args.outClusters, toClustersCsv(clusters));
    writeFileSync(args.outMembers, toMembersCsv(clusters, usageByUser));

    const bands = { high: 0, medium: 0, low: 0 };
    let payers = 0;
    let linkedAccounts = 0;
    for (const c of clusters) {
        bands[c.band]++;
        if (c.hasPayer) payers++;
        linkedAccounts += c.members.length;
    }

    console.log(`\n✅ ${args.outClusters}`);
    console.log(`✅ ${args.outMembers}`);
    console.log(
        `   clusters=${clusters.length} (high=${bands.high} medium=${bands.medium} low=${bands.low}) ` +
            `with-payer=${payers} linked-accounts=${linkedAccounts}`,
    );

    console.log("\nTop clusters:");
    for (const c of clusters.slice(0, 25)) {
        const sample = c.members
            .slice(0, 3)
            .map((m) => maskEmail(m.email))
            .join(", ");
        console.log(
            `   [${String(c.confidence).padStart(3)}] ${c.band.padEnd(6)} ` +
                `n=${String(c.members.length).padStart(3)} ${c.linkTypes.join("+").padEnd(14)} ` +
                `${c.hasPayer ? "💲" : "  "} ${sample}${c.members.length > 3 ? " …" : ""}`,
        );
    }

    console.log(
        "\nReview the clusters CSV, then (DRY RUN) to act on high-band members:",
    );
    console.log(
        `   npx tsx src/tier-progression/flows/spore-to-microbe-apply.ts apply-blocks --env production --report ${args.outMembers} --dry-run`,
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
