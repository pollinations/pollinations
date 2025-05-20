import { logAdInteraction } from './adLogger.js';
import { extractReferralLinkInfo, generateAffiliateAd } from './adLlmMapper.js';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { sendAdSkippedAnalytics } from './adUtils.js';

/**
 * Generates an ad string for the provided content, messages, and request context.
 * Handles affiliate matching, analytics, and fallback logic.
 * @param {string} content - The output content to process
 * @param {object} req - Express request object for analytics
 * @param {Array} messages - The input messages (optional)
 * @param {boolean} markerFound - Whether the p-ads marker was detected
 * @param {boolean} isStreaming - Whether this is a streaming response
 * @param {boolean} shouldForceAd - Whether ad display is forced
 * @returns {Promise<string|null>} - The generated ad string or null if none
 */
export default async function generateAdForContent(content, req, messages, markerFound = false, isStreaming = false, shouldForceAd = false) {
    try {
        // Attempt to find relevant affiliate data (if any)
        let affiliateData = null;
        let detectedMarker = markerFound;
        // TODO: Add logic here if affiliateData should be determined
        // For now, assume affiliateData is determined elsewhere or passed in

        // If no affiliate data and not forcing an ad, send analytics and return null
        if (!affiliateData && req && !shouldForceAd) {
            sendAdSkippedAnalytics(req, 'no_relevant_affiliate', isStreaming);
            return null;
        }

        // If affiliate data is found, generate the ad string
        if (affiliateData) {
            const adString = await generateAffiliateAd(affiliateData.id, content, messages, markerFound || detectedMarker);
            if (!adString && shouldForceAd) {
                // Fallback to Ko-fi ad
                const kofiAdString = await generateAffiliateAd('kofi', content, messages, markerFound || detectedMarker);
                if (kofiAdString && req) {
                    const linkInfo = extractReferralLinkInfo(kofiAdString);
                    logAdInteraction({
                        timestamp: new Date().toISOString(),
                        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                        affiliate_id: 'kofi',
                        affiliate_name: 'Support Pollinations on Ko-fi',
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming,
                        referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown',
                    });
                    sendToAnalytics(req, 'ad_impression', {
                        affiliate_id: 'kofi',
                        affiliate_name: 'Support Pollinations on Ko-fi',
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming,
                        forced: true,
                    });
                    return kofiAdString;
                }
            }
            if (!adString && req && !shouldForceAd) {
                sendAdSkippedAnalytics(req, 'ad_generation_failed', isStreaming, {
                    affiliate_id: affiliateData.id,
                    affiliate_name: affiliateData.name,
                });
                return null;
            }
            if (adString) {
                const linkInfo = extractReferralLinkInfo(adString);
                if (req) {
                    logAdInteraction({
                        timestamp: new Date().toISOString(),
                        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                        affiliate_id: affiliateData.id,
                        affiliate_name: affiliateData.name,
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming,
                        referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown',
                    });
                    sendToAnalytics(req, 'ad_impression', {
                        affiliate_id: affiliateData.id,
                        affiliate_name: affiliateData.name,
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming,
                        forced: shouldForceAd,
                    });
                }
                return adString;
            }
        }
        // If we get here and should force an ad, create a generic Ko-fi ad as last resort
        if (shouldForceAd) {
            const genericKofiAd = '\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.';
            if (req) {
                logAdInteraction({
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                    affiliate_id: 'kofi',
                    affiliate_name: 'Support Pollinations on Ko-fi',
                    topic: 'generic',
                    streaming: isStreaming,
                    referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown',
                });
                sendToAnalytics(req, 'ad_impression', {
                    affiliate_id: 'kofi',
                    affiliate_name: 'Support Pollinations on Ko-fi',
                    topic: 'generic',
                    streaming: isStreaming,
                    forced: true,
                });
            }
            return genericKofiAd;
        }
        return null;
    } catch (error) {
        // If error occurs but we should force an ad, return a generic Ko-fi ad
        if (shouldForceAd) {
            const genericKofiAd = '\n\n---\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.';
            if (req) {
                logAdInteraction({
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                    affiliate_id: 'kofi',
                    affiliate_name: 'Support Pollinations on Ko-fi',
                    topic: 'error_fallback',
                    streaming: isStreaming,
                    referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown',
                });
                sendToAnalytics(req, 'ad_impression', {
                    affiliate_id: 'kofi',
                    affiliate_name: 'Support Pollinations on Ko-fi',
                    topic: 'error_fallback',
                    streaming: isStreaming,
                    forced: true,
                    error: error.message,
                });
            }
            return genericKofiAd;
        }
        if (req) {
            sendAdSkippedAnalytics(req, 'error', isStreaming, {
                error_message: error.message,
            });
        }
        return null;
    }
}
