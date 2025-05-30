import { Transform } from 'stream';
import debug from 'debug';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { logAdInteraction } from './adLogger.js';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');
import { generateAdForContent } from './initRequestFilter.js';
import { sendAdSkippedAnalytics } from './adUtils.js';
import { shouldShowAds } from './shouldShowAds.js';
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

    // Create a transform stream that will:
    // 1. Pass through all chunks unchanged
    // 2. Collect content for analysis
    // 3. Add an ad after the [DONE] message
    const streamTransformer = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
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
                        } else if (shouldForceAd) {
                            // If we're forcing an ad but none was generated, create a generic Ko-fi ad
                            log('No ad generated but p-ads marker is present. Creating generic Ko-fi ad for streaming.');
                            const genericKofiAd = "\n\n---\n🌸 **Ad** 🌸\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
                            const adChunk = formatAdAsSSE(genericKofiAd);

                            // Push the ad chunk before the [DONE] message
                            this.push(adChunk);

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
                        } else {
                            // We've already sent the ad_skipped analytics in generateAdForContent
                        }

                        // Push the [DONE] message
                        this.push(chunk);
                        callback();
                    })
                    .catch(error => {
                        errorLog('Error processing streaming ad:', error);

                        if (shouldForceAd) {
                            // If error occurs but we should force an ad, create a generic Ko-fi ad
                            log('Error occurred, but p-ads marker is present. Creating generic Ko-fi ad for streaming.');
                            const genericKofiAd = "\n\n---\n🌸 **Ad** 🌸\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
                            const adChunk = formatAdAsSSE(genericKofiAd);

                            // Push the ad chunk before the [DONE] message
                            this.push(adChunk);

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

                        // Push the [DONE] message
                        this.push(chunk);
                        callback();
                    });
            } else {
                // For normal chunks, extract the content and pass through unchanged
                if (!isDone) {
                    try {
                        // Try to extract content from the SSE data
                        // First, try the standard SSE format with data: prefix
                        const contentMatches = chunkStr.match(/data: (.*?)(?:\n\n|$)/g);

                        if (contentMatches && contentMatches.length > 0) {
                            // Process each match (there might be multiple data: lines in one chunk)
                            for (const match of contentMatches) {
                                const dataContent = match.replace(/^data: /, '').trim();

                                if (dataContent) {
                                    try {
                                        // Try to parse as JSON first
                                        const data = JSON.parse(dataContent);

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
                                        } else if (typeof data === 'string') {
                                            // Direct string response
                                            collectedContent += data;
                                        }
                                    } catch (e) {
                                        // If not valid JSON, treat as plain text
                                        // This handles cases where the response is not JSON
                                        if (dataContent !== '[DONE]') {
                                            collectedContent += dataContent;
                                        }
                                    }
                                }
                            }
                        } else {
                            // If no data: prefix found, try to use the chunk as is
                            // This is a fallback for non-standard SSE formats
                            const plainText = chunkStr.trim();
                            if (plainText && !plainText.includes('[DONE]')) {
                                try {
                                    // Try to parse as JSON
                                    const data = JSON.parse(plainText);
                                    if (data.choices && data.choices[0]) {
                                        if (data.choices[0].delta && data.choices[0].delta.content) {
                                            collectedContent += data.choices[0].delta.content;
                                        } else if (data.choices[0].message && data.choices[0].message.content) {
                                            collectedContent += data.choices[0].message.content;
                                        }
                                    }
                                } catch (e) {
                                    // If not JSON, use as plain text
                                    collectedContent += plainText;
                                }
                            }
                        }

                        // Log collected content periodically (every 500 chars)
                        if (collectedContent.length % 500 < 10) {
                            log(`Collected content length: ${collectedContent.length} chars`);
                        }
                    } catch (e) {
                        // Log but don't fail on content extraction errors
                        errorLog(`Error extracting content from stream chunk: ${e.message}`);
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



function formatAdAsSSE(adString) {
    try {
        // Log that we're formatting an ad as SSE
        log(`Formatting ad as SSE: ${adString.substring(0, 50)}${adString.length > 50 ? '...' : ''}`);

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
        const formattedSSE = `data: ${JSON.stringify(deltaObject)}\n\n`;

        // Log the formatted SSE (truncated for brevity)
        log(`Formatted SSE (truncated): ${formattedSSE.substring(0, 100)}${formattedSSE.length > 100 ? '...' : ''}`);

        return formattedSSE;
    } catch (error) {
        errorLog(`Error formatting ad as SSE: ${error.message}`);
        errorLog(`Error stack: ${error.stack}`);
        return '';
    }
}
