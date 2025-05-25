import { getRequestData } from '../requestUtils.js';
import { REDIRECT_BASE_URL } from './adLlmMapper.js';
import { REQUIRE_MARKDOWN, markdownRegex } from './adUtils.js';
import { affiliatesData } from '../../affiliate/affiliates.js';

// Create a flattened list of all trigger words from all affiliates
const ALL_TRIGGER_WORDS = affiliatesData.reduce((words, affiliate) => {
    if (affiliate.triggerWords && Array.isArray(affiliate.triggerWords)) {
        return [...words, ...affiliate.triggerWords];
    }
    return words;
}, []);

// Function to check if content contains any trigger words
function contentContainsTriggerWords(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }

    // Convert content to lowercase for case-insensitive matching
    const lowercaseContent = content.toLowerCase();

    // Check if content contains any trigger word (case insensitive)
    return ALL_TRIGGER_WORDS.some(word =>
        lowercaseContent.includes(word.toLowerCase())
    );
}


// Probability of adding referral links (10%)
const REFERRAL_LINK_PROBABILITY = 0.05;

const TEST_ADS_MARKER = "p-ads";

// Parse bad domains from environment variable (comma-separated list)
const BAD_DOMAINS = process.env.BAD_DOMAINS ? process.env.BAD_DOMAINS.split(',').map(domain => domain.trim().toLowerCase()) : [];

import debug from "debug";

const log = debug('pollinations:shouldShowAds');
// Extracted utility functions

export function shouldShowAds(content, messages = [], req = null) {
    // Check for the test marker first - if found, immediately return true
    let markerFound = false;

    // Check for marker in content
    if (content && typeof content === 'string') {
        markerFound = content.includes(TEST_ADS_MARKER);

        // If marker is found, force ad display regardless of other conditions
        if (markerFound) {
            log('Test marker "p-ads" found in content, forcing ad display regardless of other conditions');
            return { shouldShowAd: true, markerFound: true, forceAd: true };
        }
    }

    // Also check for marker in messages (important for streaming case)
    if (!markerFound && messages && messages.length > 0) {
        // Convert all message contents to strings for consistent checking
        const messageContents = messages.map(msg => {
            if (!msg) return '';
            if (typeof msg.content === 'string') return msg.content;
            if (msg.content) return JSON.stringify(msg.content);
            return '';
        });

        // Check if any message contains the marker
        markerFound = messageContents.some(content => content.includes(TEST_ADS_MARKER));

        if (markerFound) {
            log('Test marker "p-ads" found in messages, forcing ad display regardless of other conditions');
            return { shouldShowAd: true, markerFound: true, forceAd: true };
        }
    }

    // Get request data for referrer check
    const requestData = getRequestData(req);

    // Special handling for bad domains in referrer
    if (requestData && requestData.referrer && requestData.referrer !== 'unknown' && BAD_DOMAINS.length > 0) {
        const referrerLower = requestData.referrer.toLowerCase();

        // Check if referrer contains any bad domain
        const isBadDomain = BAD_DOMAINS.some(domain => referrerLower.includes(domain));

        if (isBadDomain) {
            log(`Bad domain detected in referrer: ${requestData.referrer}, forcing 100% ad probability`);
            return { shouldShowAd: true, markerFound: true, isBadDomain: true };
        }
    }

    // Skip ad processing if referrer is from roblox or image.pollinations.ai
    if (requestData && requestData.referrer && requestData.referrer !== 'unknown' && (requestData.referrer?.includes('v1_rblx_access') || requestData.referrer?.includes('image.pollinations.ai'))) {
        // log('Skipping ad processing due to referrer presence:', requestData.referrer);
        return { shouldShowAd: false, markerFound: false };
    }

    // Check if an ad already exists in the conversation history
    if (messages && messages.length > 0) {
        // Look for the redirect URL pattern in any of the messages
        const hasExistingAd = messages.some(msg => {
            if (!msg.content || typeof msg.content !== 'string') return false;
            return msg.content.includes(REDIRECT_BASE_URL);
        });

        if (hasExistingAd) {
            log('Ad already exists in conversation history, skipping additional ad');
            return { shouldShowAd: false, markerFound: false, adAlreadyExists: true };
        }
    }

    // // Skip ad generation if content is too short
    // if (!content || typeof content !== 'string' || content.length < 100) {
    //     return { shouldShowAd: false, markerFound: false };
    // }
    if (!content) {
        log('No content found, using messages instead');
        content = messages?.map(msg => msg.content).join('\n');
    }

    // Skip if content does not have markdown-like formatting, unless we're testing
    // This helps distinguish actual text responses from other formats like code
    if (REQUIRE_MARKDOWN && !markdownRegex.test(content) && !content.includes(TEST_ADS_MARKER)) {
        log('Skipping ad processing due to lack of markdown formatting');
        return { shouldShowAd: false, markerFound: false };
    }

    // Check for trigger words in content or messages
    let triggerWordsFound = false;
    if (content) {
        triggerWordsFound = contentContainsTriggerWords(content);
    }
    if (!triggerWordsFound && messages && messages.length > 0) {
        triggerWordsFound = messages.some(msg => msg.content && contentContainsTriggerWords(msg.content)
        );
    }

    // If marker is not found, use the default probability
    const effectiveProbability = markerFound
        ? 1.0 // 100% probability for marker found
        : triggerWordsFound
            ? REFERRAL_LINK_PROBABILITY * 2 // Triple probability for trigger words
            : REFERRAL_LINK_PROBABILITY;

    if (markerFound) {
        log('Test marker "p-ads" found, using 100% probability');
    } else if (triggerWordsFound) {
        log(`Trigger words found in content, using triple probability (${(REFERRAL_LINK_PROBABILITY * 3).toFixed(2)})`);
    }

    // Random check - only process based on the effective probability
    const shouldShowAd = Math.random() <= effectiveProbability;

    return { shouldShowAd, markerFound };
}
