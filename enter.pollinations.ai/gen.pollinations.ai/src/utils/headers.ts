/**
 * Header utilities for gen.pollinations.ai proxy
 */

import type { User } from "../../../src/auth.ts";

/**
 * Creates generation headers to send to backend services
 * Includes user identification and tier information
 */
export function generationHeaders(
    user?: User,
    enterToken?: string
): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (enterToken) {
        headers["x-enter-token"] = enterToken;
    }
    
    if (user) {
        headers["x-github-id"] = String(user.githubId);
        headers["x-user-tier"] = user.tier;
    }
    
    return headers;
}
