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
import { shouldBypassQueue } from "./auth-utils.js";

// Set up debug loggers with namespaces
const log = debug("pollinations:queue");
const errorLog = debug("pollinations:error");
const authLog = debug("pollinations:auth");

// In-memory queue storage
const queues = new Map();

const tierCaps = {
    anonymous: 1,
    seed: 3,
    flower: 7,
    nectar: 100,
};

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

    authLog("Processing request: %s %s from IP: %s", method, path, ip);

    // Get authentication status
    authLog("Checking authentication for request: %s", path);
    const authResult = await shouldBypassQueue(req);

    // Log the authentication result with tier information
    authLog(
        "Authentication result: reason=%s, authenticated=%s, userId=%s, tier=%s",
        authResult.reason,
        authResult.authenticated,
        authResult.userId || "none",
        authResult.tier || "none",
    );

	// Check if there's an error in the auth result (invalid token)
	if (authResult.error) {
		// Detailed logging of authentication errors
		errorLog(
			"Authentication error: %s (status: %d)",
			authResult.error.message,
			authResult.error.status,
		);

		// Log detailed debug info
		if (authResult.debugInfo) {
			authLog(
				"Auth debug info: token source=%s, referrer=%s, authResult=%s",
				authResult.debugInfo.tokenSource || "none",
				authResult.debugInfo.referrer || "none",
				authResult.debugInfo.authResult,
			);
		}

		// Create a proper error object to throw
		const error = new Error(authResult.error.message);
		error.status = authResult.error.status;
		error.details = authResult.error.details;

		// Add extra context for debugging
		error.queueContext = {
			// authContextLength removed as authContext is no longer used
			request: { method, path, ip },
			issuedAt: new Date().toISOString(),
		};

		errorLog(
			"Throwing authentication error with status %d for request: %s %s",
			error.status,
			method,
			path,
		);
		throw error;
	}

	// // // Check if this is a nectar tier user - they skip the queue entirely
	// // // Allow all nectar tier users to bypass the queue regardless of authentication method
	// if (authResult.tier === 'nectar' && authResult.tokenAuth) {
	//   log('Nectar tier user detected - skipping queue entirely');
	//   return fn(); // Execute immediately, skipping the queue
	// }

	// For all other users, always use the queue but adjust the interval and cap based on authentication type
	// This ensures all requests are subject to rate limiting and queue size constraints

	// Only apply tier-based cap if forceCap is not set
	if (!forceCap) {
		cap = tierCaps[authResult.tier] || 1;
		log('Using tier-based cap: %d for tier: %s', cap, authResult.tier);
	} else {
		log('Using forced cap: %d (tier-based cap override)', cap);
	}

	const maxQueueSize = cap * 5;
	// Apply tier-based concurrency limits for token-authenticated requests
	if (authResult.tokenAuth) {
		// // // Token authentication gets zero interval (no delay between requests)
		// if (interval > 0) {
		//   log('Token authenticated request - using zero interval in queue');
		//   interval = 0;
		// }
		authLog(
			"Authenticated via token. using userId instead of ip address for queueing: " +
				authResult.userId,
		);
		ip = authResult.userId;
	}

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
		// Enhanced error message with username context
		const userContext = authResult.username 
			? `user: ${authResult.username} (${authResult.userId})` 
			: `IP: ${ip}`;
		
		const error = new Error(
			`Queue full for ${userContext}: ${totalInQueue} requests already queued (max: ${maxQueueSize})`,
		);
		error.status = 429; // Too Many Requests
		error.queueInfo = {
			ip,
			currentSize: currentQueueSize,
			pending: currentPending,
			total: totalInQueue,
			maxAllowed: maxQueueSize,
			// Include user context in queue info
			username: authResult.username || null,
			userId: authResult.userId || null,
			tier: authResult.tier || "anonymous",
		};
		
		// Enhanced logging with username context
		if (authResult.username) {
			errorLog(
				"🚫 RATE LIMIT: Queue full for user %s (%s) - IP: %s, tier: %s, size=%d, pending=%d, max=%d",
				authResult.username,
				authResult.userId,
				ip,
				authResult.tier,
				currentQueueSize,
				currentPending,
				maxQueueSize,
			);
		} else {
			log(
				"Queue full for IP %s (anonymous): size=%d, pending=%d, max=%d",
				ip,
				currentQueueSize,
				currentPending,
				maxQueueSize,
			);
		}
		
		// if (authResult.userId) {
		//   incrementUserMetric(authResult.userId, 'ip_queue_full_count');
		// }
		throw error;
	}

	// Otherwise, queue the function based on IP
	log(
		"Request queued for IP: %s (queue size: %d, pending: %d)",
		ip,
		currentQueueSize,
		currentPending,
	);

	// Create queue for this IP if it doesn't exist
	if (!queues.has(ip)) {
		log(
			"Creating new queue for IP: %s with interval: %dms, cap: %d",
			ip,
			interval,
			cap,
		);
		// Configure p-queue with proper interval handling
		const queueOptions = { concurrency: cap };
		if (interval > 0) {
			// When interval is specified, use intervalCap to enforce timing
			queueOptions.interval = interval;
			queueOptions.intervalCap = 1; // Allow 1 request per interval
			log("Queue configured with interval: %dms, intervalCap: 1", interval);
		}
		queues.set(ip, new PQueue(queueOptions));
	}

	// Add to queue and return
	log(
		"Adding request to queue for IP: %s (will be #%d in queue)",
		ip,
		totalInQueue + 1,
	);
	return queues.get(ip).add(() => {
		log("Executing queued request for IP: %s", ip);
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
