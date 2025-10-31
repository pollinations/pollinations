/**
 * Rate Limit Error Logger
 *
 * Logs detailed rate limit errors to help debug text API stability issues.
 * - Logs 429 errors with comprehensive queue state information
 * - Tracks user patterns and timing data
 * - Stores in logs/rate-limit-errors.jsonl for analysis
 *
 * Used by: shared/ipQueue.js when 429 errors occur
 */
import fs from "fs";
import path from "path";
import debug from "debug";

const log = debug("pollinations:ratelimit");
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "rate-limit-errors.jsonl");

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

/**
 * Extract request information safely
 */
function extractRequestInfo(req) {
    try {
        return {
            method: req.method || "unknown",
            url: req.url || "unknown",
            path: req.url?.split("?")[0] || "unknown",
            user_agent:
                req.headers?.["user-agent"] ||
                req.headers?.get?.("user-agent") ||
                "unknown",
            referrer:
                req.headers?.["referer"] ||
                req.headers?.get?.("referer") ||
                "unknown",
            content_type:
                req.headers?.["content-type"] ||
                req.headers?.get?.("content-type") ||
                "unknown",
        };
    } catch (error) {
        return {
            method: "unknown",
            url: "unknown",
            path: "unknown",
            user_agent: "unknown",
            referrer: "unknown",
            content_type: "unknown",
        };
    }
}

/**
 * Extract model information from request
 */
function extractModelInfo(req) {
    try {
        // Try to get model from body if it's a POST request
        if (req.body && req.body.model) {
            return req.body.model;
        }

        // Try to get from query parameters
        if (req.query && req.query.model) {
            return req.query.model;
        }

        // Try to get from URL path
        const url = req.url || "";
        const modelMatch = url.match(/[?&]model=([^&]+)/);
        if (modelMatch) {
            return decodeURIComponent(modelMatch[1]);
        }

        return "unknown";
    } catch (error) {
        return "unknown";
    }
}

/**
 * Log rate limit error with comprehensive debugging information
 *
 * @param {Object} error - The 429 error object with queueInfo
 * @param {Object} authResult - Authentication result from shouldBypassQueue
 * @param {Object} req - The original request object
 * @param {Object} options - Additional context (interval, cap, etc.)
 */
export function logRateLimitError(error, authResult, req, options = {}) {
    try {
        ensureLogDir();

        const timestamp = new Date().toISOString();
        const requestInfo = extractRequestInfo(req);
        const model = extractModelInfo(req);

        // Extract IP safely
        const ip =
            req.headers?.get?.("cf-connecting-ip") ||
            req.headers?.["cf-connecting-ip"] ||
            req.ip ||
            "unknown";

        const logEntry = {
            timestamp,
            error_type: "QUEUE_FULL",
            service: "text-api",

            // User information
            user: {
                username: authResult.username || null,
                userId: authResult.userId || null,
                tier: authResult.tier || "anonymous",
                ip: ip,
                authenticated: authResult.authenticated || false,
                bypass_reason: authResult.reason || null,
            },

            // Queue state from error.queueInfo
            queue_state: {
                current_size: error.queueInfo?.currentSize || 0,
                max_allowed: error.queueInfo?.maxAllowed || 0,
                pending_requests: error.queueInfo?.pending || 0,
                total_in_queue: error.queueInfo?.total || 0,
                tier_cap: options.cap || null,
                interval_ms: options.interval || null,
                force_cap: options.forceCap || false,
            },

            // Request information
            request_info: {
                model: model,
                method: requestInfo.method,
                path: requestInfo.path,
                user_agent: requestInfo.user_agent,
                referrer: requestInfo.referrer,
                content_type: requestInfo.content_type,
            },

            // Error details
            error_details: {
                message: error.message,
                status: error.status || 429,
            },

            // Additional context
            context: {
                queue_utilization_percent: error.queueInfo?.maxAllowed
                    ? Math.round(
                          (error.queueInfo.total / error.queueInfo.maxAllowed) *
                              100,
                      )
                    : 0,
                is_token_authenticated: authResult.tokenAuth || false,
                auth_method: authResult.reason || "none",
            },
        };

        // Write to JSONL file (one JSON object per line)
        const logLine = JSON.stringify(logEntry) + "\n";
        fs.appendFileSync(LOG_FILE, logLine);

        log(
            `Rate limit error logged for ${authResult.username || ip}: ${error.queueInfo?.total}/${error.queueInfo?.maxAllowed} queue usage`,
        );
    } catch (logError) {
        // Don't let logging errors break the main flow
        console.error("Failed to log rate limit error:", logError);
    }
}

/**
 * Get rate limit statistics from log file (for debugging)
 * Returns recent rate limit patterns
 */
export function getRateLimitStats(hours = 1) {
    try {
        if (!fs.existsSync(LOG_FILE)) {
            return { error: "No rate limit log file found" };
        }

        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        const logContent = fs.readFileSync(LOG_FILE, "utf8");
        const lines = logContent
            .trim()
            .split("\n")
            .filter((line) => line);

        const recentErrors = lines
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((entry) => entry && new Date(entry.timestamp) > cutoffTime);

        // Basic statistics
        const stats = {
            total_errors: recentErrors.length,
            time_period_hours: hours,
            by_tier: {},
            by_model: {},
            by_user: {},
            avg_queue_utilization: 0,
        };

        let totalUtilization = 0;

        recentErrors.forEach((entry) => {
            const tier = entry.user.tier;
            const model = entry.request_info.model;
            const username = entry.user.username || "anonymous";

            stats.by_tier[tier] = (stats.by_tier[tier] || 0) + 1;
            stats.by_model[model] = (stats.by_model[model] || 0) + 1;
            stats.by_user[username] = (stats.by_user[username] || 0) + 1;

            totalUtilization += entry.context.queue_utilization_percent || 0;
        });

        if (recentErrors.length > 0) {
            stats.avg_queue_utilization = Math.round(
                totalUtilization / recentErrors.length,
            );
        }

        return stats;
    } catch (error) {
        return { error: `Failed to read rate limit stats: ${error.message}` };
    }
}
