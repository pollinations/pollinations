import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { getRequestData } from '../requestUtils.js';
import { findRelevantAffiliate, generateAffiliateAd, extractReferralLinkInfo } from './adLlmMapper.js';
import { Transform } from 'stream';
import { logAdInteraction } from './adLogger.js';
import { affiliatesData } from '../../affiliate/affiliates.js';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');

// Regular expression to detect markdown formatting in content
const markdownRegex = /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:\#.*)|(?:\*.*\*)|(?:\`.*\`)|(?:\>.*)|(?:\-\s.*)|(?:\d\.\s.*)/;

// Probability of adding referral links (10%)
const REFERRAL_LINK_PROBABILITY = 0.1;

// Flag for testing ads with a specific marker
const TEST_ADS_MARKER = "p-ads";

// Whether to require markdown for ad processing
const REQUIRE_MARKDOWN = true;

// Parse bad domains from environment variable (comma-separated list)
const BAD_DOMAINS = process.env.BAD_DOMAINS ? process.env.BAD_DOMAINS.split(',').map(domain => domain.trim().toLowerCase()) : [];

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

// Extracted utility functions
function shouldShowAds(content, messages = [], req = null) {
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

    // Skip ad processing if any referrer is present (that's not a bad domain)
    if (requestData && requestData.referrer && requestData.referrer !== 'unknown') {
        // log('Skipping ad processing due to referrer presence:', requestData.referrer);
        return { shouldShowAd: false, markerFound: false };
    }
    
    // Skip ad generation if content is too short
    if (!content || typeof content !== 'string' || content.length < 100) {
        return { shouldShowAd: false, markerFound: false };
    }
    
    // Skip if content does not have markdown-like formatting, unless we're testing
    // This helps distinguish actual text responses from other formats like code
    if (REQUIRE_MARKDOWN && !markdownRegex.test(content) && !content.includes(TEST_ADS_MARKER)) {
        log('Skipping ad processing due to lack of markdown formatting');
        return { shouldShowAd: false, markerFound: false };
    }
    
    // Check for the test marker
    let markerFound = false;
    if (content) {
        markerFound = content.includes(TEST_ADS_MARKER);
    }
    
    // Check for trigger words in content or messages
    let triggerWordsFound = false;
    if (content) {
        triggerWordsFound = contentContainsTriggerWords(content);
    }
    if (!triggerWordsFound && messages && messages.length > 0) {
        triggerWordsFound = messages.some(msg => 
            msg.content && contentContainsTriggerWords(msg.content)
        );
    }
    
    // If marker is not found, use the default probability
    const effectiveProbability = markerFound 
        ? 1.0 // 100% probability for marker found
        : triggerWordsFound 
            ? REFERRAL_LINK_PROBABILITY * 3 // Triple probability for trigger words
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

function shouldProceedWithAd(content, markerFound) {
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

async function generateAdForContent(content, req, messages, markerFound = false, isStreaming = false) {
    // Skip if we've already processed this request ID
    if (req && req.pollinationsAdProcessed) {
        log('Request already processed for ads, skipping duplicate processing');
        return null;
    }
    
    // Mark request as processed
    if (req) {
        req.pollinationsAdProcessed = true;
    }
    
    // Check if we should show ads for this content
    const { shouldShowAd, markerFound: detectedMarker, isBadDomain } = shouldShowAds(content, messages, req);
    
    // Handle bad domain referrers - always show ads (100% probability)
    if (isBadDomain) {
        markerFound = true; // Force marker to true to ensure 100% probability
    }
    
    if (!shouldShowAd && !shouldProceedWithAd(content, markerFound || detectedMarker)) {
        if (req) {
            const reason = !content ? 'empty_content' : 
                           content.length < 100 ? 'content_too_short' : 
                           'probability_check_failed';
            
            sendAdSkippedAnalytics(req, reason, isStreaming);
        }
        return null;
    }
    
    try {
        log('Generating ad for content...');
        
        // Find the relevant affiliate
        const affiliateData = await findRelevantAffiliate(content, messages);
        
        // If no affiliate data is found, send analytics and return null
        if (!affiliateData && req) {
            sendAdSkippedAnalytics(req, 'no_relevant_affiliate', isStreaming);
            return null;
        }
        
        // If affiliate data is found, generate the ad string
        if (affiliateData) {
            // Pass content and messages to enable language matching
            const adString = await generateAffiliateAd(affiliateData.id, content, messages);
            
            // If ad generation failed, send analytics
            if (!adString && req) {
                sendAdSkippedAnalytics(req, 'ad_generation_failed', isStreaming, {
                    affiliate_id: affiliateData.id,
                    affiliate_name: affiliateData.name
                });
                return null;
            }
            
            // If an ad string was successfully generated
            if (adString) {
                // Extract info for analytics
                const linkInfo = extractReferralLinkInfo(adString);
                
                // Log the ad interaction with metadata
                logAdInteraction({
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                    affiliate_id: affiliateData.id,
                    affiliate_name: affiliateData.name,
                    topic: linkInfo.topic || 'unknown',
                    streaming: isStreaming,
                    referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
                
                // Send analytics for the ad impression
                sendToAnalytics(req, 'ad_impression', {
                    affiliate_id: affiliateData.id,
                    affiliate_name: affiliateData.name,
                    topic: linkInfo.topic || 'unknown',
                    streaming: isStreaming
                });
                
                return adString;
            }
        }
        
        return null;
    } catch (error) {
        errorLog(`Error generating ad: ${error.message}`);
        if (req) {
            sendAdSkippedAnalytics(req, 'error', isStreaming, {
                error_message: error.message
            });
        }
        return null;
    }
}

function formatAdAsSSE(adString) {
    try {
        // Create a proper SSE message with the ad content
        // This should be in the format expected by the client
        
        // Create a delta object similar to what the API would return
        const deltaObject = {
            id: `ad_${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'ad-system',
            choices: [
                {
                    index: 0,
                    delta: {
                        content: `\n\n${adString}`
                    },
                    finish_reason: null
                }
            ]
        };
        
        // Format as SSE
        return `data: ${JSON.stringify(deltaObject)}\n\n`;
    } catch (error) {
        errorLog(`Error formatting ad as SSE: ${error.message}`);
        return '';
    }
}

/**
 * Process content and add referral links if markdown is detected
 * @param {string} content - The output content to process
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages (optional)
 * @returns {Promise<string>} - The processed content with referral links
 */
export async function processRequestForAds(content, req, messages = []) {
    const { shouldShowAd, markerFound } = shouldShowAds(content, messages, req);
    
    if (!shouldShowAd) {
        // We've already sent the ad_skipped analytics in shouldShowAds
        return content;
    }
    
    // Generate ad string based on content
    const adString = await generateAdForContent(content, req, messages, markerFound);
    
    if (adString) {
        return content + adString;
    }
    
    // We've already sent the ad_skipped analytics in generateAdForContent
    return content;
}

/**
 * Creates a streaming wrapper that adds an ad at the end of the stream
 * This maintains the thin proxy approach for most of the stream
 * @param {Stream} responseStream - The original response stream from the API
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages
 * @returns {Stream} - A transformed stream that will add an ad at the end
 */
export function createStreamingAdWrapper(responseStream, req, messages = []) {
    if (!responseStream || !responseStream.pipe) {
        log('Invalid stream provided to createStreamingAdWrapper');
        if (req) {
            sendAdSkippedAnalytics(req, 'invalid_stream', true);
        }
        return responseStream;
    }
    
    const { shouldShowAd, markerFound } = shouldShowAds(null, messages, req);
    
    if (!shouldShowAd) {
        // We've already sent the ad_skipped analytics in shouldShowAds
        return responseStream;
    }
    
    log('Creating streaming ad wrapper');
    
    // Collect the content to analyze for affiliate matching
    let collectedContent = '';
    let isDone = false;
    
    // Create a transform stream that will:
    // 1. Pass through all chunks unchanged
    // 2. Collect content for analysis
    // 3. Add an ad after the [DONE] message
    const streamTransformer = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
            // Convert chunk to string
            const chunkStr = chunk.toString();
            
            // Check if this is the [DONE] message
            if (chunkStr.includes('data: [DONE]')) {
                isDone = true;
                
                // Process the collected content and add an ad
                generateAdForContent(collectedContent, req, messages, markerFound, true)
                    .then(adString => {
                        if (adString) {
                            // Format the ad as a proper SSE message
                            const adChunk = formatAdAsSSE(adString);
                            
                            // Push the ad chunk before the [DONE] message
                            this.push(adChunk);
                        } else {
                            // We've already sent the ad_skipped analytics in generateAdForContent
                        }
                        
                        // Push the [DONE] message
                        this.push(chunk);
                        callback();
                    })
                    .catch(error => {
                        errorLog('Error processing streaming ad:', error);
                        if (req) {
                            sendAdSkippedAnalytics(req, 'error', true, {
                                error_message: error.message
                            });
                        }
                        // Just push the original chunk if there's an error
                        this.push(chunk);
                        callback();
                    });
            } else {
                // For normal chunks, extract the content and pass through unchanged
                if (!isDone) {
                    try {
                        // Try to extract content from the SSE data
                        const contentMatch = chunkStr.match(/data: (.*)\n\n/);
                        if (contentMatch && contentMatch[1]) {
                            try {
                                const data = JSON.parse(contentMatch[1]);
                                if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                                    collectedContent += data.choices[0].delta.content;
                                }
                            } catch (e) {
                                // Ignore JSON parse errors, might not be JSON
                            }
                        }
                    } catch (e) {
                        // Ignore errors in content extraction
                    }
                }
                
                // Pass through the chunk unchanged
                this.push(chunk);
                callback();
            }
        }
    });
    
    // Pipe the original stream through our transformer
    return responseStream.pipe(streamTransformer);
}
