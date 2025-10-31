import { promises as fs } from "fs";
import path from "path";
import debug from "debug";

const log = debug("pollinations:string-monitor");

/**
 * Simple utility to monitor for specific strings in user input and log usernames
 * Configured via environment variables for flexibility
 */

// Get monitored strings from environment variable
// Format: "string1,string2,string3" or single string
function getMonitoredStrings() {
    const envStrings = process.env.MONITORED_STRINGS;
    if (!envStrings || envStrings.trim() === "") {
        return [];
    }

    return envStrings
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

// Log file path - save to user_logs folder
const MONITORED_STRINGS_LOG = path.join(
    process.cwd(),
    "user_logs",
    "monitored_strings.log",
);

/**
 * Check if input contains any monitored strings and log username if found
 * @param {string} input - The input text to search
 * @param {string} username - Username to log if string is found
 * @param {string} context - Additional context (e.g., "prompt", "message")
 */
export async function checkAndLogMonitoredStrings(
    input,
    username,
    context = "input",
) {
    const monitoredStrings = getMonitoredStrings();

    // Early return if no strings to monitor
    if (monitoredStrings.length === 0) {
        return;
    }

    // Early return if no input or username
    if (!input || !username) {
        return;
    }

    // Convert input to lowercase for case-insensitive matching
    const inputLower = input.toLowerCase();

    // Check each monitored string
    for (const searchString of monitoredStrings) {
        const searchLower = searchString.toLowerCase();

        if (inputLower.includes(searchLower)) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                username: username,
                foundString: searchString,
                context: context,
                inputLength: input.length,
                // Don't log the full input for privacy, just a snippet around the match
                snippet: getSnippetAroundMatch(input, searchString),
            };

            log(
                `🔍 Monitored string "${searchString}" found for user: ${username}`,
            );

            try {
                await fs.appendFile(
                    MONITORED_STRINGS_LOG,
                    JSON.stringify(logEntry) + "\n",
                    "utf8",
                );
            } catch (error) {
                log(`Error writing to monitored strings log: ${error.message}`);
            }

            // Only log once per input, even if multiple strings match
            break;
        }
    }
}

/**
 * Get a snippet of text around the matched string for context
 * @param {string} input - Full input text
 * @param {string} matchedString - The string that was matched
 * @returns {string} - Snippet with context
 */
function getSnippetAroundMatch(input, matchedString) {
    const matchIndex = input.toLowerCase().indexOf(matchedString.toLowerCase());
    if (matchIndex === -1) return "";

    const snippetLength = 100; // Characters before and after
    const start = Math.max(0, matchIndex - snippetLength);
    const end = Math.min(
        input.length,
        matchIndex + matchedString.length + snippetLength,
    );

    let snippet = input.substring(start, end);

    // Add ellipsis if we truncated
    if (start > 0) snippet = "..." + snippet;
    if (end < input.length) snippet = snippet + "...";

    return snippet;
}

/**
 * Helper to extract all text content from messages array
 * @param {Array} messages - Array of message objects
 * @returns {string} - Combined text content
 */
export function extractTextFromMessages(messages) {
    if (!Array.isArray(messages)) {
        return "";
    }

    return messages
        .map((msg) => {
            if (typeof msg.content === "string") {
                return msg.content;
            } else if (Array.isArray(msg.content)) {
                // Handle content arrays (multimodal messages)
                return msg.content
                    .filter((item) => item.type === "text")
                    .map((item) => item.text || "")
                    .join(" ");
            }
            return "";
        })
        .join(" ");
}
