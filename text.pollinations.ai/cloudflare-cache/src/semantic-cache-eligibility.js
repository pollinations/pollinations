/**
 * Simplified semantic cache eligibility system using simple JavaScript config
 * Replaces the complex token/domain whitelist system with a simple username list
 */

import { extractToken } from "../../../shared/extractFromRequest.js";

// Simple configuration - edit this directly or import from external file
// This works in both Cloudflare Workers and Node.js environments
const SEMANTIC_CACHE_CONFIG = {
	enabled: true,
	tokens: [
		// Add your allowed tokens here - these will be checked directly
		"test-token-123", // For testing with Authorization header
		"body-token-456", // For testing with token in body
		"semantic-test-789", // Additional test token
	],
	allowAll: false,
};

/**
 * Get semantic cache configuration
 * @returns {Object} Configuration object
 */
function getSemanticCacheConfig() {
	return SEMANTIC_CACHE_CONFIG;
}

/**
 * Check if a specific token is eligible for semantic caching
 * @param {string} token - The token to check
 * @returns {boolean} True if token is eligible
 */
function isTokenEligible(token) {
	if (!token) return false;

	const config = getSemanticCacheConfig();

	// Check if semantic caching is globally enabled
	if (!config.enabled) {
		return false;
	}

	// Check if all tokens are allowed
	if (config.allowAll) {
		return true;
	}

	// Check if token is in the tokens list
	const eligibleTokens = config.tokens.filter(
		(token) => typeof token === "string",
	);

	return eligibleTokens.includes(token);
}

/**
 * Main function to determine if a token should get semantic caching
 * Extracts token from request and checks against SEMANTIC_CACHE_CONFIG
 */
export function isSemanticCacheEligible(req) {
	try {
		// Extract token from request
		const token = extractToken(req);

		// Check if token is eligible
		const eligible = isTokenEligible(token);

		let authType = "anonymous";
		let authInfo = "no authentication";

		if (token) {
			authType = "token";
			authInfo = `token ${token.substring(0, 8)}...`;
		}

		return {
			eligible,
			reason: eligible
				? `token is in semantic cache token list`
				: token
					? `token not in semantic cache token list`
					: "no authentication token for semantic cache",
			authType,
			token: token ? token.substring(0, 8) + "..." : null,
			authInfo,
		};
	} catch (error) {
		console.warn("Error checking semantic cache eligibility:", error);
		return {
			eligible: false,
			reason: "eligibility check failed",
			error: error.message,
		};
	}
}

/**
 * Simple eligibility check that can be called with token directly
 * This is the main function for other code to use
 */
export function isSemanticCacheEligibleForToken(token) {
	return isTokenEligible(token);
}

/**
 * Get current semantic cache token configuration (for debugging)
 */
export function getSemanticCacheTokens() {
	const config = getSemanticCacheConfig();

	if (!config.enabled) {
		return { enabled: false, tokens: [], allowAll: false };
	}

	return {
		enabled: config.enabled,
		tokens: config.tokens || [],
		allowAll: config.allowAll || false,
	};
}
