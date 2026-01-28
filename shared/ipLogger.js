import fs from "node:fs";

// IP logging for security investigation
// Logs requester IPs to console and file for easy grep

const LOG_FILE = process.env.IP_LOG_FILE || "/tmp/pollinations-ip-requests.log";

/**
 * Log an IP address with timestamp and optional context
 * @param {string} ip - The IP address
 * @param {string} service - Service name (text/image)
 * @param {string} [context] - Optional context (endpoint, model, etc.)
 */
export function logIp(ip, service, context = "") {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${service}] IP=${ip} ${context}`.trim();

    // Console log for grep
    console.log(`[IP-LOG] ${logLine}`);

    // File log for persistence
    try {
        fs.appendFileSync(LOG_FILE, logLine + "\n");
    } catch (err) {
        console.error(`[IP-LOG] Failed to write to ${LOG_FILE}:`, err.message);
    }
}

/**
 * Get the log file path
 */
export function getLogFilePath() {
    return LOG_FILE;
}
