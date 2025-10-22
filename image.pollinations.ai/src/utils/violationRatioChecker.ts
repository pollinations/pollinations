/**
 * Violation ratio checking utility for gptimage model
 * Handles automatic blocking of users with high violation rates
 */

import { userStatsTracker } from "./userStatsTracker.ts";
import debug from "debug";

const logError = debug("pollinations:error");

export interface ViolationCheckResult {
    blocked: boolean;
    reason?: string;
    violationRatio?: number;
    stats?: {
        requests: number;
        violations: number;
    };
}

/**
 * Check if a user should be blocked based on violation ratio
 * @param username - Username to check
 * @returns ViolationCheckResult with blocking decision
 */
export function checkViolationRatio(username: string | null | undefined): ViolationCheckResult {
    // Skip check for anonymous or missing usernames
    if (!username || username === 'anonymous') {
        return { blocked: false };
    }

    const stats = userStatsTracker.getUserStats(username);
    const violationRatio = stats.requests > 0 ? stats.violations / stats.requests : 0;
    
    const MIN_REQUESTS = 25;
    const MAX_VIOLATION_RATIO = 0.25; // 25% threshold

    // Block if violation ratio exceeds threshold AND user has enough requests
    if (stats.requests >= MIN_REQUESTS && violationRatio > MAX_VIOLATION_RATIO) {
        const reason = `User blocked due to high violation ratio (${(violationRatio * 100).toFixed(1)}% violations). Contact support for review.`;
        logError(`🚫 Blocking ${username} for gptimage: ${stats.violations}/${stats.requests} violations`);
        
        return {
            blocked: true,
            reason,
            violationRatio,
            stats,
        };
    }

    return { blocked: false };
}

/**
 * Record a gptimage request for a user
 * @param username - Username making the request
 */
export function recordGptImageRequest(username: string | null | undefined): void {
    if (username && username !== 'anonymous') {
        userStatsTracker.recordRequest(username);
    }
}
