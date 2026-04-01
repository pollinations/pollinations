// IP logging for security investigation
// Logs requester IPs to console for easy grep

/**
 * Log an IP address with timestamp and optional context
 * @param {string} ip - The IP address
 * @param {string} service - Service name (text/image)
 * @param {string} [context] - Optional context (endpoint, model, etc.)
 */
export function logIp(ip, service, context = "") {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${service}] IP=${ip} ${context}`.trim();
    console.log(`[IP-LOG] ${logLine}`);
}
