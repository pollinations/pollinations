/**
 * Simplified semantic cache eligibility system using simple JavaScript config
 * Replaces the complex token/domain whitelist system with a simple username list
 */

// Simple configuration - edit this directly or import from external file
// This works in both Cloudflare Workers and Node.js environments

// Get tokens from environment variables with multiple fallbacks
function getTokensFromConfig(env = null) {
	// Base fallback tokens for development
	const baseTokens = [
		"test-token-123", // For testing with Authorization header
		"body-token-456", // For testing with token in body
		"semantic-test-789", // Additional test token
	];

	// First check Node.js process.env (works with .env files)
	// This maintains consistency with the rest of the project
	if (typeof process !== 'undefined' && process.env?.SEMANTIC_CACHE_TOKENS) {
		const envTokens = process.env.SEMANTIC_CACHE_TOKENS
			.split(',')
			.map(token => token.trim())
			.filter(token => token.length > 0);
		return envTokens.length > 0 ? envTokens : baseTokens;
	}

	// Then check Cloudflare Workers env (for production secrets)
	if (env?.SEMANTIC_CACHE_TOKENS) {
		const envTokens = env.SEMANTIC_CACHE_TOKENS
			.split(',')
			.map(token => token.trim())
			.filter(token => token.length > 0);
		return envTokens.length > 0 ? envTokens : baseTokens;
	}

	// Fallback to base tokens for local development
	return baseTokens;
}

// Simple static configuration - tokens loaded once at startup
function createSemanticCacheConfig(env = null) {
	return {
		enabled: true,
		tokens: getTokensFromConfig(env), // Load tokens once at startup
		allowAll: false,
	};
}

// Default config for backward compatibility
const SEMANTIC_CACHE_CONFIG = createSemanticCacheConfig();

/**
 * Get semantic cache configuration
 * @param {Object} env - Cloudflare Workers environment (optional)
 * @returns {Object} Configuration object
 */
function getSemanticCacheConfig(env = null) {
	return env ? createSemanticCacheConfig(env) : SEMANTIC_CACHE_CONFIG;
}

/**
 * Check if a specific token is eligible for semantic caching
 * @param {string} token - The token to check
 * @param {Object} env - Cloudflare Workers environment (optional)
 * @returns {boolean} True if token is eligible
 */
function isTokenEligible(token, env = null) {
	if (!token) return false;

	const config = getSemanticCacheConfig(env);

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
 * @param {Object} req - Request object
 * @param {Object} env - Cloudflare Workers environment (optional)
 */
export function isSemanticCacheEligible(req, env = null) {
	try {
		// Extract token from request
		const token = extractToken(req);

		// Check if token is eligible
		const eligible = isTokenEligible(token, env);

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
 * @param {string} token - The token to check
 * @param {Object} env - Cloudflare Workers environment (optional)
 */
export function isSemanticCacheEligibleForToken(token, env = null) {
	return isTokenEligible(token, env);
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
