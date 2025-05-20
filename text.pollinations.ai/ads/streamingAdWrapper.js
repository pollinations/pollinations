import debug from 'debug';
import { Transform } from 'stream';
import { shouldShowAds } from './initRequestFilter.js';
import { sendAdSkippedAnalytics } from './initRequestFilter.js';
import { logAdInteraction } from './adLogger.js';
import { generateAdForContent } from './initRequestFilter.js';
import { formatAdAsSSE } from './initRequestFilter.js';

const log = debug('pollinations:adfilter');

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
    const shouldForceAd = forceAd || false;

    if (adAlreadyExists && !shouldForceAd) {
        log('Ad already exists in conversation history, skipping streaming ad');
        if (req) {
            sendAdSkippedAnalytics(req, 'ad_already_exists', true);
        }
        return responseStream;
    }

    if (!shouldShowAd && !shouldForceAd) {
        return responseStream;
    }

    log('Creating streaming ad wrapper' + (shouldForceAd ? ' (forced by p-ads)' : ''));

    if (messages && messages.length > 0) {
        log(`Processing streaming with ${messages.length} messages`);
        const firstMessageContent = messages[0].content;
        if (typeof firstMessageContent === 'string') {
            log(`First message content (truncated): ${firstMessageContent.substring(0, 100)}${firstMessageContent.length > 100 ? '...' : ''}`);
        } else if (firstMessageContent) {
            log(`First message content is not a string: ${typeof firstMessageContent}`);
        }
    } else {
        log('No messages provided to streaming ad wrapper');
    }

    let collectedContent = '';
    let isDone = false;
    log('Starting to collect content from stream chunks');

    const streamTransformer = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
            const chunkStr = chunk.toString();
            if (chunkStr.includes('data: [DONE]')) {
                isDone = true;
                generateAdForContent(collectedContent, req, messages, markerFound, true)
                    .then(adString => {
                        if (adString) {
                            const adChunk = formatAdAsSSE(adString);
                            this.push(adChunk);
                        } else if (shouldForceAd) {
                            log('No ad generated but p-ads marker is present. Creating generic Ko-fi ad for streaming.');
                            const genericKofiAd = "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
                            const adChunk = formatAdAsSSE(genericKofiAd);
                            this.push(adChunk);
                            if (req) {
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
                                sendAdSkippedAnalytics(req, 'generic_kofi_streaming', true);
                            }
                        }
                        this.push(chunk);
                        callback();
                    })
                    .catch(error => {
                        log('Error generating ad for streaming:', error);
                        if (shouldForceAd && req) {
                            const genericKofiAd = "\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";
                            const adChunk = formatAdAsSSE(genericKofiAd);
                            this.push(adChunk);
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
                            sendAdSkippedAnalytics(req, 'error', true, { error_message: error.message });
                        }
                        this.push(chunk);
                        callback();
                    });
            } else {
                // Collect content from the stream
                try {
                    const dataPrefix = 'data:';
                    let dataContent = chunkStr;
                    if (chunkStr.startsWith(dataPrefix)) {
                        dataContent = chunkStr.slice(dataPrefix.length).trim();
                        if (dataContent && dataContent !== '[DONE]') {
                            try {
                                const data = JSON.parse(dataContent);
                                if (data.choices && data.choices[0]) {
                                    const choice = data.choices[0];
                                    if (choice.delta && choice.delta.content) {
                                        collectedContent += choice.delta.content;
                                    } else if (choice.message && choice.message.content) {
                                        collectedContent += choice.message.content;
                                    } else if (choice.text) {
                                        collectedContent += choice.text;
                                    }
                                } else if (data.content) {
                                    collectedContent += data.content;
                                } else if (typeof data === 'string') {
                                    collectedContent += data;
                                }
                            } catch (e) {
                                if (dataContent !== '[DONE]') {
                                    collectedContent += dataContent;
                                }
                            }
                        }
                    } else {
                        // Fallback for non-standard SSE formats
                        const plainText = chunkStr.trim();
                        if (plainText && !plainText.includes('[DONE]')) {
                            try {
                                const data = JSON.parse(plainText);
                                if (data.choices && data.choices[0]) {
                                    if (data.choices[0].delta && data.choices[0].delta.content) {
                                        collectedContent += data.choices[0].delta.content;
                                    } else if (data.choices[0].message && data.choices[0].message.content) {
                                        collectedContent += data.choices[0].message.content;
                                    }
                                }
                            } catch (e) {
                                collectedContent += plainText;
                            }
                        }
                    }
                    if (collectedContent.length % 500 < 10) {
                        log(`Collected content length: ${collectedContent.length} chars`);
                    }
                } catch (e) {
                    // Log but don't fail on content extraction errors
                }
                this.push(chunk);
                callback();
            }
        }
    });
    return responseStream.pipe(streamTransformer);
}
