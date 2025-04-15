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

// Regular expression to detect markdown content
const markdownRegex = /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:\#.*)|(?:\*.*\*)|(?:\`.*\`)|(?:\>.*)|(?:\-\s.*)|(?:\d\.\s.*)/;

// Probability of adding referral links (0%)
const REFERRAL_LINK_PROBABILITY = 0.1;

// Flag for testing ads with a specific marker
const TEST_ADS_MARKER = "p-ads";

// Whether to require markdown for ad processing
const REQUIRE_MARKDOWN = false;

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

// Extracted utility functions
function shouldShowAds(content, messages = [], req = null) {
    // Get request data for referrer check
    const requestData = req ? getRequestData(req) : null;
    
    // Check if messages contain the test marker "p-ads"
    let markerFound = false;
    
    // Check in the messages array
    if (messages && messages.length > 0) {
        markerFound = messages.some(msg => msg.content && msg.content.includes(TEST_ADS_MARKER));
    }
    
    // For GET requests, also check the URL path which might contain the marker
    if (!markerFound && req && req.path) {
        markerFound = req.path.includes(TEST_ADS_MARKER);
    }
    
    // If content is provided, also check it
    if (!markerFound && content) {
        markerFound = content.includes(TEST_ADS_MARKER);
    }
    
    // If marker is found, skip all other checks and show ads
    if (markerFound) {
        log('Test marker "p-ads" found, using 100% probability and overriding referrer filter');
        return { shouldShowAd: true, markerFound: true };
    }
    
    // Skip ad processing if any referrer is present (only if marker not found)
    if (requestData && requestData.referrer && requestData.referrer !== 'unknown') {
        // log('Skipping ad processing due to referrer presence:', requestData.referrer);
        if (req) {
            sendAdSkippedAnalytics(req, 'referrer_present', false, {
                referrer: requestData.referrer
            });
        }
        return { shouldShowAd: false, markerFound: false };
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
    
    // Calculate probability based on trigger words
    const effectiveProbability = triggerWordsFound 
        ? REFERRAL_LINK_PROBABILITY * 3 // Triple probability for trigger words
        : REFERRAL_LINK_PROBABILITY;
    
    if (triggerWordsFound) {
        log(`Trigger words found in content, using triple probability (${(REFERRAL_LINK_PROBABILITY * 3).toFixed(2)})`);
    }
    
    // Random check - only process based on the effective probability
    const shouldShowAd = Math.random() <= effectiveProbability;
    
    // Send analytics if the probability check failed
    if (!shouldShowAd && req) {
        sendAdSkippedAnalytics(req, 'probability_check_failed', false, {
            effectiveProbability,
            triggerWordsFound,
            markerFound
        });
    }
    
    return { shouldShowAd, markerFound: markerFound || triggerWordsFound };
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
    if (!shouldProceedWithAd(content, markerFound)) {
        if (req) {
            const reason = !content || content.length < 50 
                ? 'content_too_short' 
                : 'no_markdown';
            
            sendAdSkippedAnalytics(req, reason, isStreaming, {
                contentLength: content ? content.length : 0,
                hasMarkdown: markdownRegex.test(content || '')
            });
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
                
                // Log the ad interaction
                if (req) {
                    logAdInteraction({
                        timestamp: new Date().toISOString(),
                        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                        affiliate_id: affiliateData.id,
                        affiliate_name: affiliateData.name,
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming,
                        referrer: req.headers.referer || req.headers.referrer || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown'
                    });
                    
                    // Send analytics for the ad impression
                    sendToAnalytics(req, 'ad_impression', {
                        affiliate_id: affiliateData.id,
                        affiliate_name: affiliateData.name,
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming
                    });
                }
                
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
