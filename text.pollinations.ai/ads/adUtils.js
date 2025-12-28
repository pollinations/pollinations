import { sendToAnalytics } from "../sendToAnalytics.js";
import debug from "debug";

const log = debug("pollinations:adfilter");

// Regular expression to detect markdown formatting in content
export const markdownRegex =
    /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:#.*)|(?:\*.*\*)|(?:`.*`)|(?:>.*)|(?:-\s.*)|(?:\d\.\s.*)/;

// Whether to require markdown for ad processing
export const REQUIRE_MARKDOWN = true;

/**
 * Send analytics about skipped ads
 * @param {object} req - Express request object for analytics
 * @param {string} reason - Reason why the ad was skipped
 * @param {boolean} isStreaming - Whether this is a streaming request
 * @param {object} additionalData - Any additional data to include
 */

export function sendAdSkippedAnalytics(
    req,
    reason,
    isStreaming = false,
    additionalData = {},
) {
    if (!req) return;

    log(`Ad skipped: ${reason}, streaming: ${isStreaming}`);

    sendToAnalytics(req, "ad_skipped", {
        reason,
        streaming: isStreaming,
        ...additionalData,
    });
}

// Ad URL patterns to detect in conversation history
const AD_URL_PATTERNS = ["nex-ad.com", "pollinations.ai/redirect"];

/**
 * Check if a conversation already contains an ad
 * @param {Array} messages - Conversation messages
 * @returns {boolean} - Whether an ad was found
 */
function conversationContainsAd(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return false;
    }

    // Check each message for ad URLs
    for (const message of messages) {
        if (!message.content || typeof message.content !== "string") continue;

        // Check for ad URL patterns in the message content
        for (const pattern of AD_URL_PATTERNS) {
            if (message.content.includes(pattern)) {
                log(
                    `Found ad URL pattern '${pattern}' in conversation history`,
                );
                return true;
            }
        }
    }

    return false;
}

export function shouldProceedWithAd(show, req, content, messages, isStreaming) {
    // If not showing ads based on probability/markers
    if (!show) {
        const reason = !content
            ? "empty_content"
            : content.length < 100
              ? "content_too_short"
              : "probability_check_failed";

        sendAdSkippedAnalytics(req, reason, isStreaming);
        return false;
    }

    // Check content validity
    if (!content || content.length < 50) {
        sendAdSkippedAnalytics(req, "content_too_short", isStreaming);
        return false;
    }

    // Check if ad already exists in current content
    if (content.includes("🌸 **Ad** 🌸")) {
        sendAdSkippedAnalytics(
            req,
            "ad_already_exists_in_content",
            isStreaming,
        );
        return false;
    }

    // Check if conversation history already contains an ad
    if (conversationContainsAd(messages)) {
        sendAdSkippedAnalytics(req, "ad_exists_in_conversation", isStreaming, {
            conversation_length: messages?.length || 0,
        });
        return false;
    }

    return true;
}
