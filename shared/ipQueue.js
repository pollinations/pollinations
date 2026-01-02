/**
 * Shared IP-based queue management for Pollinations services
 * This module provides a consistent way to handle rate limiting across services
 *
 * Usage:
 * import { enqueue } from '../shared/ipQueue.js';
 * await enqueue(req, () => processRequest(), { interval: 6000 });
 */

import PQueue from "p-queue";
import { incrementUserMetric } from "./userMetrics.js";
import debug from "debug";
import { shouldBypassQueue, isEnterRequest } from "./auth-utils.js";

// Import rate limit logger for detailed 429 error logging
let logRateLimitError = null;

// Async function to load rate limit logger
async function loadRateLimitLogger() {
	try {
		// Dynamic import to avoid breaking services that don't have the text service logging
		const rateLimitLogger = await import("../text.pollinations.ai/logging/rateLimitLogger.js");
		logRateLimitError = rateLimitLogger.logRateLimitError;
	} catch (error) {
		// Silently fail if rate limit logger not available (e.g., in image service)
		debug("pollinations:queue")("Rate limit logger not available:", error.message);
	}
}

// Load the logger asynchronously
loadRateLimitLogger();

// Set up debug loggers with namespaces
const log = debug("pollinations:queue");
const errorLog = debug("pollinations:error");
const authLog = debug("pollinations:auth");

// Helper: Create error with status and context
const createError = (message, status, context = {}) => {
	const error = new Error(message);
	error.status = status;
	Object.assign(error, context);
	return error;
};

// Helper: Get priority or tier-based cap
const getCapForTier = (authResult) => {
	const userId = authResult.userId;
	if (userId && specialModelPriorityUsers.has(userId)) {
		const cap = specialModelPriorityUsers.get(userId);
		log('Using priority cap: %d for user: %s', cap, userId);
		return cap;
	}
	
	const cap = tierCaps[authResult.tier] || 1;
	log('Using tier-based cap: %d for tier: %s', cap, authResult.tier);
	return cap;
};

// In-memory queue storage
const queues = new Map();

const tierCaps = {
    anonymous: 1,
    seed: 3,
    flower: 6,
    nectar: 20,
};

// Parse priority users from environment variable
const parsePriorityUsers = () => {
    const envVar = process.env.PRIORITY_MODEL_USERS;
    if (!envVar) return new Map();
    
    const priorityUsers = new Map();
    envVar.split(',').forEach(entry => {
        const [username, limit] = entry.split(':');
        priorityUsers.set(username.trim(), parseInt(limit) || 5); // Default to 5 concurrent if no limit specified
    });
    return priorityUsers;
};

const specialModelPriorityUsers = parsePriorityUsers();

// Log priority users on startup for debugging
if (specialModelPriorityUsers.size > 0) {
    log('Priority users loaded: %o', Array.from(specialModelPriorityUsers.entries()));
}

/**
 * Enqueue a function to be executed based on IP address
 * Requests with valid tokens or from allowlisted domains bypass the queue
 *
 * @param {Request|Object} req - The request object
 * @param {Function} fn - The function to execute
 * @param {Object} options - Queue options
 * @param {number} [options.interval=6000] - Time between requests in ms
 * @param {number} [options.cap=1] - Number of requests allowed per interval
 * @param {boolean} [options.forceCap=false] - If true, use provided cap instead of tier-based cap
 * @returns {Promise<any>} Result of the function execution
 */
export async function enqueue(req, fn, { interval = 6000, cap = 1, forceCap = false } = {}) {
    // Extract useful request info for logging
    const url = req.url || "no-url";
    const method = req.method || "no-method";
    const path = url.split("?")[0] || "no-path";
    let ip =
        req.headers?.get?.("cf-connecting-ip") ||
        req.headers?.["cf-connecting-ip"] ||
        req.ip ||
        "unknown";

    authLog("Processing %s %s from IP: %s", method, path, ip);

    // Check if request is from enter.pollinations.ai - BYPASS IP QUEUEING ENTIRELY
    // Enter requests go directly to the handler without IP-based queue delays
    if (isEnterRequest(req)) {
        authLog("🌸 Enter request - BYPASSING IP QUEUE (direct execution)");
        return fn();
    }

    // Get authentication status
    const authResult = await shouldBypassQueue(req);
    authLog("Auth: %s, tier=%s, userId=%s", authResult.reason, authResult.tier || "none", authResult.userId || "none");

    // Check if there's an error in the auth result (invalid token)
    if (authResult.error) {
        errorLog("Auth error: %s (status: %d)", authResult.error.message, authResult.error.status);
        if (authResult.debugInfo) {
            authLog("Debug: %o", authResult.debugInfo);
        }
        throw createError(authResult.error.message, authResult.error.status, {
            details: authResult.error.details,
            queueContext: { request: { method, path, ip }, issuedAt: new Date().toISOString() }
        });
    }

    // For all other users, always use the queue but adjust the interval and cap based on authentication type
    // This ensures all requests are subject to rate limiting and queue size constraints

    // Only apply tier-based cap if forceCap is not set
	if (!forceCap) {
		cap = getCapForTier(authResult);
	} else {
		log('Using forced cap: %d (override)', cap);
	}

    const maxQueueSize = cap; // Only allow 1 request at a time for anonymous

	// Check if queue exists for this IP and get its current size
	const currentQueueSize = queues.get(ip)?.size || 0;
	const currentPending = queues.get(ip)?.pending || 0;
	const totalInQueue = currentQueueSize + currentPending;

	// Capture queue information for logging
	const queueInfo = {
		ip: ip,
		queueSize: currentQueueSize,
		pending: currentPending,
		total: totalInQueue,
		position: totalInQueue + 1, // This request's position in queue
		enqueuedAt: new Date().toISOString(),
		tier: authResult.tier || "anonymous",
		authenticated: authResult.authenticated || false,
	};

	// Store queue info in request object for later access
	if (req && typeof req === "object") {
		req.queueInfo = queueInfo;
	}

	log("Queue info captured: %O", queueInfo);

	// Check if adding to queue would exceed maxQueueSize
	if (maxQueueSize && totalInQueue >= maxQueueSize) {
		const userContext = authResult.username ? `user: ${authResult.username} (${authResult.userId})` : `IP: ${ip}`;
		const message = `Queue full for ${userContext}: ${totalInQueue} requests already queued (max: ${maxQueueSize}). Get unlimited access at https://enter.pollinations.ai`;
		
		errorLog("🚫 RATE LIMIT: %s - tier: %s", message, authResult.tier);
		
		const error = createError(message, 429, {
			queueInfo: {
				ip, currentSize: currentQueueSize, pending: currentPending,
				total: totalInQueue, maxAllowed: maxQueueSize,
				username: authResult.username || null,
				userId: authResult.userId || null,
				tier: authResult.tier || "anonymous"
			}
		});
		
		// Log detailed rate limit error for debugging (if logger available)
		if (logRateLimitError) {
			try {
				logRateLimitError(error, authResult, req, { interval, cap, forceCap });
			} catch (logError) {
				errorLog("Failed to log rate limit error:", logError.message);
			}
		}
		
		throw error;
	}

	// Queue the function based on IP
	log("Queuing for IP: %s (size: %d, pending: %d)", ip, currentQueueSize, currentPending);

	// Create queue for this IP if it doesn't exist
	if (!queues.has(ip)) {
		const queueOptions = { concurrency: cap };
		if (interval > 0) {
			queueOptions.interval = interval;
			queueOptions.intervalCap = cap;
		}
		log("Creating queue for IP: %s (interval: %dms, cap: %d)", ip, interval, cap);
		queues.set(ip, new PQueue(queueOptions));
	}

	// Add to queue and return
	log("Adding to queue for IP: %s (position #%d)", ip, totalInQueue + 1);
	return queues.get(ip).add(() => {
		log("Executing for IP: %s", ip);
		return fn();
	});
}

/**
 * Clean up old queues to prevent memory leaks
 * Call this periodically (e.g., every hour)
 * @param {number} maxAgeMs - Maximum age of inactive queues in milliseconds
 */
export function cleanupQueues(maxAgeMs = 3600000) {
	const now = Date.now();

	for (const [ip, queue] of queues.entries()) {
		if (queue.lastUsed && now - queue.lastUsed > maxAgeMs) {
			queues.delete(ip);
		}
	}
}
