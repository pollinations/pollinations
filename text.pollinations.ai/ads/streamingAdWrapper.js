import { Transform } from 'stream';
import { createParser, EventSourceParserStream } from 'eventsource-parser/stream';
import debug from 'debug';
import { shouldShowAds, generateAdForContent, formatAdAsSSE } from './initRequestFilter.js';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { logAdInteraction } from './adInteraction.js';

const log = debug('pollinations:ads:streaming');
const errorLog = debug('pollinations:error:ads:streaming');

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

    const { shouldShowAd, markerFound, adAlreadyExists, forceAd } = shouldShowAds(null, messages, req);

    // If p-ads marker was found, set forceAd flag
    const shouldForceAd = forceAd || false;

    // Only check for existing ads if we're not forcing an ad
    if (adAlreadyExists && !shouldForceAd) {
        log('Ad already exists in conversation history, skipping streaming ad');
        if (req) {
            sendAdSkippedAnalytics(req, 'ad_already_exists', true);
        }
        return responseStream;
    }

    // Only skip if we're not forcing an ad
    if (!shouldShowAd && !shouldForceAd) {
        // We've already sent the ad_skipped analytics in shouldShowAds
        return responseStream;
    }

    log('Creating streaming ad wrapper' + (shouldForceAd ? ' (forced by p-ads)' : ''));

    // Log the messages for debugging
    if (messages && messages.length > 0) {
        log(`Processing streaming with ${messages.length} messages`);
        // Log the first message content (truncated for brevity)
        const firstMessageContent = messages[0].content;
        if (typeof firstMessageContent === 'string') {
            log(`First message content (truncated): ${firstMessageContent.substring(0, 100)}${firstMessageContent.length > 100 ? '...' : ''}`);
        } else if (firstMessageContent) {
            log(`First message content is not a string: ${typeof firstMessageContent}`);
        }
    } else {
        log('No messages provided to streaming ad wrapper');
    }

    // Collect the content to analyze for affiliate matching
    let collectedContent = '';
    let isDone = false;

    // Log when we start collecting content
    log('Starting to collect content from stream chunks');

    // Create a pipeline of transform streams using eventsource-parser
    // This provides proper SSE parsing and handling
    
    // Step 1: Create a TextDecoderStream to convert the binary stream to text
    const textDecoder = new TextDecoder();
    
    // Step 2: Create an EventSourceParserStream to parse the SSE events
    const eventSourceParser = new EventSourceParserStream();
    
    // Step 3: Create a content collector transform that will:
    // - Extract and collect content from parsed events
    // - Pass through all events unchanged
    const contentCollector = new Transform({
        objectMode: true,
        transform(event, _encoding, callback) {
            if (!isDone && event.data) {
                try {
                    // Try to parse the event data as JSON
                    const data = JSON.parse(event.data);
                    
                    // Handle different response formats
                    if (data.choices && data.choices.length > 0) {
                        // Standard OpenAI format
                        const choice = data.choices[0];
                        
                        if (choice.delta && choice.delta.content) {
                            // Streaming format with delta
                            collectedContent += choice.delta.content;
                        } else if (choice.message && choice.message.content) {
                            // Non-streaming format with message
                            collectedContent += choice.message.content;
                        } else if (choice.text) {
                            // Older API format
                            collectedContent += choice.text;
                        }
                    } else if (data.content) {
                        // Simple content field
                        collectedContent += data.content;
                    }
                    
                    // Log collected content periodically (every 500 chars)
                    if (collectedContent.length % 500 < 10) {
                        log(`Collected content length: ${collectedContent.length} chars`);
                    }
                } catch (e) {
                    // If not valid JSON, check if it's the [DONE] marker
                    if (event.data === '[DONE]') {
                        isDone = true;
                    } else {
                        // Otherwise treat as plain text
                        collectedContent += event.data;
                    }
                }
            }
            
            // Pass the event through unchanged
            callback(null, event);
        }
    });
    
    // Step 4: Create an ad injector transform that will:
    // - Pass through all events unchanged
    // - Add an ad before the [DONE] event
    const adInjector = new Transform({
        objectMode: true,
        transform(event, _encoding, callback) {
            // Check if this is the [DONE] event
            if (event.data === '[DONE]') {
                // Process the collected content and add an ad
                generateAdForContent(collectedContent, req, messages, markerFound, true)
                    .then(adString => {
                        if (adString) {
                            // Create a new event with the ad content
                            const adEvent = {
                                data: JSON.stringify({
                                    choices: [{
                                        delta: { content: adString },
                                        index: 0
                                    }]
                                })
                            };
                            
                            // Push the ad event before the [DONE] event
                            this.push(adEvent);
                        } else if (shouldForceAd) {
                            // If we're forcing an ad but none was generated, create a generic Ko-fi ad
                            log('No ad generated but p-ads marker is present. Creating generic Ko-fi ad for streaming.');
                            const genericKofiAd = "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
                            
                            // Create a new event with the ad content
                            const adEvent = {
                                data: JSON.stringify({
                                    choices: [{
                                        delta: { content: genericKofiAd },
                                        index: 0
                                    }]
                                })
                            };
                            
                            // Push the ad event before the [DONE] event
                            this.push(adEvent);
                            
                            if (req) {
                                // Log the ad interaction with metadata
                                logAdInteraction({
                                    timestamp: new Date().toISOString(),
                                    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                                    affiliate_id: "kofi",
                                    affiliate_name: "Support Pollinations on Ko-fi",
                                    topic: "streaming_fallback",
                                    streaming: true,
                                    referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                                    user_agent: req.headers['user-agent'] || 'unknown'
                                });
                                
                                // Send analytics for the ad impression
                                sendToAnalytics(req, 'ad_impression', {
                                    affiliate_id: "kofi",
                                    affiliate_name: "Support Pollinations on Ko-fi",
                                    topic: "streaming_fallback",
                                    streaming: true,
                                    forced: true,
                                    fallback: true
                                });
                            }
                        }
                        
                        // Push the [DONE] event
                        this.push(event);
                        callback();
                    })
                    .catch(error => {
                        errorLog('Error processing streaming ad:', error);
                        
                        if (shouldForceAd) {
                            // If error occurs but we should force an ad, create a generic Ko-fi ad
                            log('Error occurred, but p-ads marker is present. Creating generic Ko-fi ad for streaming.');
                            const genericKofiAd = "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
                            
                            // Create a new event with the ad content
                            const adEvent = {
                                data: JSON.stringify({
                                    choices: [{
                                        delta: { content: genericKofiAd },
                                        index: 0
                                    }]
                                })
                            };
                            
                            // Push the ad event before the [DONE] event
                            this.push(adEvent);
                            
                            if (req) {
                                // Log the ad interaction with metadata
                                logAdInteraction({
                                    timestamp: new Date().toISOString(),
                                    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                                    affiliate_id: "kofi",
                                    affiliate_name: "Support Pollinations on Ko-fi",
                                    topic: "error_streaming_fallback",
                                    streaming: true,
                                    referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                                    user_agent: req.headers['user-agent'] || 'unknown'
                                });
                                
                                // Send analytics for the ad impression
                                sendToAnalytics(req, 'ad_impression', {
                                    affiliate_id: "kofi",
                                    affiliate_name: "Support Pollinations on Ko-fi",
                                    topic: "error_streaming_fallback",
                                    streaming: true,
                                    forced: true,
                                    error: error.message
                                });
                            }
                        } else if (req) {
                            sendAdSkippedAnalytics(req, 'error', true, {
                                error_message: error.message
                            });
                        }
                        
                        // Push the [DONE] event
                        this.push(event);
                        callback();
                    });
            } else {
                // For all other events, pass through unchanged
                this.push(event);
                callback();
            }
        }
    });
    
    // Step 5: Create a serializer transform that converts parsed events back to SSE format
    const serializer = new Transform({
        objectMode: true,
        transform(event, _encoding, callback) {
            // Convert the event back to SSE format
            let output = '';
            
            if (event.id) {
                output += `id: ${event.id}\n`;
            }
            
            if (event.event) {
                output += `event: ${event.event}\n`;
            }
            
            // Split data by newlines and send each line with a data: prefix
            const dataLines = event.data.split('\n');
            for (const line of dataLines) {
                output += `data: ${line}\n`;
            }
            
            // End the event with an extra newline
            output += '\n';
            
            callback(null, output);
        }
    });
    
    // Create the pipeline
    const pipeline = responseStream
        .pipe(contentCollector)
        .pipe(adInjector)
        .pipe(serializer);
    
    // Return the final transformed stream
    return pipeline;
}

/**
 * Helper function to send analytics for skipped ads
 * @param {object} req - Express request object
 * @param {string} reason - Reason for skipping
 * @param {boolean} isStreaming - Whether this is a streaming request
 * @param {object} additionalData - Any additional data to include
 */
export function sendAdSkippedAnalytics(req, reason, isStreaming = false, additionalData = {}) {
    if (!req) return;

    sendToAnalytics(req, 'ad_skipped', {
        reason: reason,
        streaming: isStreaming,
        ...additionalData
    });
}
