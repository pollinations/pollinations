/**
 * Log an IP address with timestamp and optional context
 * @param {string} ip - The IP address
 * @param {string} service - Service name (text/image)
 * @param {string} [context] - Optional context (endpoint, model, etc.)
 */
export function logIp(ip, service, context = "") {
    const timestamp = new Date().toISOString();
    console.log(
        `[IP-LOG] [${timestamp}] [${service}] IP=${ip} ${context}`.trim(),
    );
}

/**
 * Get the log file path
 */
export function getLogFilePath() {
    return null;
}
