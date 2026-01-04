import fs from "node:fs";
import path from "node:path";
import debug from "debug";

const log = debug("pollinations:adlogger");
const errorLog = debug("pollinations:adlogger:error");

// Base directory for logs
const LOG_DIR = path.join(process.cwd(), "logs");
const AD_LOG_FILE = path.join(LOG_DIR, "ad_interactions.md");

/**
 * Ensures the log directory exists
 */
function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        try {
            fs.mkdirSync(LOG_DIR, { recursive: true });
            log(`Created log directory at ${LOG_DIR}`);
        } catch (error) {
            errorLog(`Failed to create log directory: ${error.message}`);
        }
    }
}

/**
 * Logs an ad interaction to the markdown file
 *
 * @param {Object} data - The data to log
 * @param {Array} data.messages - The input messages
 * @param {string} data.content - The original content
 * @param {string} data.adString - The advertisement string that was added (if any)
 * @param {Object} data.affiliateData - Information about the affiliate (if any)
 * @param {Object} data.req - The request object (optional)
 * @param {string} data.reason - Reason for logging (success, no_show, error) (optional)
 * @param {boolean} data.isStreaming - Whether this is a streaming request (optional)
 * @param {string} data.requestId - A unique identifier for the request (optional)
 * @param {string} data.timestamp - When the interaction occurred (optional)
 */
export async function logAdInteraction(data) {
    ensureLogDir();

    const {
        messages,
        content,
        adString,
        affiliateData,
        req,
        reason = "success",
        isStreaming = false,
        requestId: explicitRequestId,
        timestamp = new Date().toISOString(),
    } = data;

    // Generate requestId if not explicitly provided
    const requestId =
        explicitRequestId ||
        (req?.id
            ? req.id
            : `req-${Date.now()}${isStreaming ? "-stream" : ""}${reason === "error" ? "-error" : ""}`);

    try {
        // Format the log entry as markdown
        let logEntry = `\n\n## Ad Interaction - ${timestamp}\n\n`;

        // Add request ID if available
        if (requestId) {
            logEntry += `**Request ID:** ${requestId}\n\n`;
        }

        // Add reason for logging
        logEntry += `**Reason:** ${reason}\n\n`;

        // Add streaming status
        logEntry += `**Streaming:** ${isStreaming ? "Yes" : "No"}\n\n`;

        // Add messages (limited to last 3 for brevity)
        const lastMessages = messages?.slice(-3) || [];
        if (lastMessages.length > 0) {
            logEntry += `### Input Messages\n\n`;
            lastMessages.forEach((msg, _index) => {
                logEntry += `**${msg.role || "user"}:** ${msg.content || ""}\n\n`;
            });
        }

        // Add original content (truncated if too long)
        if (content) {
            const truncatedContent =
                content.length > 500
                    ? `${content.substring(0, 500)}... [truncated]`
                    : content;

            logEntry += `### Original Content\n\n\`\`\`\n${truncatedContent}\n\`\`\`\n\n`;
        }

        // Add affiliate information if available
        if (affiliateData) {
            logEntry += `### Affiliate Information\n\n`;
            logEntry += `- **Name:** ${affiliateData.name}\n`;
            logEntry += `- **ID:** ${affiliateData.id}\n`;
            if (affiliateData.product)
                logEntry += `- **Product:** ${affiliateData.product}\n`;
            if (affiliateData.description)
                logEntry += `- **Description:** ${affiliateData.description}\n`;
            logEntry += "\n";
        }

        // Add the advertisement if available
        if (adString) {
            logEntry += `### Added Advertisement\n\n\`\`\`\n${adString}\n\`\`\`\n\n`;
        } else {
            logEntry += `### No Advertisement Added\n\n`;
        }

        logEntry += `---\n`;

        // Append to the log file
        fs.appendFileSync(AD_LOG_FILE, logEntry);
        log(`Logged ad interaction to ${AD_LOG_FILE}`);
    } catch (error) {
        errorLog(`Failed to log ad interaction: ${error.message}`);
    }
}
