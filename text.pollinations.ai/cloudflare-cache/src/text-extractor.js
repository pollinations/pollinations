/**
 * Text extraction utilities for semantic caching
 * Extracts meaningful content from chat requests for better semantic matching
 */

import {
	SEMANTIC_WEIGHTING_ENABLED,
	RECENT_TURNS_COUNT,
	HISTORY_SEPARATOR,
	LATEST_EXCHANGE_START_TAG,
	LATEST_EXCHANGE_END_TAG,
} from "./config.js";

/**
 * Extract semantic text from a chat request for caching purposes
 * Focuses on user messages and system context, ignoring model parameters
 * @param {string} requestBody - Raw request body as string
 * @returns {string} - Extracted text for semantic comparison
 */
export function extractSemanticText(requestBody) {
	try {
		const parsed = JSON.parse(requestBody);

		// Handle OpenAI-style chat completion requests
		if (parsed.messages && Array.isArray(parsed.messages)) {
			return extractFromMessages(parsed.messages);
		}

		// Fallback to raw body if no structured format found
		return requestBody;
	} catch (err) {
		console.error("Error parsing request body:", err);
		// If JSON parsing fails, return raw text
		return requestBody;
	}
}

/**
 * Extract meaningful text from OpenAI-style messages array
 * Focuses on user and assistant messages for semantic matching
 * Filters out system messages as requested
 * Implements weighted semantic embeddings by emphasizing recent conversation turns
 * @param {Array} messages - Array of message objects
 * @returns {string} - Combined text for semantic comparison, with recent turns emphasized
 */
function extractFromMessages(messages) {
	const parts = [];

	for (const message of messages) {
		if (!message.role || !message.content) continue;

		const content =
			typeof message.content === "string"
				? message.content.trim()
				: JSON.stringify(message.content);

		if (!content) continue;

		switch (message.role) {
			case "user":
				// User messages are primary content for semantic matching
				parts.push(`[USER] ${content}`);
				break;

			case "assistant":
				// Assistant messages provide conversation context
				parts.push(`[ASSISTANT] ${content}`);
				break;

			// Filter out system messages from semantic caching
			// case "system":
			//   parts.push(`[SYSTEM] ${content}`);
			//   break;

			default:
				// Skip other roles for cleaner semantic matching
				// parts.push(`[${message.role.toUpperCase()}] ${content}`);
				break;
		}
	}

	const fullHistory = parts.join("\n");

	// Apply weighted semantic embeddings if enabled
	// Only use weighting if we have more than the configured number of turns
	if (SEMANTIC_WEIGHTING_ENABLED && messages.length > 0) {
		const relevantMessages = messages.filter(msg => msg.role === "user" || msg.role === "assistant");
		const totalTurns = Math.floor(relevantMessages.length / 2); // Each turn = user + assistant
		
		// Only apply weighting if we have more turns than the recent turns count
		if (totalTurns > RECENT_TURNS_COUNT) {
			const recentTurns = extractRecentTurns(messages, RECENT_TURNS_COUNT);
			if (recentTurns && recentTurns.trim().length > 0) {
				return createWeightedInput(fullHistory, recentTurns);
			}
		}
	}

	return fullHistory;
}

/**
 * Extract recent conversation turns for weighted semantic embeddings
 * @param {Array} messages - Array of message objects
 * @param {number} turnCount - Number of recent turns to extract
 * @returns {string} - Recent turns formatted for weighting
 */
function extractRecentTurns(messages, turnCount) {
	if (!messages || messages.length === 0 || turnCount <= 0) {
		return "";
	}

	// Filter to only user and assistant messages for recent turns
	const relevantMessages = messages.filter(
		(msg) => msg.role === "user" || msg.role === "assistant",
	);

	if (relevantMessages.length === 0) {
		return "";
	}

	// Extract exactly the specified number of recent turns
	// A turn is a user-assistant pair, so we need turnCount * 2 messages
	const messagesToTake = Math.min(turnCount * 2, relevantMessages.length);
	const recentMessages = relevantMessages.slice(-messagesToTake);
	
	const recentParts = [];
	for (const message of recentMessages) {
		if (!message.content) continue;

		const content = typeof message.content === "string" 
			? message.content.trim() 
			: JSON.stringify(message.content);
		
		if (!content) continue;

		if (message.role === "user") {
			recentParts.push(`[USER] ${content}`);
		} else if (message.role === "assistant") {
			recentParts.push(`[ASSISTANT] ${content}`);
		}
	}

	return recentParts.join(" ");
}

/**
 * Create weighted input by combining full history with emphasized recent turns
 * Uses hybrid approach: mathematical weighting (repetition) + semantic highlighting (structural tags)
 * @param {string} fullHistory - Complete conversation history
 * @param {string} recentTurns - Recent conversation turns to emphasize
 * @returns {string} - Weighted input for embedding generation with structural markup
 */
function createWeightedInput(fullHistory, recentTurns) {
	if (!recentTurns || recentTurns.trim().length === 0) {
		return fullHistory;
	}

	// Create marked-up recent history with structural tags
	// This provides both mathematical weight (repetition) and semantic highlighting (tags)
	const markedUpRecentHistory = `${LATEST_EXCHANGE_START_TAG} ${recentTurns} ${LATEST_EXCHANGE_END_TAG}`;

	// Combine full history with marked-up recent turns using clear separator
	// This gives the BGE-M3 model multiple signals:
	// 1. Mathematical weight from repetition
	// 2. Semantic highlighting from structural tags
	// 3. Clear separation for model to distinguish sections
	return `${fullHistory}${HISTORY_SEPARATOR}${markedUpRecentHistory}`;
}

/**
 * Normalize text for better semantic matching
 * Removes extra whitespace, normalizes punctuation
 * @param {string} text - Input text
 * @returns {string} - Normalized text
 */
export function normalizeText(text) {
	return text
		.replace(/\s+/g, " ") // Normalize whitespace
		.replace(/[""]/g, '"') // Normalize quotes
		.replace(/['']/g, "'") // Normalize apostrophes
		.trim();
}

/**
 * Extract the model name from a request body
 * @param {string} requestBody - Raw request body as string
 * @returns {string} - Model name or 'unknown' if not found
 */
export function extractModelName(requestBody) {
	try {
		const parsed = JSON.parse(requestBody);

		// Handle OpenAI-style requests
		if (typeof parsed.model === "string") {
			return parsed.model.toLowerCase().trim();
		}

		// Handle other possible model field names
		if (typeof parsed.engine === "string") {
			return parsed.engine.toLowerCase().trim();
		}

		if (typeof parsed.model_name === "string") {
			return parsed.model_name.toLowerCase().trim();
		}

		return "unknown";
	} catch (err) {
		// If JSON parsing fails, return unknown
		return "unknown";
	}
}

/**
 * Extract the seed value from a request body
 * @param {string} requestBody - Raw request body as string
 * @returns {string|null} - Seed value or null if not found
 */
export function extractSeed(requestBody) {
	try {
		const parsed = JSON.parse(requestBody);

		// Check for seed as a top-level parameter (primary location)
		if (typeof parsed.seed === "number" || typeof parsed.seed === "string") {
			return String(parsed.seed);
		}

		return null;
	} catch (err) {
		// If JSON parsing fails, return null
		return null;
	}
}

/**
 * Extract seed from URL query parameters
 * @param {string} url - The request URL
 * @returns {string|null} - Seed value or null if not found
 */
export function extractSeedFromUrl(url) {
	try {
		const urlObj = new URL(url, "http://x"); // Use dummy base for relative URLs
		const seedParam = urlObj.searchParams.get("seed");
		
		if (seedParam !== null) {
			return seedParam;
		}
		
		return null;
	} catch (err) {
		return null;
	}
}

/**
 * Extract semantic text with normalization
 * @param {string} requestBody - Raw request body
 * @returns {string} - Extracted and normalized text
 */
export function extractAndNormalizeSemanticText(requestBody) {
	const extracted = extractSemanticText(requestBody);
	return normalizeText(extracted);
}
