import { sendToAnalytics } from '../sendToAnalytics.js';
import debug from 'debug';

const log = debug('pollinations:adfilter');

// Regular expression to detect markdown formatting in content
export const markdownRegex = /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:\#.*)|(?:\*.*\*)|(?:\`.*\`)|(?:\>.*)|(?:\-\s.*)|(?:\d\.\s.*)/;


// Whether to require markdown for ad processing
export const REQUIRE_MARKDOWN = true;

/**
 * Send analytics about skipped ads
 * @param {object} req - Express request object for analytics
 * @param {string} reason - Reason why the ad was skipped
 * @param {boolean} isStreaming - Whether this is a streaming request
 * @param {object} additionalData - Any additional data to include
 */

export function sendAdSkippedAnalytics(req, reason, isStreaming = false, additionalData = {}) {
    if (!req) return;

    log(`Ad skipped: ${reason}, streaming: ${isStreaming}`);

    sendToAnalytics(req, 'ad_skipped', {
        reason,
        streaming: isStreaming,
        ...additionalData
    });
}
export function shouldProceedWithAd(content, markerFound) {
    // If no content, skip ad processing
    if (!content) {
        return false;
    }

    // Skip if content is too short (less than 50 characters)
    if (content.length < 50) {
        return false;
    }

    // If markdown is required and not found, skip (unless marker is present)
    if (REQUIRE_MARKDOWN && !markerFound && !markdownRegex.test(content)) {
        return false;
    }

    return true;
}
