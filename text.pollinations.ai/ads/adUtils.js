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

export function shouldProceedWithAd(show, req, content, messages, isStreaming) {
    // If not showing ads based on probability/markers
    if (!show) {
        const reason = !content ? 'empty_content' :
                      content.length < 100 ? 'content_too_short' :
                      'probability_check_failed';
        
        sendAdSkippedAnalytics(req, reason, isStreaming);
        return false;
    }

    // Check content validity
    if (!content || content.length < 50) {
        sendAdSkippedAnalytics(req, 'content_too_short', isStreaming);
        return false;
    }

    // Check if ad already exists
    if (content.includes('🌸 **Ad** 🌸')) {
        sendAdSkippedAnalytics(req, 'ad_already_exists', isStreaming);
        return false;
    }

    return true;
}
