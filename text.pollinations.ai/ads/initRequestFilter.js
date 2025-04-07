import { generateTextPortkey } from '../generateTextPortkey.js';
import debug from 'debug';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { getRequestData } from '../requestUtils.js';
import { findRelevantAffiliate, generateAffiliateAd, extractReferralLinkInfo } from './adLlmMapper.js';
import { Transform } from 'stream';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');

// Regular expression to detect markdown content
const markdownRegex = /(?:\*\*.*\*\*)|(?:\[.*\]\(.*\))|(?:\#.*)|(?:\*.*\*)|(?:\`.*\`)|(?:\>.*)|(?:\-\s.*)|(?:\d\.\s.*)/;

// Probability of adding referral links (0%)
const REFERRAL_LINK_PROBABILITY = 0;

// Flag for testing ads with a specific marker
const TEST_ADS_MARKER = "p-ads";

// Whether to require markdown for ad processing
const REQUIRE_MARKDOWN = true;

// Extracted utility functions
function shouldShowAds(content, messages = [], req = null) {
    // Get request data for referrer check
    const requestData = req ? getRequestData(req) : null;

    // Skip ad processing if any referrer is present
    if (requestData && requestData.referrer && requestData.referrer !== 'unknown') {
        log('Skipping ad processing due to referrer presence:', requestData.referrer);
        return { shouldShowAd: false, markerFound: false };
    }
    
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
    
    // If marker is not found, use the default probability
    const effectiveProbability = markerFound ? 1.0 : REFERRAL_LINK_PROBABILITY;
    
    if (!markerFound) {
        log('No test marker "p-ads" found, using default probability');
    } else {
        log('Test marker "p-ads" found, using 100% probability');
    }
    
    // Random check - only process based on the effective probability
    const shouldShowAd = Math.random() <= effectiveProbability;
    
    if (!shouldShowAd) {
        log('Skipping ad processing due to probability check');
    }
    
    return { shouldShowAd, markerFound };
}

function shouldProceedWithAd(content, markerFound) {
    // Skip if content is empty or too short
    if (!content || content.length < 50) {
        log('Content too short for ad processing');
        return false;
    }
    
    // Check if content contains markdown (if required and not marker found)
    if (REQUIRE_MARKDOWN && !markerFound && !markdownRegex.test(content)) {
        log('No markdown detected in content, skipping ad');
        return false;
    }
    
    return true;
}

async function generateAdForContent(content, req, messages, markerFound = false, isStreaming = false) {
    if (!shouldProceedWithAd(content, markerFound)) {
        return null;
    }
    
    log(`Processing ${isStreaming ? 'streaming ' : ''}content for ad generation`);
    
    try {
        // Find the relevant affiliate
        const affiliateData = await findRelevantAffiliate(content, messages);
        
        // If affiliate data is found, generate the ad string
        if (affiliateData) {
            const adString = await generateAffiliateAd(affiliateData.id);
            
            // If an ad string was successfully generated
            if (adString) {
                // Extract info for analytics
                const linkInfo = extractReferralLinkInfo(content + adString);
                
                log(`Generated ${isStreaming ? 'streaming ' : ''}ad for affiliate ${affiliateData.name} (${affiliateData.id}). Total links: ${linkInfo.linkCount}`);
                
                // Send analytics event
                if (linkInfo.linkCount > 0) {
                    await sendToAnalytics(req, 'referralLinkAdded', {
                        linkCount: linkInfo.linkCount,
                        topics: linkInfo.topicsOrIdsString || '',
                        linkTexts: linkInfo.linkTextsString || '',
                        contentLength: content.length,
                        processedLength: content.length + adString.length,
                        affiliateIds: linkInfo.affiliateIds ? linkInfo.affiliateIds.join(',') : '',
                        affiliateName: affiliateData.name || '',
                        isStreaming
                    });
                }
                
                return adString;
            }
        }
        
        log(`No relevant affiliate found for ${isStreaming ? 'streaming ' : ''}content`);
        return null;
    } catch (error) {
        errorLog(`Error generating ${isStreaming ? 'streaming ' : ''}ad:`, error);
        return null;
    }
}

function formatAdAsSSE(adString) {
    // Create a fake delta object that matches OpenAI's format
    const fakeChunk = {
        id: 'ad-chunk',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4',
        choices: [{
            index: 0,
            delta: {
                content: adString
            },
            finish_reason: null
        }]
    };
    
    // Format as SSE
    return `data: ${JSON.stringify(fakeChunk)}\n\n`;
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
        return content;
    }
    
    const adString = await generateAdForContent(content, req, messages, markerFound, false);
    
    if (adString) {
        return content + adString;
    }
    
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
        return responseStream;
    }
    
    const { shouldShowAd, markerFound } = shouldShowAds(null, messages, req);
    
    if (!shouldShowAd) {
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
                        }
                        
                        // Push the [DONE] message
                        this.push(chunk);
                        callback();
                    })
                    .catch(error => {
                        errorLog('Error processing streaming ad:', error);
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
