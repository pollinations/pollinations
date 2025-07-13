import { sendToAnalytics } from '../sendToAnalytics.js';
import debug from 'debug';
import { generateAffiliateAd } from './adLlmMapper.js';
import { logAdInteraction } from './adLogger.js';
import { affiliatesData } from '../../affiliate/affiliates.js';
import { shouldShowAds } from './shouldShowAds.js';
import { shouldProceedWithAd, sendAdSkippedAnalytics } from './adUtils.js';
import { fetchNexAd, createNexAdRequest } from './nexAdClient.js';
import { formatNexAd, extractTrackingData, trackImpression } from './nexAdFormatter.js';
import { handleAuthentication } from '../../shared/auth-utils.js';
import { incrementUserMetric } from '../../shared/userMetrics.js';

const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');

/**
 * Main function to generate ads for content
 * @param {Object} req - Express request object
 * @param {string} content - The content to potentially add ads to
 * @param {Array} messages - Array of message objects with role and content
 * @param {boolean} isStreaming - Whether this is a streaming response
 * @returns {Promise<string|null>} - Ad string or null
 */
export async function generateAdForContent(req, content, messages = [], isStreaming = false) {
    try {
        // Simply use the auth info from req
        const userId = req?.authResult?.userId;
        if (userId) {
            log(`Authenticated user ID: ${userId}`);
        } else {
            log('No authenticated user ID found in req.authResult, or req.authResult is undefined.');
        }

        // Pass req to shouldShowAds, it will use req.authResult
        const { shouldShowAd, markerFound, forceAd } = await shouldShowAds(content, messages, req);
        const shouldForceAd = markerFound || forceAd;

        // Determine if we should proceed with ad generation
        if (!shouldProceedWithAd(shouldShowAd, req, content, messages, isStreaming)) {
            return null;
        }

        log('Generating ad for content...');

        // Try nex.ad first - pass authenticated user ID
        const { visitorData, conversationContext } = createNexAdRequest(req, messages, content, userId);
        const nexAdResult = await fetchNexAd(visitorData, conversationContext);
        
        if (nexAdResult && nexAdResult.adData) {
            const { adData, userIdForTracking } = nexAdResult;
            // Only use authenticated user ID for tracking, not hashed IP fallback
            const userIdForRedirect = userId; // null if not authenticated
            // Format nex.ad response, only passing real user ID (not hashed IP)
            const adString = formatNexAd(adData, userIdForRedirect);
            
            if (adString) {
                // Extract tracking data from adData
                const trackingData = extractTrackingData(adData);
                
                // Conditional impression tracking based on authentication for privacy
                if (userId) {
                    // For authenticated users: Don't fire nex.ad impression URLs for privacy protection
                    log(`Privacy: Authenticated user ${userId} - Skipping nex.ad impression tracking for privacy`);
                } else {
                    // For unauthenticated users: Fire nex.ad impression URLs as normal
                    await trackImpression(trackingData);
                    log(`Privacy: Unauthenticated user - Fired nex.ad impression tracking`);
                }
                
                // Log the ad interaction
                if (req) {
                    logAdInteraction({
                        timestamp: new Date().toISOString(),
                        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                        campaign_id: trackingData.campaign_id,
                        ad_id: trackingData.ad_id,
                        tid: trackingData.tid,
                        ad_source: 'nexad',
                        streaming: isStreaming,
                        referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown',
                    });

                    // Send analytics for the ad impression
                    sendToAnalytics(req, 'ad_impression', {
                        campaign_id: trackingData.campaign_id,
                        ad_id: trackingData.ad_id,
                        tid: trackingData.tid,
                        ad_type: trackingData.ad_type,
                        ad_source: 'nexad',
                        streaming: isStreaming,
                        forced: shouldForceAd,
                        user_id: userId || null,
                        username: req?.authResult?.username || null,
                        authenticated: !!userId,
                        ip_sent_to_nexad: !userId,
                        impression_sent_to_nexad: !userId,
                        privacy_protected: !!userId,
                        session_id: req.sessionID || null,
                    });

                    // Track per-user ad impression metrics
                    if (userId) {
                        // Existing general metric
                        incrementUserMetric(userId, 'ad_impressions');
                        
                        // NEW: Privacy-specific metrics
                        incrementUserMetric(userId, 'privacy_protected_impressions');
                        incrementUserMetric(userId, 'nexad_impressions_without_ip');
                        
                        // NEW: Ad source specific metrics
                        incrementUserMetric(userId, 'nexad_impressions');
                    }
                }

                return adString;
            }
        }
        
        // Fallback to Ko-fi if nex.ad doesn't return ads
        log('nex.ad did not return ads, using Ko-fi as fallback.');
        
        // Find the Ko-fi affiliate in our data
        const kofiAffiliate = affiliatesData.find(a => a.id === "kofi");
        
        if (kofiAffiliate) {

            // Generate the ad string for Ko-fi
            const adString = await generateAffiliateAd("kofi", content, messages, markerFound || forceAd);

            if (adString) {
                // Log the ad interaction
                if (req) {
                    logAdInteraction({
                        timestamp: new Date().toISOString(),
                        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                        affiliate_id: "kofi",
                        affiliate_name: kofiAffiliate.name,
                        ad_source: 'kofi_fallback',
                        streaming: isStreaming,
                        referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown',
                    });

                    // Send analytics for the ad impression
                    sendToAnalytics(req, 'ad_impression', {
                        affiliate_id: "kofi",
                        affiliate_name: kofiAffiliate.name,
                        ad_source: 'kofi_fallback',
                        streaming: isStreaming,
                        forced: shouldForceAd,
                        user_id: userId || null,
                        username: req?.authResult?.username || null,
                        authenticated: !!userId,
                        session_id: req.sessionID || null,
                    });

                    // Track per-user ad impression metrics for Ko-fi fallback
                    if (userId) {
                        // Existing general metric
                        incrementUserMetric(userId, 'ad_impressions');
                        
                        // NEW: Ad source specific metric
                        incrementUserMetric(userId, 'kofi_fallback_impressions');
                    }
                }

                return adString;
            }
        }

        // If all else fails, return null
        log('No ad could be generated');
        sendAdSkippedAnalytics(req, 'no_ad_available', isStreaming);
        return null;

    } catch (error) {
        errorLog('Error in generateAdForContent:', error);
        sendAdSkippedAnalytics(req, 'error', isStreaming, { error: error.message });
        return null;
    }
}

/**
 * Process request to check if ads should be added
 * This is used for non-streaming responses
 */
export async function processRequestForAds(req, content, messages) {
    return generateAdForContent(req, content, messages, false);
}
