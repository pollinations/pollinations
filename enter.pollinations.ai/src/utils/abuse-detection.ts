/**
 * Abuse Detection Module
 *
 * This module provides functions to detect potential abuse patterns in user registrations.
 * It analyzes email addresses, GitHub usernames, registration timestamps, and GitHub IDs
 * to identify Sybil attacks (one person creating multiple accounts).
 *
 * Detection Methods:
 * 1. Disposable Email Detection - Flags temporary email services (high confidence)
 * 2. GitHub Noreply Detection - Flags private GitHub emails (medium confidence)
 * 3. Email Normalization - Detects aliases like user+tag@gmail.com = user@gmail.com
 * 4. Username Pattern Detection - Finds sequential usernames like user01, user02
 * 5. Cross-Domain Detection - Finds same username across gmail.com, yahoo.com, etc.
 * 6. Burst Registration Detection - Finds accounts created within 5-min windows
 * 7. GitHub ID Clustering - Finds accounts with sequential GitHub IDs (botnet indicator)
 */

import { isDisposableEmail as checkDisposable } from "disposable-email-domains-js";

// ============================================================================
// TYPES
// ============================================================================

/** Confidence level for abuse detection - determines tier assignment */
export type AbuseConfidence = "high" | "medium" | "low" | "none";

/** Result of running detectAbuse() on a single email */
export interface AbuseDetectionResult {
    confidence: AbuseConfidence;
    signals: string[];
    emailNormalized: string;
    emailBase: string;
    isDisposableDomain: boolean;
    isGitHubNoreply: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Gmail treats dots as optional and allows + aliases */
const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

// ============================================================================
// EMAIL NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Normalizes an email address to detect aliases of the same account.
 *
 * Gmail-specific rules:
 * - Removes dots: j.o.h.n@gmail.com -> john@gmail.com
 * - Removes +suffix: john+spam@gmail.com -> john@gmail.com
 *
 * Other providers:
 * - Only removes +suffix (most providers support this)
 *
 * @example
 * normalizeEmail("J.O.H.N+spam@gmail.com") // "john@gmail.com"
 * normalizeEmail("user+tag@yahoo.com")     // "user@yahoo.com"
 */
export function normalizeEmail(email: string): string {
    const [localPart, domain] = email.toLowerCase().split("@");
    if (!localPart || !domain) return email.toLowerCase();

    // Gmail ignores dots and supports + aliases
    if (GMAIL_DOMAINS.includes(domain)) {
        const withoutPlus = localPart.split("+")[0];
        const withoutDots = withoutPlus.replace(/\./g, "");
        return `${withoutDots}@gmail.com`;
    }

    // Other providers: just remove + alias
    const withoutPlus = localPart.split("+")[0];
    return `${withoutPlus}@${domain}`;
}

/**
 * Extracts a "base" username from an email for fuzzy matching.
 * Strips trailing numbers to match john1@, john2@, john99@ as the same person.
 *
 * Special handling for GitHub noreply emails:
 * - Format: 12345678+username@users.noreply.github.com
 * - Extracts just the username part
 *
 * @example
 * extractEmailBase("john123@gmail.com")                    // "john"
 * extractEmailBase("12345+octocat@users.noreply.github.com") // "octocat"
 */
export function extractEmailBase(email: string): string {
    const [localPart, domain] = email.toLowerCase().split("@");
    if (!localPart || !domain) return "";

    // GitHub noreply format: 12345678+username@users.noreply.github.com
    if (domain === "users.noreply.github.com") {
        const match = localPart.match(/^\d+\+(.+)$/);
        return match ? match[1] : localPart;
    }

    // Strip trailing numbers: john123 -> john
    const withoutPlus = localPart.split("+")[0];
    const withoutNumbers = withoutPlus.replace(/\d+$/, "");
    return withoutNumbers || withoutPlus;
}

// ============================================================================
// EMAIL CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Checks if email is a GitHub private noreply address.
 * Users can configure GitHub to hide their real email, which makes it harder
 * to detect duplicate accounts.
 */
export function isGitHubNoreplyEmail(email: string): boolean {
    return email.toLowerCase().endsWith("@users.noreply.github.com");
}

/**
 * Checks if email domain is a known disposable/temporary email service.
 * Uses the disposable-email-domains-js library which maintains a list of
 * thousands of disposable email domains.
 */
export function isDisposableEmail(email: string): boolean {
    return checkDisposable(email);
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Analyzes a single email address for abuse signals.
 * This is the primary function called during user registration.
 *
 * Confidence levels determine initial tier assignment:
 * - "high": Disposable email -> assign to "microbe" tier (0 pollen)
 * - "medium": GitHub noreply -> assign to "spore" tier (limited pollen)
 * - "none": Clean email -> assign to "seed" tier (normal pollen)
 *
 * @returns Object containing confidence level, signals array, and normalized email variants
 */
export function detectAbuse(email: string): AbuseDetectionResult {
    const signals: string[] = [];

    // Compute normalized forms of the email
    const emailNormalized = normalizeEmail(email);
    const emailBase = extractEmailBase(email);

    // Run individual detection checks
    const disposable = isDisposableEmail(email);
    const githubNoreply = isGitHubNoreplyEmail(email);

    // Collect all triggered signals
    if (disposable) {
        signals.push("disposable_domain");
    }

    if (githubNoreply) {
        signals.push("github_noreply");
    }

    // Determine confidence level (highest signal wins)
    let confidence: AbuseConfidence = "none";

    if (disposable) {
        confidence = "high";
    } else if (githubNoreply) {
        confidence = "medium";
    }

    return {
        confidence,
        signals,
        emailNormalized,
        emailBase,
        isDisposableDomain: disposable,
        isGitHubNoreply: githubNoreply,
    };
}

// ============================================================================
// DUPLICATE DETECTION FUNCTIONS
// ============================================================================

/**
 * Finds other users with the same normalized email address.
 * Used to detect accounts that are definitely aliases of each other.
 *
 * @example
 * // These would all match as duplicates:
 * // "john@gmail.com", "j.o.h.n@gmail.com", "john+work@gmail.com"
 */
export function findDuplicatesByNormalizedEmail(
    targetNormalized: string,
    allUsers: Array<{ id: string; email: string }>,
    excludeUserId?: string,
): Array<{ id: string; email: string; normalized: string }> {
    return allUsers
        .filter((u) => u.id !== excludeUserId)
        .map((u) => ({ ...u, normalized: normalizeEmail(u.email) }))
        .filter((u) => u.normalized === targetNormalized);
}

/**
 * Finds users with similar email bases (fuzzy matching).
 * Less precise than normalized matching but catches patterns like john1@, john2@
 *
 * @param targetBase - The base to search for (e.g., "john" from "john123@gmail.com")
 * @param minLength - Safety: requires base >= 3 chars to avoid false positives on short names
 */
export function findDuplicatesByEmailBase(
    targetBase: string,
    allUsers: Array<{ id: string; email: string }>,
    excludeUserId?: string,
): Array<{ id: string; email: string; base: string }> {
    // Skip if base is too short to be meaningful
    if (!targetBase || targetBase.length < 3) return [];

    return allUsers
        .filter((u) => u.id !== excludeUserId)
        .map((u) => ({ ...u, base: extractEmailBase(u.email) }))
        .filter((u) => u.base === targetBase);
}

// ============================================================================
// USERNAME PATTERN DETECTION
// ============================================================================

/**
 * Extracts a base username by stripping leading and trailing numbers.
 * Used to detect sequential account patterns like user01, user02, cid47kagenou, cid48kagenou.
 *
 * @example
 * extractUsernameBase("cid47kagenou") // "kagenou"
 * extractUsernameBase("user123")       // "user"
 * extractUsernameBase("99problems99")  // "problems"
 */
export function extractUsernameBase(username: string): string {
    if (!username) return "";
    const lower = username.toLowerCase();
    // Remove trailing numbers: user123 -> user
    const withoutTrailingNumbers = lower.replace(/\d+$/, "");
    // Remove leading numbers: 47user -> user
    const withoutLeadingNumbers = withoutTrailingNumbers.replace(/^\d+/, "");
    return withoutLeadingNumbers || lower;
}

/**
 * Extracts a heavily normalized local part for cross-domain matching.
 * Strips dots, plus-suffixes, AND all numbers to find "john" in john123@gmail.com
 *
 * @example
 * extractEmailLocalBase("john123@gmail.com")     // "john"
 * extractEmailLocalBase("j.o.h.n@gmail.com")     // "john"
 * extractEmailLocalBase("john+spam@yahoo.com")   // "john"
 */
export function extractEmailLocalBase(email: string): string {
    const [localPart] = email.toLowerCase().split("@");
    if (!localPart) return "";
    const withoutPlus = localPart.split("+")[0];
    const withoutDots = withoutPlus.replace(/\./g, "");
    // Remove ALL numbers (not just trailing) for aggressive matching
    const withoutNumbers = withoutDots.replace(/\d+/g, "");
    return withoutNumbers || withoutDots;
}

/**
 * Finds users with similar GitHub usernames (sequential pattern detection).
 * Detects abuse patterns like cid47kagenou, cid48kagenou, cid61kagenou.
 *
 * @param minBaseLength - Safety: requires base >= 4 chars to avoid false positives
 * @returns Array of users with matching username bases
 */
export function findSimilarUsernames(
    targetUsername: string,
    allUsers: Array<{ id: string; github_username: string | null }>,
    excludeUserId?: string,
    minBaseLength = 4,
): Array<{ id: string; github_username: string; usernameBase: string }> {
    const targetBase = extractUsernameBase(targetUsername);
    // Skip if base is too short to be meaningful
    if (!targetBase || targetBase.length < minBaseLength) return [];

    return allUsers
        .filter((u) => u.id !== excludeUserId && u.github_username)
        .map((u) => ({
            id: u.id,
            github_username: u.github_username as string,
            usernameBase: extractUsernameBase(u.github_username as string),
        }))
        .filter((u) => u.usernameBase === targetBase);
}

// ============================================================================
// CROSS-DOMAIN DETECTION
// ============================================================================

/**
 * Common email local parts that should never trigger cross-domain detection.
 * These are generic business/personal prefixes used by many unrelated people.
 */
const COMMON_LOCAL_PARTS = new Set([
    "admin",
    "support",
    "hello",
    "info",
    "contact",
    "sales",
    "noreply",
    "no-reply",
    "team",
    "mail",
    "me",
    "test",
    "dev",
    "webmaster",
    "postmaster",
    "hostmaster",
    "abuse",
    "security",
    "billing",
    "help",
    "office",
    "marketing",
    "hr",
    "jobs",
    "careers",
    "press",
    "media",
    "news",
    "newsletter",
    "subscribe",
    "unsubscribe",
    "feedback",
    "enquiry",
    "inquiry",
    "user",
    "users",
    "account",
    "accounts",
    "service",
    "services",
]);

/**
 * Checks if an email local part is a common/generic prefix.
 * These should be excluded from cross-domain detection.
 */
export function isCommonLocalPart(localPart: string): boolean {
    if (!localPart) return false;
    return COMMON_LOCAL_PARTS.has(localPart.toLowerCase());
}

/**
 * Checks if an email local part has high entropy (likely unique/generated).
 * Low-entropy names like "david", "john", "alex" are common and cause false positives.
 * High-entropy names like "x89s7f", "john2847", "dev_test_123" are more suspicious.
 *
 * Criteria for high entropy:
 * - NOT a common business prefix (admin, support, etc.)
 * - Contains both letters AND numbers, OR
 * - Length >= 8 characters, OR
 * - Contains underscores/special patterns
 *
 * @returns true if the identifier looks unique enough to flag
 */
export function isHighEntropyIdentifier(localPart: string): boolean {
    if (!localPart) return false;

    // Exclude common business/generic prefixes
    if (isCommonLocalPart(localPart)) return false;

    // Short names are likely common (john, alex, david)
    if (localPart.length < 6) return false;

    const hasLetters = /[a-z]/i.test(localPart);
    const hasNumbers = /[0-9]/.test(localPart);
    const hasUnderscore = /_/.test(localPart);

    // Mix of letters and numbers = likely generated/unique
    if (hasLetters && hasNumbers) return true;

    // Underscores often indicate programmatic naming
    if (hasUnderscore) return true;

    // Long names (8+) are more likely to be unique
    if (localPart.length >= 8) return true;

    return false;
}

/**
 * Finds users with the same email username across different domains.
 * Detects patterns like john@gmail.com, john@yahoo.com, john@outlook.com.
 *
 * This catches abusers who use the same username but different providers
 * to create multiple accounts.
 *
 * NOTE: Only flags high-entropy identifiers to avoid false positives on
 * common names like "david" or "john".
 *
 * @param minBaseLength - Safety: requires base >= 5 chars to avoid false positives
 * @param requireHighEntropy - If true, skip low-entropy common names (default: true)
 */
export function findCrossDomainDuplicates(
    targetEmail: string,
    allUsers: Array<{ id: string; email: string }>,
    excludeUserId?: string,
    minBaseLength = 5,
    requireHighEntropy = true,
): Array<{ id: string; email: string; localBase: string }> {
    const targetLocalBase = extractEmailLocalBase(targetEmail);
    // Skip if base is too short to be meaningful
    if (!targetLocalBase || targetLocalBase.length < minBaseLength) return [];

    // Skip low-entropy common names (david, john, alex) to avoid false positives
    if (requireHighEntropy && !isHighEntropyIdentifier(targetLocalBase))
        return [];

    return allUsers
        .filter((u) => u.id !== excludeUserId)
        .map((u) => ({
            id: u.id,
            email: u.email,
            localBase: extractEmailLocalBase(u.email),
        }))
        .filter((u) => u.localBase === targetLocalBase);
}

// ============================================================================
// BURST REGISTRATION DETECTION
// ============================================================================

/**
 * Burst detection catches scripted OAuth flows where an abuser creates many
 * accounts in rapid succession. Real humans don't sign up 10 accounts in 5 minutes.
 */

/** Time window for burst detection (5 minutes in seconds - matches D1 timestamp format) */
const BURST_WINDOW_SECONDS = 5 * 60;

/** Minimum number of accounts in a window to be considered a "burst" */
const BURST_MIN_CLUSTER_SIZE = 15;

/** Represents a cluster of accounts created within a short time window */
export interface BurstCluster {
    windowStart: number;
    windowEnd: number;
    users: Array<{ id: string; created_at: number }>;
}

/**
 * Finds groups of accounts created within the same time window.
 * This detects scripted OAuth flows where bots create accounts in rapid succession.
 *
 * Algorithm:
 * 1. Sort all users by registration timestamp
 * 2. For each user, look ahead within the time window
 * 3. If >= minClusterSize users are in that window, mark as a cluster
 *
 * @param windowSeconds - Time window in seconds (default: 5 minutes = 300s)
 * @param minClusterSize - Minimum accounts to flag as suspicious (default: 3)
 * @returns Map of cluster keys to cluster data
 */
export function findBurstRegistrations(
    allUsers: Array<{ id: string; created_at: number }>,
    windowSeconds = BURST_WINDOW_SECONDS,
    minClusterSize = BURST_MIN_CLUSTER_SIZE,
): Map<string, BurstCluster> {
    // Sort users by registration time (oldest first)
    const sorted = [...allUsers].sort((a, b) => a.created_at - b.created_at);
    const clusters = new Map<string, BurstCluster>();

    // Slide through users and find clusters
    for (let i = 0; i < sorted.length; i++) {
        const windowStart = sorted[i].created_at;
        const windowEnd = windowStart + windowSeconds;

        // Find all users registered within this window
        const usersInWindow = sorted.filter(
            (u) => u.created_at >= windowStart && u.created_at < windowEnd,
        );

        // If enough users in window, record as a cluster
        if (usersInWindow.length >= minClusterSize) {
            // Use bucketed key to avoid duplicate clusters
            const clusterKey = String(Math.floor(windowStart / windowSeconds));
            if (!clusters.has(clusterKey)) {
                clusters.set(clusterKey, {
                    windowStart,
                    windowEnd,
                    users: usersInWindow,
                });
            }
        }
    }

    return clusters;
}

/**
 * Checks if a specific user belongs to any burst registration cluster.
 *
 * @returns Object with inBurst flag, cluster size, and cluster key
 */
export function isInBurstCluster(
    userId: string,
    burstClusters: Map<string, BurstCluster>,
): { inBurst: boolean; clusterSize: number; clusterKey: string | null } {
    for (const [key, cluster] of burstClusters) {
        if (cluster.users.some((u) => u.id === userId)) {
            return {
                inBurst: true,
                clusterSize: cluster.users.length,
                clusterKey: key,
            };
        }
    }
    return { inBurst: false, clusterSize: 0, clusterKey: null };
}

// ============================================================================
// GITHUB ID CLUSTERING DETECTION
// ============================================================================

/**
 * GitHub assigns user IDs sequentially. When botnets create accounts in batches,
 * the resulting GitHub IDs end up in tight clusters (e.g., 12345000-12345999).
 * This is a strong signal of automated account creation.
 */

/** Maximum gap between GitHub IDs to consider them part of the same cluster */
const GITHUB_ID_CLUSTER_RANGE = 1000;

/** Minimum accounts in a cluster to flag as suspicious */
const GITHUB_ID_MIN_CLUSTER_SIZE = 5;

/** Maximum time window for GitHub ID cluster (60 minutes in seconds) */
const GITHUB_ID_TIME_WINDOW_SECONDS = 60 * 60;

/** Represents a cluster of accounts with sequential GitHub IDs */
export interface GitHubIdCluster {
    rangeStart: number;
    rangeEnd: number;
    users: Array<{ id: string; github_id: number; created_at: number }>;
    /** Cluster density = users.length / (rangeEnd - rangeStart + 1). Higher = more suspicious */
    density: number;
}

/**
 * Finds clusters of accounts with GitHub IDs in tight numeric ranges AND
 * registered on our platform within a short time window.
 *
 * This detects botnets that create GitHub accounts in batches. The key insight
 * is that sequential GitHub IDs alone are not suspicious (people create GitHub
 * accounts around the same time globally). But sequential IDs + same-hour signup
 * on YOUR platform = scripted attack.
 *
 * Algorithm:
 * 1. Filter users with GitHub IDs and created_at timestamps
 * 2. Sort by GitHub ID
 * 3. Walk through sorted list, grouping consecutive IDs with small gaps
 * 4. For each potential cluster, sub-cluster by registration time proximity
 * 5. If a sub-cluster has >= minClusterSize users, mark as suspicious
 *
 * @param maxRange - Maximum gap between IDs to be in same cluster (default: 1000)
 * @param minClusterSize - Minimum accounts to flag as suspicious (default: 5)
 * @param timeWindowSeconds - Max time between registrations (default: 60 min)
 * @returns Map of range strings to cluster data
 *
 * @example
 * // GitHub IDs 12340001-12340020 registered within same hour = cluster
 * // GitHub IDs 12340001-12340020 registered months apart = NOT a cluster
 */
export function findGitHubIdClusters(
    allUsers: Array<{
        id: string;
        github_id: number | null;
        created_at: number;
    }>,
    maxRange = GITHUB_ID_CLUSTER_RANGE,
    minClusterSize = GITHUB_ID_MIN_CLUSTER_SIZE,
    timeWindowSeconds = GITHUB_ID_TIME_WINDOW_SECONDS,
): Map<string, GitHubIdCluster> {
    // Filter to only users with GitHub IDs and timestamps
    const withGitHubId = allUsers.filter(
        (u): u is { id: string; github_id: number; created_at: number } =>
            u.github_id !== null && u.created_at !== undefined,
    );

    // Sort by GitHub ID (ascending)
    const sorted = [...withGitHubId].sort((a, b) => a.github_id - b.github_id);
    const clusters = new Map<string, GitHubIdCluster>();

    // Walk through sorted list and find dense ID regions
    let clusterStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
        const isEnd = i === sorted.length;
        const gap = isEnd
            ? Infinity
            : sorted[i].github_id - sorted[i - 1].github_id;

        // If gap is too large or we're at end, process current ID cluster
        if (gap > maxRange || isEnd) {
            const idClusterUsers = sorted.slice(clusterStart, i);

            // Now sub-cluster by registration time proximity
            if (idClusterUsers.length >= minClusterSize) {
                const timeClusters = subClusterByTime(
                    idClusterUsers,
                    timeWindowSeconds,
                    minClusterSize,
                );

                // Add valid time-constrained clusters
                for (const timeCluster of timeClusters) {
                    // IMPORTANT: timeCluster is sorted by created_at, NOT github_id
                    // So we must compute min/max github_id explicitly
                    const githubIds = timeCluster.map((u) => u.github_id);
                    const rangeStart = Math.min(...githubIds);
                    const rangeEnd = Math.max(...githubIds);
                    const clusterKey = `${rangeStart}-${rangeEnd}`;
                    // Ensure idRange is always >= 1 to avoid division issues
                    const rawIdRange = rangeEnd - rangeStart + 1;
                    const idRange = Math.max(1, rawIdRange);
                    const rawDensity = timeCluster.length / idRange;
                    // Clamp density to [0, 1] range
                    const density = Math.min(1, rawDensity);

                    // Diagnostic: log if we had to clamp (indicates upstream bug)
                    if (rawIdRange <= 0 || rawDensity < 0 || rawDensity > 1) {
                        console.warn(
                            `[abuse-detection] GitHub cluster density anomaly: ` +
                                `range=${clusterKey}, rawIdRange=${rawIdRange}, ` +
                                `rawDensity=${rawDensity.toFixed(4)}, clampedTo=${density.toFixed(4)}`,
                        );
                    }
                    clusters.set(clusterKey, {
                        rangeStart,
                        rangeEnd,
                        users: timeCluster,
                        density,
                    });
                }
            }

            clusterStart = i;
        }
    }

    return clusters;
}

/**
 * Sub-clusters users by registration time proximity.
 * Groups users who registered within timeWindowSeconds of each other.
 */
function subClusterByTime(
    users: Array<{ id: string; github_id: number; created_at: number }>,
    timeWindowSeconds: number,
    minClusterSize: number,
): Array<Array<{ id: string; github_id: number; created_at: number }>> {
    // Sort by registration time
    const sorted = [...users].sort((a, b) => a.created_at - b.created_at);
    const clusters: Array<
        Array<{ id: string; github_id: number; created_at: number }>
    > = [];

    let clusterStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
        const isEnd = i === sorted.length;
        const timeGap = isEnd
            ? Infinity
            : sorted[i].created_at - sorted[i - 1].created_at;

        // If time gap exceeds window, close current cluster
        if (timeGap > timeWindowSeconds || isEnd) {
            const cluster = sorted.slice(clusterStart, i);
            if (cluster.length >= minClusterSize) {
                clusters.push(cluster);
            }
            clusterStart = i;
        }
    }

    return clusters;
}

/**
 * Checks if a specific GitHub ID belongs to any suspicious cluster.
 *
 * @param githubId - The GitHub ID to check (null if user doesn't have one)
 * @param gitHubIdClusters - Pre-computed clusters from findGitHubIdClusters()
 * @returns Object with inCluster flag, cluster size, density, and cluster range string
 */
export function isInGitHubIdCluster(
    githubId: number | null,
    gitHubIdClusters: Map<string, GitHubIdCluster>,
): {
    inCluster: boolean;
    clusterSize: number;
    clusterDensity: number;
    clusterRange: string | null;
} {
    // Users without GitHub ID can't be in a cluster
    if (githubId === null) {
        return {
            inCluster: false,
            clusterSize: 0,
            clusterDensity: 0,
            clusterRange: null,
        };
    }

    // Search all clusters for this GitHub ID
    for (const [range, cluster] of gitHubIdClusters) {
        if (cluster.users.some((u) => u.github_id === githubId)) {
            return {
                inCluster: true,
                clusterSize: cluster.users.length,
                clusterDensity: cluster.density,
                clusterRange: range,
            };
        }
    }
    return {
        inCluster: false,
        clusterSize: 0,
        clusterDensity: 0,
        clusterRange: null,
    };
}
