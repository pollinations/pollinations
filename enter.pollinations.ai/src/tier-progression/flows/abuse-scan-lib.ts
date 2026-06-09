// Pure logic for the abuse scan. NO node:* imports — must stay importable in the
// vitest Workers pool. All I/O lives in abuse-scan.ts.

export const SCORE_THRESHOLDS = { block: 70, review: 40 } as const;

// Auto-generated GitHub username suffixes seen in bot farms (abuse-detection skill).
export const GIBBERISH_SUFFIXES = [
    "-boop",
    "-a11y",
    "-bit",
    "-lang",
    "-max",
    "-sudo",
    "-dot",
    "-beep",
    "-commits",
    "-pixel",
    "-cmd",
    "-stack",
    "-ops",
    "-dotcom",
    "-ux",
    "-sys",
    "-arch",
    "-source",
    "-crypto",
];

export interface UserSignals {
    id: string;
    email: string;
    githubUsername: string;
    tier: string;
    createdAt: number; // unix seconds
    totalReqs: number;
    failingReqs: number;
    errorRate: number; // 0..100
    tierPollen: number; // free pollen burned in window
    packPollenWindow: number; // paid pollen burned in window (informational)
    packPollenAllTime: number; // paid pollen burned all-time (paid signal)
    uniqIpHash: number;
    topIpSubnet: string;
    ipClusterSize: number; // max users sharing any of this user's ip_hashes
    hasCheckoutCredits: boolean; // D1 stripe_checkout_credits row exists
    packBalance: number; // D1 user.pack_balance
    hasStripeCustomerId: boolean; // D1 user.stripe_customer_id not null
    clusterId?: string; // set by detectClusters
}

export type Action = "block" | "review" | "ok" | "skip";

export interface ScoredUser extends UserSignals {
    score: number;
    signals: string[];
    action: Action;
}

export function computeScore(u: UserSignals): {
    score: number;
    signals: string[];
} {
    let score = 0;
    const signals: string[] = [];

    // Severe hammering blocks on volume + error alone (spec's primary auto-flag);
    // mid-volume lone hammerers land in "review"; farm members reach "block" via the
    // cluster/IP bonuses below.
    if (u.failingReqs >= 100_000) {
        score += 45;
        signals.push("fail>=100k");
    } else if (u.failingReqs >= 20_000) {
        score += 30;
        signals.push("fail>=20k");
    } else if (u.failingReqs >= 5_000) {
        score += 20;
        signals.push("fail>=5k");
    }

    if (u.errorRate >= 95) {
        score += 25;
        signals.push("err>=95");
    } else if (u.errorRate >= 80) {
        score += 22;
        signals.push("err>=80");
    } else if (u.errorRate >= 70) {
        score += 12;
        signals.push("err>=70");
    }

    // Only a genuine shared-IP cluster (>=2 users) counts.
    if (u.ipClusterSize >= 2) {
        score += Math.min(20, u.ipClusterSize * 0.15);
        signals.push(`ipcluster=${u.ipClusterSize}`);
    }

    if (u.clusterId) {
        score += 20;
        signals.push(`cluster=${u.clusterId}`);
    }

    const name = (u.githubUsername ?? "").toLowerCase();
    if (GIBBERISH_SUFFIXES.some((s) => name.endsWith(s))) {
        score += 5;
        signals.push("suffix");
    }

    if (u.uniqIpHash >= 50) {
        score += 10;
        signals.push("iprot>=50");
    } else if (u.uniqIpHash >= 20) {
        score += 5;
        signals.push("iprot>=20");
    }

    return { score: Math.min(100, Math.round(score)), signals };
}

export function isHardPaid(u: UserSignals): boolean {
    return u.hasCheckoutCredits || u.packBalance > 0 || u.packPollenAllTime > 0;
}

export function decideAction(u: UserSignals, score: number): Action {
    if (isHardPaid(u)) return "skip"; // protect confirmed payers
    let action: Action =
        score >= SCORE_THRESHOLDS.block
            ? "block"
            : score >= SCORE_THRESHOLDS.review
              ? "review"
              : "ok";
    // Soft signal: a customer record may exist from an incomplete checkout — never
    // auto-block on it alone; cap at review for a human to confirm.
    if (u.hasStripeCustomerId && action === "block") action = "review";
    return action;
}

// Mutates users: sets clusterId for >=3 accounts that share an email local-part root
// (digits stripped). Catches numbered-sibling farms like numberphotos2/3/4.
export function detectClusters(users: UserSignals[]): void {
    const byRoot = new Map<string, UserSignals[]>();
    for (const u of users) {
        const local = (u.email.split("@")[0] ?? "").toLowerCase();
        const root = local.replace(/\d+/g, "").replace(/[._-]+$/, "");
        if (root.length < 4) continue;
        const group = byRoot.get(root) ?? [];
        group.push(u);
        byRoot.set(root, group);
    }
    for (const [root, group] of byRoot) {
        if (group.length >= 3) {
            for (const u of group) u.clusterId = `root:${root}`;
        }
    }
}

export const REPORT_HEADER =
    "id,action,score,email,github_username,signals,tier,registered";

const EXTRA_HEADER =
    "failing_reqs,error_rate,tier_pollen,pack_pollen,uniq_ip_hash,top_ip_subnet,ip_cluster_size";

function sqlList(values: string[]): string {
    return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
}

export function isoMinute(unixSeconds: number): string {
    return new Date(unixSeconds * 1000)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
}

// Window aggregate over generation_event, one row per user_id.
export function buildUsageQuery(days: number): string {
    return `SELECT user_id,
        count() AS total_reqs,
        countIf(response_status >= 400) AS failing_reqs,
        round(countIf(response_status >= 400) * 100.0 / count(), 1) AS error_rate,
        round(sumIf(total_price, selected_meter_slug = 'v1:meter:tier'), 4) AS tier_pollen,
        round(sumIf(total_price, selected_meter_slug = 'v1:meter:pack'), 4) AS pack_pollen_window,
        uniq(ip_hash) AS uniq_ip_hash
    FROM generation_event
    WHERE start_time >= now() - INTERVAL ${days} DAY
        AND user_id NOT IN ('undefined', '')
    GROUP BY user_id
    FORMAT JSON`
        .replace(/\s+/g, " ")
        .trim();
}

// (user_id, ip_hash) pairs for candidate users in the window.
export function buildUserIpsQuery(userIds: string[], days: number): string {
    return `SELECT DISTINCT user_id, ip_hash
    FROM generation_event
    WHERE start_time >= now() - INTERVAL ${days} DAY
        AND user_id IN (${sqlList(userIds)})
        AND ip_hash NOT IN ('undefined', '')
    FORMAT JSON`
        .replace(/\s+/g, " ")
        .trim();
}

// Cluster size (distinct users) for the given ip_hashes, all-time within retention.
export function buildIpClusterQuery(ipHashes: string[]): string {
    return `SELECT ip_hash, uniq(user_id) AS cluster_size
    FROM generation_event
    WHERE ip_hash IN (${sqlList(ipHashes)})
        AND ip_hash NOT IN ('undefined', '')
        AND user_id NOT IN ('undefined', '')
    GROUP BY ip_hash
    FORMAT JSON`
        .replace(/\s+/g, " ")
        .trim();
}

// All-time paid pollen consumed, for candidate users (paid signal).
export function buildAllTimePackQuery(userIds: string[]): string {
    return `SELECT user_id, round(sumIf(total_price, selected_meter_slug = 'v1:meter:pack'), 4) AS pack_all_time
    FROM generation_event
    WHERE user_id IN (${sqlList(userIds)})
    GROUP BY user_id
    FORMAT JSON`
        .replace(/\s+/g, " ")
        .trim();
}

export function toReportCsv(users: ScoredUser[]): string {
    const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [...users]
        .sort((a, b) => b.score - a.score)
        .map((u) =>
            [
                q(u.id),
                q(u.action),
                u.score,
                q(u.email),
                q(u.githubUsername),
                q(u.signals.join("; ")),
                q(u.tier),
                q(isoMinute(u.createdAt)),
                u.failingReqs,
                u.errorRate,
                u.tierPollen,
                u.packPollenAllTime,
                u.uniqIpHash,
                q(u.topIpSubnet),
                u.ipClusterSize,
            ].join(","),
        );
    return [`${REPORT_HEADER},${EXTRA_HEADER}`, ...rows].join("\n");
}
