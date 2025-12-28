/**
 * Simple Conversation Logger
 *
 * Logs conversations to JSONL format for analysis and classification.
 * - Samples conversations at configurable rate (currently 100%)
 * - Excludes specific users for privacy
 * - Truncates messages to manageable size
 * - Stores in user_logs/conversations.jsonl
 *
 * Used by: server.js for general conversation logging
 */
import fs from "fs";
import path from "path";

// Configuration constants
const SAMPLE_RATE = 1.0; // 100% of conversations (changed from 20%)
const MAX_MESSAGES = 3; // Last 3 messages per conversation
const MAX_MESSAGE_CHARS = 280; // Twitter length for efficient storage

// Users to exclude from logging
const EXCLUDED_USERS = ["p0llinati0ns", "sketork", "YoussefElsafi", "wBrowsqq"];

const LOG_DIR = path.join(process.cwd(), "user_logs");
const LOG_FILE = path.join(LOG_DIR, "conversations.jsonl");

/**
 * Check if message should be filtered out (not useful for intent classification)
 */
function shouldFilterMessage(message) {
    if (!message.content) return true;

    // Filter out image URLs and base64 data
    if (Array.isArray(message.content)) {
        return message.content.some((item) => item.type === "image_url");
    }

    if (typeof message.content === "string") {
        // Filter out image data and very short messages
        return (
            message.content.includes("data:image/") ||
            message.content.includes("/9j/4AAQ") ||
            message.content.trim().length < 3
        );
    }

    return false;
}

/**
 * Clean and truncate message content to specified character limit
 * Preserves the end of the message (most recent content) for better intent detection
 */
function truncateMessage(message, maxChars = MAX_MESSAGE_CHARS) {
    if (!message.content) {
        return null; // Skip empty messages
    }

    // Handle array content (like OpenAI image format)
    let textContent = "";
    if (Array.isArray(message.content)) {
        // Extract only text content, skip images
        textContent = message.content
            .filter((item) => item.type === "text")
            .map((item) => item.text || "")
            .join(" ");
    } else {
        textContent = message.content;
    }

    if (!textContent || textContent.trim().length === 0) {
        return null; // Skip if no meaningful text content
    }

    const originalLength = textContent.length;

    if (originalLength <= maxChars) {
        return {
            ...message,
            content: textContent,
            original_length: originalLength,
        };
    }

    // Take the last N characters to preserve the most recent/relevant content
    const truncatedContent = "..." + textContent.slice(-(maxChars - 3));

    return {
        ...message,
        content: truncatedContent,
        original_length: originalLength,
    };
}

/**
 * Dead simple conversation logger with message truncation
 * Current config: ${(SAMPLE_RATE * 100).toFixed(1)}% sample rate, max ${MAX_MESSAGES} messages, ${MAX_MESSAGE_CHARS} chars/message
 */
export function logConversation(
    messages,
    model,
    username = null,
    maxMessages = MAX_MESSAGES,
) {
    // Filter out excluded users
    if (username && EXCLUDED_USERS.includes(username)) {
        return;
    }

    // Sample based on configured rate
    if (Math.random() > SAMPLE_RATE) return;

    // Filter and process messages
    const recentMessages = messages
        .slice(-maxMessages)
        .filter((msg) => !shouldFilterMessage(msg)) // Remove unwanted content
        .map((msg) => truncateMessage(msg))
        .filter((msg) => msg !== null); // Remove null results

    // Skip logging if no meaningful messages remain
    if (recentMessages.length === 0) {
        return;
    }

    const entry = {
        timestamp: new Date().toISOString(),
        model,
        username,
        messages: recentMessages,
        total_messages: messages.length, // Track original conversation length
        filtered_messages: recentMessages.length, // Track how many messages after filtering
        max_chars_per_message: MAX_MESSAGE_CHARS, // Track truncation setting
    };

    // Ensure user_logs directory exists
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}
