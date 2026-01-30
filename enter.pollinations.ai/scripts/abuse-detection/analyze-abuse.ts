/**
 * Abuse Detection Analysis Script (Unified Pipeline)
 *
 * Single-command pipeline that:
 *   1. Fetches users from D1
 *   2. Fetches behavioral data from Tinybird
 *   3. Computes combined identity + behavior scores
 *   4. Outputs CSV + markdown summary
 *
 * Usage:
 *   npx tsx scripts/abuse-detection/analyze-abuse.ts export-csv --env production --all
 *
 * Environment variables:
 *   CLOUDFLARE_API_TOKEN - Required for D1 access via wrangler
 *   CLOUDFLARE_ACCOUNT_ID - Required for D1 access via wrangler
 *   TINYBIRD_INGEST_TOKEN - Required for behavioral data from Tinybird
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { boolean, command, run, string } from "@drizzle-team/brocli";
import { isDisposableEmail as checkDisposable } from "disposable-email-domains-js";
import { isValidTier, TIER_POLLEN, type TierName } from "../../src/tier-config";

// ============================================================================
// ABUSE DETECTION (inlined - self-contained script)
// ============================================================================

type AbuseConfidence = "high" | "medium" | "low" | "none";

interface AbuseDetectionResult {
    confidence: AbuseConfidence;
    signals: string[];
    emailNormalized: string;
    emailBase: string;
    isDisposableDomain: boolean;
    isGitHubNoreply: boolean;
}

const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

function normalizeEmail(email: string): string {
    const [localPart, domain] = email.toLowerCase().split("@");
    if (!localPart || !domain) return email.toLowerCase();
    if (GMAIL_DOMAINS.includes(domain)) {
        const withoutPlus = localPart.split("+")[0];
        const withoutDots = withoutPlus.replace(/\./g, "");
        return `${withoutDots}@gmail.com`;
    }
    const withoutPlus = localPart.split("+")[0];
    return `${withoutPlus}@${domain}`;
}

function extractEmailBase(email: string): string {
    const [localPart, domain] = email.toLowerCase().split("@");
    if (!localPart || !domain) return "";
    if (domain === "users.noreply.github.com") {
        const match = localPart.match(/^\d+\+(.+)$/);
        return match ? match[1] : localPart;
    }
    const withoutPlus = localPart.split("+")[0];
    const withoutNumbers = withoutPlus.replace(/\d+$/, "");
    return withoutNumbers || withoutPlus;
}

function isGitHubNoreplyEmail(email: string): boolean {
    return email.toLowerCase().endsWith("@users.noreply.github.com");
}

function isDisposableEmail(email: string): boolean {
    return checkDisposable(email);
}

function detectAbuse(email: string): AbuseDetectionResult {
    const signals: string[] = [];
    const emailNormalized = normalizeEmail(email);
    const emailBase = extractEmailBase(email);
    const disposable = isDisposableEmail(email);
    const githubNoreply = isGitHubNoreplyEmail(email);
    if (disposable) signals.push("disposable_domain");
    if (githubNoreply) signals.push("github_noreply");
    let confidence: AbuseConfidence = "none";
    if (disposable) confidence = "high";
    else if (githubNoreply) confidence = "medium";
    return { confidence, signals, emailNormalized, emailBase, isDisposableDomain: disposable, isGitHubNoreply: githubNoreply };
}

function findDuplicatesByNormalizedEmail(
    targetNormalized: string,
    allUsers: Array<{ id: string; email: string }>,
    excludeUserId?: string,
): Array<{ id: string; email: string; normalized: string }> {
    return allUsers
        .filter((u) => u.id !== excludeUserId)
        .map((u) => ({ ...u, normalized: normalizeEmail(u.email) }))
        .filter((u) => u.normalized === targetNormalized);
}

function extractUsernameBase(username: string): string {
    if (!username) return "";
    const lower = username.toLowerCase();
    const withoutTrailingNumbers = lower.replace(/\d+$/, "");
    const withoutLeadingNumbers = withoutTrailingNumbers.replace(/^\d+/, "");
    return withoutLeadingNumbers || lower;
}

function extractEmailLocalBase(email: string): string {
    const [localPart] = email.toLowerCase().split("@");
    if (!localPart) return "";
    const withoutPlus = localPart.split("+")[0];
    const withoutDots = withoutPlus.replace(/\./g, "");
    const withoutNumbers = withoutDots.replace(/\d+/g, "");
    return withoutNumbers || withoutDots;
}

function findSimilarUsernames(
    targetUsername: string,
    allUsers: Array<{ id: string; github_username: string | null }>,
    excludeUserId?: string,
    minBaseLength = 4,
): Array<{ id: string; github_username: string; usernameBase: string }> {
    const targetBase = extractUsernameBase(targetUsername);
    if (!targetBase || targetBase.length < minBaseLength) return [];
    return allUsers
        .filter((u) => u.id !== excludeUserId && u.github_username)
        .map((u) => ({ id: u.id, github_username: u.github_username as string, usernameBase: extractUsernameBase(u.github_username as string) }))
        .filter((u) => u.usernameBase === targetBase);
}

const COMMON_LOCAL_PARTS = new Set([
    "admin", "support", "hello", "info", "contact", "sales", "noreply", "no-reply", "team", "mail", "me", "test", "dev",
    "webmaster", "postmaster", "hostmaster", "abuse", "security", "billing", "help", "office", "marketing", "hr", "jobs",
    "careers", "press", "media", "news", "newsletter", "subscribe", "unsubscribe", "feedback", "enquiry", "inquiry",
    "user", "users", "account", "accounts", "service", "services",
]);

function isCommonLocalPart(localPart: string): boolean {
    if (!localPart) return false;
    return COMMON_LOCAL_PARTS.has(localPart.toLowerCase());
}

function isHighEntropyIdentifier(localPart: string): boolean {
    if (!localPart) return false;
    if (isCommonLocalPart(localPart)) return false;
    if (localPart.length < 6) return false;
    const hasLetters = /[a-z]/i.test(localPart);
    const hasNumbers = /[0-9]/.test(localPart);
    const hasUnderscore = /_/.test(localPart);
    if (hasLetters && hasNumbers) return true;
    if (hasUnderscore) return true;
    if (localPart.length >= 8) return true;
    return false;
}

function findCrossDomainDuplicates(
    targetEmail: string,
    allUsers: Array<{ id: string; email: string }>,
    excludeUserId?: string,
    minBaseLength = 5,
    requireHighEntropy = true,
): Array<{ id: string; email: string; localBase: string }> {
    const targetLocalBase = extractEmailLocalBase(targetEmail);
    if (!targetLocalBase || targetLocalBase.length < minBaseLength) return [];
    if (requireHighEntropy && !isHighEntropyIdentifier(targetLocalBase)) return [];
    return allUsers
        .filter((u) => u.id !== excludeUserId)
        .map((u) => ({ id: u.id, email: u.email, localBase: extractEmailLocalBase(u.email) }))
        .filter((u) => u.localBase === targetLocalBase);
}

const BURST_WINDOW_SECONDS = 5 * 60;
const BURST_MIN_CLUSTER_SIZE = 15;

interface BurstCluster {
    windowStart: number;
    windowEnd: number;
    users: Array<{ id: string; created_at: number }>;
}

function findBurstRegistrations(
    allUsers: Array<{ id: string; created_at: number }>,
    windowSeconds = BURST_WINDOW_SECONDS,
    minClusterSize = BURST_MIN_CLUSTER_SIZE,
): Map<string, BurstCluster> {
    const sorted = [...allUsers].sort((a, b) => a.created_at - b.created_at);
    const clusters = new Map<string, BurstCluster>();
    for (let i = 0; i < sorted.length; i++) {
        const windowStart = sorted[i].created_at;
        const windowEnd = windowStart + windowSeconds;
        const usersInWindow = sorted.filter((u) => u.created_at >= windowStart && u.created_at < windowEnd);
        if (usersInWindow.length >= minClusterSize) {
            const clusterKey = String(Math.floor(windowStart / windowSeconds));
            if (!clusters.has(clusterKey)) {
                clusters.set(clusterKey, { windowStart, windowEnd, users: usersInWindow });
            }
        }
    }
    return clusters;
}

function isInBurstCluster(
    userId: string,
    burstClusters: Map<string, BurstCluster>,
): { inBurst: boolean; clusterSize: number; clusterKey: string | null } {
    for (const [key, cluster] of burstClusters) {
        if (cluster.users.some((u) => u.id === userId)) {
            return { inBurst: true, clusterSize: cluster.users.length, clusterKey: key };
        }
    }
    return { inBurst: false, clusterSize: 0, clusterKey: null };
}

const GITHUB_ID_CLUSTER_RANGE = 1000;
const GITHUB_ID_MIN_CLUSTER_SIZE = 5;
const GITHUB_ID_TIME_WINDOW_SECONDS = 60 * 60;

interface GitHubIdCluster {
    rangeStart: number;
    rangeEnd: number;
    users: Array<{ id: string; github_id: number; created_at: number }>;
    density: number;
}

function subClusterByTime(
    users: Array<{ id: string; github_id: number; created_at: number }>,
    timeWindowSeconds: number,
    minClusterSize: number,
): Array<Array<{ id: string; github_id: number; created_at: number }>> {
    const sorted = [...users].sort((a, b) => a.created_at - b.created_at);
    const clusters: Array<Array<{ id: string; github_id: number; created_at: number }>> = [];
    let clusterStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
        const isEnd = i === sorted.length;
        const timeGap = isEnd ? Infinity : sorted[i].created_at - sorted[i - 1].created_at;
        if (timeGap > timeWindowSeconds || isEnd) {
            const cluster = sorted.slice(clusterStart, i);
            if (cluster.length >= minClusterSize) clusters.push(cluster);
            clusterStart = i;
        }
    }
    return clusters;
}

function findGitHubIdClusters(
    allUsers: Array<{ id: string; github_id: number | null; created_at: number }>,
    maxRange = GITHUB_ID_CLUSTER_RANGE,
    minClusterSize = GITHUB_ID_MIN_CLUSTER_SIZE,
    timeWindowSeconds = GITHUB_ID_TIME_WINDOW_SECONDS,
): Map<string, GitHubIdCluster> {
    const withGitHubId = allUsers.filter(
        (u): u is { id: string; github_id: number; created_at: number } => u.github_id !== null && u.created_at !== undefined,
    );
    const sorted = [...withGitHubId].sort((a, b) => a.github_id - b.github_id);
    const clusters = new Map<string, GitHubIdCluster>();
    let clusterStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
        const isEnd = i === sorted.length;
        const gap = isEnd ? Infinity : sorted[i].github_id - sorted[i - 1].github_id;
        if (gap > maxRange || isEnd) {
            const idClusterUsers = sorted.slice(clusterStart, i);
            if (idClusterUsers.length >= minClusterSize) {
                const timeClusters = subClusterByTime(idClusterUsers, timeWindowSeconds, minClusterSize);
                for (const timeCluster of timeClusters) {
                    const githubIds = timeCluster.map((u) => u.github_id);
                    const rangeStart = Math.min(...githubIds);
                    const rangeEnd = Math.max(...githubIds);
                    const clusterKey = `${rangeStart}-${rangeEnd}`;
                    const rawIdRange = rangeEnd - rangeStart + 1;
                    const idRange = Math.max(1, rawIdRange);
                    const rawDensity = timeCluster.length / idRange;
                    const density = Math.min(1, rawDensity);
                    clusters.set(clusterKey, { rangeStart, rangeEnd, users: timeCluster, density });
                }
            }
            clusterStart = i;
        }
    }
    return clusters;
}

function isInGitHubIdCluster(
    githubId: number | null,
    gitHubIdClusters: Map<string, GitHubIdCluster>,
): { inCluster: boolean; clusterSize: number; clusterDensity: number; clusterRange: string | null } {
    if (githubId === null) return { inCluster: false, clusterSize: 0, clusterDensity: 0, clusterRange: null };
    for (const [range, cluster] of gitHubIdClusters) {
        if (cluster.users.some((u) => u.github_id === githubId)) {
            return { inCluster: true, clusterSize: cluster.users.length, clusterDensity: cluster.density, clusterRange: range };
        }
    }
    return { inCluster: false, clusterSize: 0, clusterDensity: 0, clusterRange: null };
}

type Environment = "staging" | "production";

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

/**
 * Signal weights for confidence scoring.
 * Higher weight = stronger indicator of abuse.
 */
const SIGNAL_WEIGHTS = {
    disposable_email: 50, // Definitive abuse indicator
    burst_registration: 50, // 15+ accounts in 5 min = almost certainly a bot
    github_id_cluster: 40, // Now requires temporal proximity, very reliable
    email_duplicate: 25, // Same person, different accounts
    username_pattern: 15, // Could be coincidence
    cross_domain: 15, // Now filtered by entropy, more reliable
    github_noreply: 5, // Many legitimate users use this
};

interface ConfidenceInput {
    isDisposable: boolean;
    isGitHubNoreply: boolean;
    duplicateCount: number;
    similarUsernameCount: number;
    crossDomainCount: number;
    burstClusterSize: number;
    githubIdClusterSize: number;
    githubIdClusterDensity: number; // 0-1, higher = tighter cluster
    behaviorScore: number; // 0-100, from Tinybird metrics
}

interface ConfidenceResult {
    score: number; // 0-100
    level: "critical" | "high" | "medium" | "low";
    riskBand: "enforce" | "review" | "watch"; // 2-stage classification
    breakdown: string; // Human-readable explanation
}

/**
 * Calculate abuse confidence score from multiple signals.
 *
 * Formula combines:
 * 1. Base signal weights (if triggered)
 * 2. Cluster size amplifiers (log2 scale for diminishing returns)
 * 3. Signal combination bonus (multiple signals = more suspicious)
 */
function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
    let score = 0;
    const components: string[] = [];
    let signalCount = 0;

    // 1. Disposable email (instant high confidence)
    if (input.isDisposable) {
        score += SIGNAL_WEIGHTS.disposable_email;
        components.push(`disposable:${SIGNAL_WEIGHTS.disposable_email}`);
        signalCount++;
    }

    // 2. GitHub ID cluster (amplified by cluster size AND density)
    // Only count as signal if density >= 0.1 (strong cluster)
    // Weak clusters are recorded as metadata but don't contribute to signalCount
    const isStrongCluster = input.githubIdClusterSize > 0 && input.githubIdClusterDensity >= 0.1;
    if (input.githubIdClusterSize > 0) {
        const sizeAmplifier = Math.min(
            2,
            1 + Math.log2(input.githubIdClusterSize) / 10,
        );
        // Density bonus: >0.1 density gets full weight, <0.01 gets reduced
        // Clamp to [0, 1] as defense-in-depth (density should already be clamped upstream)
        const densityMultiplier = Math.max(
            0,
            Math.min(1, input.githubIdClusterDensity * 10),
        );
        const points = Math.round(
            SIGNAL_WEIGHTS.github_id_cluster *
                sizeAmplifier *
                densityMultiplier,
        );
        score += points;
        components.push(
            `ghid_cluster(${input.githubIdClusterSize},d=${input.githubIdClusterDensity.toFixed(3)}):${points}`,
        );
        // Only count as signal if density is strong enough
        if (isStrongCluster) {
            signalCount++;
        }
    }

    // 3. Burst registration (amplified by cluster size)
    if (input.burstClusterSize > 0) {
        const amplifier = Math.min(
            2,
            1 + Math.log2(input.burstClusterSize) / 10,
        );
        const points = Math.round(
            SIGNAL_WEIGHTS.burst_registration * amplifier,
        );
        score += points;
        components.push(`burst(${input.burstClusterSize}):${points}`);
        signalCount++;
    }

    // 4. Email duplicates - exact match, high confidence
    // 5+ duplicates = definite abuse (same normalized email across accounts)
    if (input.duplicateCount > 0) {
        let points: number;
        if (input.duplicateCount >= 5) {
            points = 100; // 5+ exact matches = certain abuse
        } else if (input.duplicateCount >= 3) {
            points = 50 + input.duplicateCount * 10; // 3-4 = 80-90
        } else {
            points = SIGNAL_WEIGHTS.email_duplicate + input.duplicateCount * 5; // 1-2 = 30-35
        }
        score += points;
        components.push(`email_dup(${input.duplicateCount}):${points}`);
        signalCount++;
    }

    // 5. Username pattern - exact base match, high confidence
    // 5+ matches = definite abuse (same username base across accounts)
    if (input.similarUsernameCount > 0) {
        let points: number;
        if (input.similarUsernameCount >= 5) {
            points = 100; // 5+ exact matches = certain abuse
        } else if (input.similarUsernameCount >= 3) {
            points = 40 + input.similarUsernameCount * 10; // 3-4 = 70-80
        } else {
            points =
                SIGNAL_WEIGHTS.username_pattern +
                input.similarUsernameCount * 5; // 1-2 = 20-25
        }
        score += points;
        components.push(`username(${input.similarUsernameCount}):${points}`);
        signalCount++;
    }

    // 6. Cross-domain - exact local part match, high confidence
    // 5+ matches = definite abuse (same email prefix across domains)
    if (input.crossDomainCount > 0) {
        let points: number;
        if (input.crossDomainCount >= 5) {
            points = 100; // 5+ exact matches = certain abuse
        } else if (input.crossDomainCount >= 3) {
            points = 40 + input.crossDomainCount * 10; // 3-4 = 70-80
        } else {
            points = SIGNAL_WEIGHTS.cross_domain + input.crossDomainCount * 10; // 1-2 = 20-30
        }
        score += points;
        components.push(`cross_domain(${input.crossDomainCount}):${points}`);
        signalCount++;
    }

    // 7. GitHub noreply (very weak signal)
    if (input.isGitHubNoreply) {
        score += SIGNAL_WEIGHTS.github_noreply;
        components.push(`noreply:${SIGNAL_WEIGHTS.github_noreply}`);
        signalCount++;
    }

    // 8. Combination bonus: multiple signals together are more suspicious
    if (signalCount >= 3) {
        const bonus = Math.round((signalCount - 2) * 5);
        score += bonus;
        components.push(`combo_bonus(${signalCount}):${bonus}`);
    }

    // Clamp to [0, 100] - ensures no negative scores from bad upstream data
    score = Math.max(0, Math.min(100, score));

    // Determine level
    let level: ConfidenceResult["level"];
    if (score >= 80) level = "critical";
    else if (score >= 50) level = "high";
    else if (score >= 25) level = "medium";
    else level = "low";

    // 2-stage classification: enforce vs review vs watch
    // Enforce: Hard identity signals OR (high score + behavior confirmation)
    // Review: Medium score or multiple signals
    // Watch: Low score, single weak signal
    let riskBand: ConfidenceResult["riskBand"];
    const hasHardIdentitySignal = input.isDisposable || input.duplicateCount >= 3;
    const hasBehaviorConfirmation = input.behaviorScore >= 30;
    // Enforce requires either hard identity evidence OR combined score+behavior
    if (hasHardIdentitySignal || (score >= 70 && hasBehaviorConfirmation)) {
        riskBand = "enforce";
    } else if (score >= 40 || (signalCount >= 2 && hasBehaviorConfirmation)) {
        riskBand = "review";
    } else {
        riskBand = "watch";
    }

    return {
        score,
        level,
        riskBand,
        breakdown: components.join(" + "),
    };
}

interface D1User {
    id: string;
    email: string;
    github_username: string | null;
    github_id: number | null;
    tier: string | null;
    created_at: number;
}

interface AnalysisResult {
    user: D1User;
    detection: AbuseDetectionResult;
    duplicates: Array<{ id: string; email: string }>;
    action: "downgrade" | "flag" | "none";
}

// ============================================================================
// TINYBIRD BEHAVIORAL DATA
// ============================================================================

const TINYBIRD_API_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/user_behavior_summary.json";

interface TinybirdBehaviorResult {
    user_id: string;
    requests_total_30d: number;
    requests_billed_30d: number;
    total_consumed_30d: number;
    pack_consumed_30d: number;
    tier_consumed_30d: number;
    requests_total_7d: number;
    requests_billed_7d: number;
    total_consumed_7d: number;
    pack_consumed_7d: number;
    tier_consumed_7d: number;
    error_rate_30d: number;
    client_error_rate_30d: number;
    rate_limited_rate_30d: number;
    unique_models_requested_30d: number;
    cache_hit_rate_30d: number;
    moderation_flags_count_30d: number;
    moderation_flag_rate_30d: number;
}

async function queryTinybird(
    userIds: string[],
    token: string,
): Promise<Map<string, TinybirdBehaviorResult>> {
    const results = new Map<string, TinybirdBehaviorResult>();
    if (userIds.length === 0) return results;

    const BATCH_SIZE = 100;
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE);
        const userIdsParam = batch.join(",");
        const url = `${TINYBIRD_API_URL}?user_ids=${encodeURIComponent(userIdsParam)}`;

        try {
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                console.error(`   Tinybird API error: ${response.status}`);
                continue;
            }

            const data = (await response.json()) as {
                data: TinybirdBehaviorResult[];
            };
            for (const row of data.data) {
                results.set(row.user_id, row);
            }

            console.log(
                `   Fetched behavior for batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(userIds.length / BATCH_SIZE)} (${data.data.length} users)`,
            );
        } catch (error) {
            console.error(`   Tinybird error:`, error);
        }
    }
    return results;
}

function getTierDailyPollen(tier: string | null): number {
    if (tier && isValidTier(tier)) {
        return TIER_POLLEN[tier as TierName];
    }
    return 0;
}

function calculateBehaviorScore(
    usage: TinybirdBehaviorResult | undefined,
): number {
    if (!usage) return 0;

    let pts = 0;
    const req = usage.requests_total_30d;

    // Dumb bot / broken script: lots of client errors
    if (req >= 10 && usage.client_error_rate_30d >= 0.5) pts += 30;

    // Rate-limit pressure
    if (req >= 200 && usage.rate_limited_rate_30d >= 0.3) pts += 10;

    // Script rigidity: high volume, single model
    if (req >= 100 && usage.unique_models_requested_30d === 1) pts += 10;

    // Looping / repetition: very high cache hit rate
    if (req >= 50 && usage.cache_hit_rate_30d >= 0.9) pts += 20;

    // Moderation / policy probing
    if (req >= 10 && usage.moderation_flag_rate_30d >= 0.05) pts += 20;
    if (usage.moderation_flags_count_30d >= 25) pts += 10;

    // Human exploration bonus: diverse models + low errors
    if (
        req >= 30 &&
        usage.unique_models_requested_30d >= 3 &&
        usage.error_rate_30d <= 0.05
    ) {
        pts -= 20;
    }

    return pts;
}

// ============================================================================
// D1 DATABASE FUNCTIONS
// ============================================================================

function queryD1(env: Environment, sql: string): string {
    const envFlag = env === "production" ? "--env production" : "--env staging";
    const cmd = `npx wrangler d1 execute DB --remote ${envFlag} --command "${sql}" --json`;

    try {
        const result = execSync(cmd, {
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return result;
    } catch (error) {
        console.error(
            "D1 query failed:",
            error instanceof Error ? error.message : String(error),
        );
        throw error;
    }
}

function getAllUsers(env: Environment): D1User[] {
    const BATCH_SIZE = 1000;
    const allUsers: D1User[] = [];
    let offset = 0;

    while (true) {
        const sql = `SELECT id, email, github_username, github_id, tier, created_at FROM user LIMIT ${BATCH_SIZE} OFFSET ${offset};`;
        const result = queryD1(env, sql);

        try {
            const parsed = JSON.parse(result);
            const results = (parsed[0]?.results ||
                parsed.results ||
                []) as D1User[];

            if (results.length === 0) break;

            allUsers.push(...results);
            console.log(`   Fetched ${allUsers.length} users...`);

            if (results.length < BATCH_SIZE) break;
            offset += BATCH_SIZE;
        } catch {
            console.error("Failed to parse D1 response:", result);
            break;
        }
    }

    return allUsers;
}

function updateUserTier(
    env: Environment,
    userId: string,
    tier: string,
): boolean {
    const sql = `UPDATE user SET tier = '${tier}', tier_balance = 0 WHERE id = '${userId}';`;
    try {
        queryD1(env, sql);
        return true;
    } catch {
        return false;
    }
}

function analyzeUsers(users: D1User[]): AnalysisResult[] {
    const results: AnalysisResult[] = [];

    for (const user of users) {
        const detection = detectAbuse(user.email);

        const duplicates = findDuplicatesByNormalizedEmail(
            detection.emailNormalized,
            users.map((u) => ({ id: u.id, email: u.email })),
            user.id,
        );

        let action: "downgrade" | "flag" | "none" = "none";

        if (detection.isDisposableDomain) {
            action = "downgrade";
        } else if (duplicates.length > 0) {
            action = "downgrade";
        } else if (detection.isGitHubNoreply) {
            action = "flag";
        }

        if (action !== "none" || duplicates.length > 0) {
            results.push({ user, detection, duplicates, action });
        }
    }

    return results;
}

function escapeCSV(value: string | null | undefined): string {
    if (value == null) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function formatDate(timestamp: number): string {
    // D1 stores timestamps in seconds, but JS Date expects milliseconds
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    return new Date(ms).toISOString().split("T")[0];
}

const exportCsvCommand = command({
    name: "export-csv",
    desc: "Export flagged users to CSV file",
    options: {
        env: string().enum("staging", "production").default("production"),
        output: string()
            .default("scripts/abuse-detection/flagged-users.csv")
            .desc("Output file path"),
        all: boolean()
            .default(false)
            .desc("Include all users, not just flagged ones"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const outputPath = opts.output;
        const includeAll = opts.all;

        console.log(`\n📊 Exporting abuse detection report to CSV`);
        console.log(`   Environment: ${env}`);
        console.log(`   Output: ${outputPath}`);
        console.log(`   Include all users: ${includeAll}`);
        console.log("");

        console.log("📥 Fetching all users from D1...");
        const users = getAllUsers(env);
        console.log(`   Found ${users.length} users\n`);

        console.log("🔬 Pre-computing cluster analysis...");
        const burstClusters = findBurstRegistrations(users);
        const githubIdClusters = findGitHubIdClusters(users);

        // Count users in each cluster type
        let usersInBurstClusters = 0;
        for (const cluster of burstClusters.values()) {
            usersInBurstClusters += cluster.users.length;
        }
        let usersInGitHubIdClusters = 0;
        for (const cluster of githubIdClusters.values()) {
            usersInGitHubIdClusters += cluster.users.length;
        }

        console.log(
            `   Found ${burstClusters.size} burst registration clusters (${usersInBurstClusters} users)`,
        );
        console.log(
            `   Found ${githubIdClusters.size} GitHub ID clusters (${usersInGitHubIdClusters} users)\n`,
        );

        // Step 2: Fetch behavioral data from Tinybird
        const tinybirdToken = process.env.TINYBIRD_INGEST_TOKEN;
        let behaviorData = new Map<string, TinybirdBehaviorResult>();
        if (tinybirdToken) {
            console.log("🔍 Fetching behavioral data from Tinybird...");
            const userIds = users.map((u) => u.id);
            behaviorData = await queryTinybird(userIds, tinybirdToken);
            console.log(
                `   Got behavior data for ${behaviorData.size} users\n`,
            );
        } else {
            console.log(
                "⚠️  TINYBIRD_INGEST_TOKEN not set - skipping behavioral data\n",
            );
        }

        console.log("🔬 Analyzing users and computing scores...\n");

        // Track signal counts for summary
        const signalCounts = {
            disposable_email: 0,
            github_noreply: 0,
            email_duplicate: 0,
            username_pattern: 0,
            cross_domain: 0,
            burst_registration: 0,
            github_id_cluster: 0,
        };

        const csvRows: string[] = [];

        // CSV Header - organized by detection type for clarity
        csvRows.push(
            // === OPS CSV HEADER (for triage) ===
            // A) Decision & ranking
            // B) Who is it (stable identifiers)
            // C) Behavior evidence (Tinybird)
            // D) flag_reasons (compact summary)
            [
                // A) Decision & ranking (put first for triage)
                "risk_band",
                "combined_score",
                "behavior_score",
                "identity_score",
                "flag_reasons",
                // B) Who is it
                "user_id",
                "tier",
                "registered_at",
                "email",
                "github_username",
                "github_id",
                // C) Behavior evidence (Tinybird)
                "has_tinybird_data",
                "requests_30d",
                "tier_consumed_30d",
                "tier_usage_pct_30d",
                "pack_consumed_30d",
                "error_rate_30d",
                "client_error_rate_30d",
                "rate_limited_rate_30d",
                "unique_models_30d",
                "moderation_flags_30d",
            ].join(","),
        );
        
        // === DEBUG CSV HEADER (for engineers) ===
        const debugHeader = [
            // A) Decision & ranking
            "risk_band",
            "combined_score",
            "behavior_score",
            "identity_score",
            "confidence_level",
            "flag_reasons",
            "context_signals",
            // B) Who is it
            "user_id",
            "tier",
            "registered_at",
            "email",
            "github_username",
            "github_id",
            // C) Behavior evidence (Tinybird)
            "has_tinybird_data",
            "requests_30d",
            "tier_consumed_30d",
            "tier_usage_pct_30d",
            "pack_consumed_30d",
            "error_rate_30d",
            "client_error_rate_30d",
            "rate_limited_rate_30d",
            "unique_models_30d",
            "moderation_flags_30d",
            // D) Identity evidence (signals + counts)
            "sig_disposable",
            "sig_email_dup",
            "email_dup_count",
            "sig_cross_domain",
            "cross_domain_count",
            "sig_username_pattern",
            "username_match_count",
            "sig_burst_reg",
            "burst_cluster_size",
            "sig_github_id_cluster",
            "github_id_cluster_size",
            // E) Drill-down / clustering keys
            "burst_cluster_id",
            "ghid_cluster_id",
            "username_base",
            "email_local_base",
            // F) Debug
            "confidence_breakdown",
        ].join(",");
        
        const debugRows: string[] = [debugHeader];

        let flaggedCount = 0;
        let actionCount = 0;
        let contextOnlyCount = 0;
        let hasTinybirdCount = 0;
        let zeroUsageCount = 0;
        
        // Separate rows for actions vs context
        const actionRows: string[] = [];
        const contextRows: string[] = [];

        for (const user of users) {
            const detection = detectAbuse(user.email);

            const duplicates = findDuplicatesByNormalizedEmail(
                detection.emailNormalized,
                users.map((u) => ({ id: u.id, email: u.email })),
                user.id,
            );

            const similarUsernames = user.github_username
                ? findSimilarUsernames(user.github_username, users, user.id)
                : [];

            const crossDomainDuplicates = findCrossDomainDuplicates(
                user.email,
                users.map((u) => ({ id: u.id, email: u.email })),
                user.id,
            );

            const burstInfo = isInBurstCluster(user.id, burstClusters);
            const githubIdInfo = isInGitHubIdCluster(
                user.github_id,
                githubIdClusters,
            );

            const usernameBase = user.github_username
                ? extractUsernameBase(user.github_username)
                : "";
            const emailLocalBase = extractEmailLocalBase(user.email);

            // Build flag reasons (actionable) and context signals (watch-only)
            // GHID-only low-density users go to context, not flags
            const flagReasons: string[] = [];
            const contextSignals: string[] = [];
            
            // Determine if GHID is "strong" (density >= 0.1)
            const isStrongGhidCluster = githubIdInfo.inCluster && githubIdInfo.clusterDensity >= 0.1;
            
            if (detection.isDisposableDomain) {
                flagReasons.push("disposable_email");
                signalCounts.disposable_email++;
            }
            if (detection.isGitHubNoreply) {
                // Noreply is very weak - context only
                contextSignals.push("github_noreply");
                signalCounts.github_noreply++;
            }
            if (duplicates.length > 0) {
                flagReasons.push("email_duplicate");
                signalCounts.email_duplicate++;
            }
            if (similarUsernames.length > 0) {
                flagReasons.push("username_pattern");
                signalCounts.username_pattern++;
            }
            if (crossDomainDuplicates.length > 0) {
                flagReasons.push("cross_domain");
                signalCounts.cross_domain++;
            }
            if (burstInfo.inBurst) {
                flagReasons.push("burst_registration");
                signalCounts.burst_registration++;
            }
            if (githubIdInfo.inCluster) {
                signalCounts.github_id_cluster++;
                // Only count strong GHID clusters as flag reasons
                if (isStrongGhidCluster) {
                    flagReasons.push("github_id_cluster");
                } else {
                    // Weak GHID cluster goes to context
                    contextSignals.push("github_id_cluster_weak");
                }
            }

            const isFlagged = flagReasons.length > 0;

            // Get behavioral data and compute behavior score FIRST
            const usage = behaviorData.get(user.id);
            const behaviorScore = calculateBehaviorScore(usage);

            // Calculate unified confidence (identity + behavior input for risk banding)
            const confidenceResult = calculateConfidence({
                isDisposable: detection.isDisposableDomain,
                isGitHubNoreply: detection.isGitHubNoreply,
                duplicateCount: duplicates.length,
                similarUsernameCount: similarUsernames.length,
                crossDomainCount: crossDomainDuplicates.length,
                burstClusterSize: burstInfo.inBurst ? burstInfo.clusterSize : 0,
                githubIdClusterSize: githubIdInfo.inCluster
                    ? githubIdInfo.clusterSize
                    : 0,
                githubIdClusterDensity: githubIdInfo.inCluster
                    ? githubIdInfo.clusterDensity
                    : 0,
                behaviorScore,
            });

            // Combined score (identity + behavior, clamped to 0-100)
            const combinedScore = Math.max(
                0,
                Math.min(100, confidenceResult.score + behaviorScore),
            );

            // Use level and riskBand from unified calculation
            const level = confidenceResult.level;
            const riskBand = confidenceResult.riskBand;

            if (!includeAll && !isFlagged) continue;

            if (isFlagged) flaggedCount++;

            // Build separate cluster IDs for burst and github_id clusters
            const burstClusterId =
                burstInfo.inBurst && burstInfo.clusterKey
                    ? burstInfo.clusterKey
                    : "";
            const ghidClusterId =
                githubIdInfo.inCluster && githubIdInfo.clusterRange
                    ? githubIdInfo.clusterRange
                    : "";

            // Track Tinybird coverage: distinguish missing telemetry from zero usage
            const hasTinybirdData = usage !== undefined;
            if (hasTinybirdData) hasTinybirdCount++;
            
            // Usage metrics for CSV
            const requests30d = usage?.requests_total_30d ?? 0;
            if (hasTinybirdData && requests30d === 0) zeroUsageCount++;
            
            const tierConsumed30d = usage?.tier_consumed_30d ?? 0;
            const dailyPollen = getTierDailyPollen(user.tier);
            const allowance30d = dailyPollen * 30;
            const tierUsagePct30d =
                allowance30d > 0 ? (tierConsumed30d / allowance30d) * 100 : 0;
            const packConsumed30d = usage?.pack_consumed_30d ?? 0;

            // === OPS ROW (for triage - 20 columns) ===
            // Matches header: decision → identity → behavior
            const opsRow = [
                // A) Decision & ranking (first for triage)
                riskBand,
                String(combinedScore),
                String(behaviorScore),
                String(confidenceResult.score),
                escapeCSV(flagReasons.join("; ")),
                // B) Who is it
                escapeCSV(user.id),
                escapeCSV(user.tier),
                escapeCSV(formatDate(user.created_at)),
                escapeCSV(user.email),
                escapeCSV(user.github_username),
                user.github_id ? String(user.github_id) : "",
                // C) Behavior evidence (Tinybird)
                hasTinybirdData ? "true" : "false",
                String(requests30d),
                tierConsumed30d.toFixed(2),
                tierUsagePct30d.toFixed(1),
                packConsumed30d.toFixed(2),
                ((usage?.error_rate_30d ?? 0) * 100).toFixed(1),
                ((usage?.client_error_rate_30d ?? 0) * 100).toFixed(1),
                ((usage?.rate_limited_rate_30d ?? 0) * 100).toFixed(1),
                String(usage?.unique_models_requested_30d ?? 0),
                String(usage?.moderation_flags_count_30d ?? 0),
            ].join(",");
            
            // === DEBUG ROW (for engineers - 36 columns) ===
            // Matches debugHeader: decision → identity → behavior → signals → drill-down → debug
            const debugRow = [
                // A) Decision & ranking
                riskBand,
                String(combinedScore),
                String(behaviorScore),
                String(confidenceResult.score),
                level,
                escapeCSV(flagReasons.join("; ")),
                escapeCSV(contextSignals.join("; ")),
                // B) Who is it
                escapeCSV(user.id),
                escapeCSV(user.tier),
                escapeCSV(formatDate(user.created_at)),
                escapeCSV(user.email),
                escapeCSV(user.github_username),
                user.github_id ? String(user.github_id) : "",
                // C) Behavior evidence (Tinybird)
                hasTinybirdData ? "true" : "false",
                String(requests30d),
                tierConsumed30d.toFixed(2),
                tierUsagePct30d.toFixed(1),
                packConsumed30d.toFixed(2),
                ((usage?.error_rate_30d ?? 0) * 100).toFixed(1),
                ((usage?.client_error_rate_30d ?? 0) * 100).toFixed(1),
                ((usage?.rate_limited_rate_30d ?? 0) * 100).toFixed(1),
                String(usage?.unique_models_requested_30d ?? 0),
                String(usage?.moderation_flags_count_30d ?? 0),
                // D) Identity evidence (signals + counts) - use true/false and 0 for counts
                detection.isDisposableDomain ? "true" : "false",
                duplicates.length > 0 ? "true" : "false",
                String(duplicates.length),
                crossDomainDuplicates.length > 0 ? "true" : "false",
                String(crossDomainDuplicates.length),
                similarUsernames.length > 0 ? "true" : "false",
                String(similarUsernames.length),
                burstInfo.inBurst ? "true" : "false",
                String(burstInfo.clusterSize || 0),
                githubIdInfo.inCluster ? "true" : "false",
                String(githubIdInfo.clusterSize || 0),
                // E) Drill-down / clustering keys
                escapeCSV(burstClusterId),
                escapeCSV(ghidClusterId),
                escapeCSV(usernameBase),
                escapeCSV(emailLocalBase),
                // F) Debug
                escapeCSV(
                    confidenceResult.breakdown +
                        (behaviorScore !== 0
                            ? ` + behavior:${behaviorScore}`
                            : ""),
                ),
            ].join(",");

            csvRows.push(opsRow);
            debugRows.push(debugRow);
            
            // Split into actions (review+enforce) vs context (watch)
            if (riskBand === "enforce" || riskBand === "review") {
                actionRows.push(opsRow);
                actionCount++;
            } else {
                contextRows.push(opsRow);
                contextOnlyCount++;
            }
        }

        const opsHeader = csvRows[0];
        const debugContent = debugRows.join("\n");

        // === OUTPUT FILES (per Elliot's feedback) ===
        // abuse-actions.csv: Ops file (20 cols) - review + enforce only
        // abuse-debug.csv: Engineer file (36 cols) - all users with full detail
        
        // Write ops action file (review + enforce only, 20 columns)
        const actionPath = outputPath.replace(/\.csv$/, "-actions.csv");
        const actionContent = [opsHeader, ...actionRows].join("\n");
        writeFileSync(actionPath, actionContent, "utf-8");
        
        // Write debug file (all flagged users, 36 columns)
        const debugPath = outputPath.replace(/\.csv$/, "-debug.csv");
        writeFileSync(debugPath, debugContent, "utf-8");

        console.log("═══════════════════════════════════════════════════════");
        console.log("📊 EXPORT COMPLETE");
        console.log("═══════════════════════════════════════════════════════");
        console.log(`   Total users: ${users.length}`);
        console.log(`   Flagged users: ${flaggedCount}`);
        console.log("");
        console.log("🎯 RISK BAND BREAKDOWN:");
        console.log(`   🔴 enforce + review (actions): ${actionCount}`);
        console.log(`   🟢 watch (context-only):       ${contextOnlyCount}`);
        console.log("");
        console.log("📁 OUTPUT FILES:");
        console.log(`   abuse-actions.csv (ops, 20 cols):  ${actionPath}`);
        console.log(`   abuse-debug.csv (eng, 36 cols):    ${debugPath}`);
        console.log("");
        console.log("📊 TINYBIRD COVERAGE:");
        const missingTelemetry = flaggedCount - hasTinybirdCount;
        console.log(`   Has telemetry:      ${hasTinybirdCount} (${((hasTinybirdCount / flaggedCount) * 100).toFixed(1)}%)`);
        console.log(`   Missing telemetry:  ${missingTelemetry} (${((missingTelemetry / flaggedCount) * 100).toFixed(1)}%)`);
        console.log(`   Zero usage (30d):   ${zeroUsageCount} (${((zeroUsageCount / flaggedCount) * 100).toFixed(1)}%)`);
        console.log("");
        console.log("📈 SIGNAL BREAKDOWN (users with each signal):");
        console.log(
            `   disposable_email:     ${signalCounts.disposable_email}`,
        );
        console.log(`   github_noreply:       ${signalCounts.github_noreply} (context-only)`);
        console.log(`   email_duplicate:      ${signalCounts.email_duplicate}`);
        console.log(
            `   username_pattern:     ${signalCounts.username_pattern}`,
        );
        console.log(`   cross_domain:         ${signalCounts.cross_domain}`);
        console.log(
            `   burst_registration:   ${signalCounts.burst_registration}`,
        );
        console.log(
            `   github_id_cluster:    ${signalCounts.github_id_cluster} (strong density only)`,
        );

        // Generate markdown summary
        const summaryPath = outputPath.replace(/\.csv$/, "-summary.md");
        const summaryContent = generateMarkdownSummary({
            totalUsers: users.length,
            flaggedUsers: flaggedCount,
            actionCount,
            contextOnlyCount,
            hasTinybirdCount,
            zeroUsageCount,
            signalCounts,
            burstClusters: burstClusters.size,
            usersInBurstClusters,
            githubIdClusters: githubIdClusters.size,
            usersInGitHubIdClusters,
            env,
            timestamp: new Date().toISOString(),
        });
        writeFileSync(summaryPath, summaryContent, "utf-8");
        console.log(`   Summary file: ${summaryPath}`);

        console.log(`\n✅ CSV export complete\n`);
    },
});

interface SummaryData {
    totalUsers: number;
    flaggedUsers: number;
    actionCount: number;
    contextOnlyCount: number;
    hasTinybirdCount: number;
    zeroUsageCount: number;
    signalCounts: Record<string, number>;
    burstClusters: number;
    usersInBurstClusters: number;
    githubIdClusters: number;
    usersInGitHubIdClusters: number;
    env: string;
    timestamp: string;
}

function generateMarkdownSummary(data: SummaryData): string {
    const flaggedPct = ((data.flaggedUsers / data.totalUsers) * 100).toFixed(1);
    const actionPct = ((data.actionCount / data.flaggedUsers) * 100).toFixed(1);
    const contextPct = ((data.contextOnlyCount / data.flaggedUsers) * 100).toFixed(1);
    const missingTelemetry = data.flaggedUsers - data.hasTinybirdCount;
    const tinybirdPct = ((data.hasTinybirdCount / data.flaggedUsers) * 100).toFixed(1);
    const missingPct = ((missingTelemetry / data.flaggedUsers) * 100).toFixed(1);
    const zeroPct = ((data.zeroUsageCount / data.flaggedUsers) * 100).toFixed(1);

    return `# Abuse Detection Summary

> Generated: ${data.timestamp}  
> Environment: ${data.env}

## Overview

| Metric | Count | Percentage |
|--------|-------|-----------|
| Total users | ${data.totalUsers.toLocaleString()} | 100% |
| Flagged users | ${data.flaggedUsers.toLocaleString()} | ${flaggedPct}% |

## Risk Band Breakdown

| Risk Band | Count | % of Flagged | Action |
|-----------|-------|--------------|--------|
| 🔴 enforce + review | ${data.actionCount.toLocaleString()} | ${actionPct}% | Manual review / auto-action |
| 🟢 watch | ${data.contextOnlyCount.toLocaleString()} | ${contextPct}% | Context only, no action |

## Tinybird Coverage

| Metric | Count | % of Flagged |
|--------|-------|--------------|
| Has telemetry | ${data.hasTinybirdCount.toLocaleString()} | ${tinybirdPct}% |
| Missing telemetry | ${missingTelemetry.toLocaleString()} | ${missingPct}% |
| Zero usage (30d) | ${data.zeroUsageCount.toLocaleString()} | ${zeroPct}% |

## Signal Breakdown

Users with each detection signal:

| Signal | Users | % of Flagged | Notes |
|--------|-------|--------------|-------|
| disposable_email | ${data.signalCounts.disposable_email} | ${((data.signalCounts.disposable_email / data.flaggedUsers) * 100).toFixed(1)}% | Hard signal |
| github_noreply | ${data.signalCounts.github_noreply} | ${((data.signalCounts.github_noreply / data.flaggedUsers) * 100).toFixed(1)}% | Context only |
| email_duplicate | ${data.signalCounts.email_duplicate} | ${((data.signalCounts.email_duplicate / data.flaggedUsers) * 100).toFixed(1)}% | |
| username_pattern | ${data.signalCounts.username_pattern} | ${((data.signalCounts.username_pattern / data.flaggedUsers) * 100).toFixed(1)}% | |
| cross_domain | ${data.signalCounts.cross_domain} | ${((data.signalCounts.cross_domain / data.flaggedUsers) * 100).toFixed(1)}% | |
| burst_registration | ${data.signalCounts.burst_registration} | ${((data.signalCounts.burst_registration / data.flaggedUsers) * 100).toFixed(1)}% | |
| github_id_cluster | ${data.signalCounts.github_id_cluster} | ${((data.signalCounts.github_id_cluster / data.flaggedUsers) * 100).toFixed(1)}% | Strong density only |

## Cluster Analysis

| Cluster Type | Clusters | Users in Clusters |
|--------------|----------|-------------------|
| Burst registrations | ${data.burstClusters} | ${data.usersInBurstClusters} |
| GitHub ID clusters | ${data.githubIdClusters} | ${data.usersInGitHubIdClusters} |

---

*Note: Usage and behavioral data are now included directly in the CSV output when TINYBIRD_INGEST_TOKEN is set.*
`;
}

run([exportCsvCommand]);
