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
