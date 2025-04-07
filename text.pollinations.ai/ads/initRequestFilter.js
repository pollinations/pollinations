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

/**
 * Process content and add referral links if markdown is detected
 * @param {string} content - The output content to process
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages (optional)
 * @returns {Promise<string>} - The processed content with referral links
 */
export async function processRequestForAds(content, req, messages = []) {
    // Get request data for referrer check
    const requestData = getRequestData(req);

    // Skip ad processing if any referrer is present
    if (requestData.referrer && requestData.referrer !== 'unknown') {
        log('Skipping ad processing due to referrer presence:', requestData.referrer);
        return content;
    }

    // Test filter: check if content or input messages contain the test marker "p-ads"
    let markerFound = content.includes(TEST_ADS_MARKER);
    
    // Also check in the input messages if available
    if (!markerFound && messages && messages.length > 0) {
        markerFound = messages.some(msg => msg.content && msg.content.includes(TEST_ADS_MARKER));
    }
    
    // Check if content contains markdown (if required and not test marker)
    if (REQUIRE_MARKDOWN && !markerFound && !markdownRegex.test(content)) 
        return content;
    
    // If marker is found, set probability to 100%, otherwise use the default probability
    const effectiveProbability = markerFound ? 1.0 : REFERRAL_LINK_PROBABILITY;
    
    if (!markerFound) {
        log('No test marker "p-ads" found, using default probability');
    } else {
        log('Test marker "p-ads" found, using 100% probability');
    }
    
    // Random check - only process based on the effective probability
    if (Math.random() > effectiveProbability) {
        log('Skipping referral link processing due to probability check');
        return content;
    }

    log('Processing content for referral links');

    try {
        // Find the relevant affiliate - now returns an object with affiliate details
        const affiliateData = await findRelevantAffiliate(content, messages);
        
        // If affiliate data is found, generate the ad string
        if (affiliateData) {
            const adString = await generateAffiliateAd(affiliateData.id);
            
            // If an ad string was successfully generated, append it
            if (adString) {
                const processedContent = content + adString; // Append ad string
                
                // Extract info for analytics
                const linkInfo = extractReferralLinkInfo(processedContent); 
                
                log(`Appended ad for affiliate ${affiliateData.name} (${affiliateData.id}). Total links now: ${linkInfo.linkCount}`);
                
                // Send analytics event
                if (linkInfo.linkCount > 0) {
                    await sendToAnalytics(req, 'referralLinkAdded', {
                        linkCount: linkInfo.linkCount,
                        topics: linkInfo.topicsOrIdsString || '', 
                        linkTexts: linkInfo.linkTextsString || '',
                        contentLength: content.length,
                        processedLength: processedContent.length,
                        affiliateIds: linkInfo.affiliateIds ? linkInfo.affiliateIds.join(',') : '',
                        affiliateName: affiliateData.name || ''
                    });
                }
                
                return processedContent; // Return content with appended ad
            }
        }
        
        // If no relevant affiliate or ad string couldn't be generated, return original content
        log("No relevant affiliate found or ad generation failed.");
        return content;

    } catch (error) {
        errorLog('Error adding referral links:', error);
        // If there's an error, return the original content
        return content;
    }
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
    
    // Get request data for referrer check
    const requestData = getRequestData(req);

    // Skip ad processing if any referrer is present
    if (requestData.referrer && requestData.referrer !== 'unknown') {
        log('Skipping streaming ad processing due to referrer presence:', requestData.referrer);
        return responseStream;
    }
    
    // Check if messages contain the test marker "p-ads"
    let markerFound = false;
    if (messages && messages.length > 0) {
        markerFound = messages.some(msg => msg.content && msg.content.includes(TEST_ADS_MARKER));
    }
    
    // If marker is not found, use the default probability
    const effectiveProbability = markerFound ? 1.0 : REFERRAL_LINK_PROBABILITY;
    
    if (!markerFound) {
        log('No test marker "p-ads" found in messages, using default probability');
    } else {
        log('Test marker "p-ads" found in messages, using 100% probability');
    }
    
    // Random check - only process based on the effective probability
    if (Math.random() > effectiveProbability) {
        log('Skipping streaming ad processing due to probability check');
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
                processCollectedContent(collectedContent, req, messages)
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

/**
 * Process the collected content and generate an ad if appropriate
 * @param {string} content - The collected content from the stream
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages
 * @returns {Promise<string|null>} - The ad string or null if no ad should be added
 */
async function processCollectedContent(content, req, messages) {
    // Skip if content is empty or too short
    if (!content || content.length < 50) {
        log('Content too short for streaming ad processing');
        return null;
    }
    
    // Check if content contains markdown
    if (REQUIRE_MARKDOWN && !markdownRegex.test(content)) {
        log('No markdown detected in streaming content, skipping ad');
        return null;
    }
    
    log('Processing streaming content for ad generation');
    
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
                
                log(`Generated streaming ad for affiliate ${affiliateData.name} (${affiliateData.id}). Total links: ${linkInfo.linkCount}`);
                
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
                        isStreaming: true
                    });
                }
                
                return adString;
            }
        }
        
        log('No relevant affiliate found for streaming content');
        return null;
    } catch (error) {
        errorLog('Error generating streaming ad:', error);
        return null;
    }
}

/**
 * Format an ad string as a Server-Sent Event (SSE) message
 * @param {string} adString - The ad string to format
 * @returns {string} - The formatted SSE message
 */
function formatAdAsSSE(adString) {
    // Create a delta object in the same format as OpenAI's streaming API
    const deltaObject = {
        choices: [{
            delta: { content: adString },
            index: 0,
            finish_reason: null
        }]
    };
    
    // Format as an SSE message
    return `data: ${JSON.stringify(deltaObject)}\n\n`;
}
