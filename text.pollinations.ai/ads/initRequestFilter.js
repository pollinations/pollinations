import { sendToAnalytics } from '../sendToAnalytics.js';
import debug from 'debug';
import { generateAffiliateAd } from './adLlmMapper.js';
import { logAdInteraction } from './adLogger.js';
import { affiliatesData } from '../../affiliate/affiliates.js';
import { shouldShowAds } from './shouldShowAds.js';
import { shouldProceedWithAd, sendAdSkippedAnalytics } from './adUtils.js';
import { fetchNexAd, createNexAdRequest } from './nexAdClient.js';
import { formatNexAd, extractTrackingData, trackImpression } from './nexAdFormatter.js';

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
        // Extract user country from request headers
        const userCountry = req?.headers?.['cf-ipcountry'] || 
                           req?.headers?.['x-geo-country'] || 
                           req?.headers?.['x-vercel-ip-country'] ||
                           null;
        
        log(`User country detected: ${userCountry || 'unknown'}`);

        // Check if we should show ads
        const { shouldShowAd, markerFound, forceAd } = shouldShowAds(content, messages, req);
        const shouldForceAd = markerFound || forceAd;

        // Determine if we should proceed with ad generation
        if (!shouldProceedWithAd(shouldShowAd, req, content, messages, isStreaming)) {
            return null;
        }

        log('Generating ad for content...');

        // Try nex.ad first
        const { visitorData, conversationContext } = createNexAdRequest(req, messages, content);
        const nexAdResponse = await fetchNexAd(visitorData, conversationContext);
        
        if (nexAdResponse) {
            // Format nex.ad response
            const adString = formatNexAd(nexAdResponse);
            
            if (adString) {
                // Extract tracking data
                const trackingData = extractTrackingData(nexAdResponse);
                
                // Track impression
                await trackImpression(trackingData);
                
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
                        country: userCountry || 'unknown'
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
                        country: userCountry || 'unknown'
                    });
                }

                return adString;
            }
        }
        
        // Fallback to Ko-fi if nex.ad doesn't return ads
        log('nex.ad did not return ads, using Ko-fi as fallback.');
        
        // Find the Ko-fi affiliate in our data
        const kofiAffiliate = affiliatesData.find(a => a.id === "kofi");
        
        if (kofiAffiliate) {
            // Check if Ko-fi is blocked in user's country
            if (userCountry && kofiAffiliate.blockedCountries && kofiAffiliate.blockedCountries.includes(userCountry)) {
                log(`Ko-fi is blocked in user's country (${userCountry}), skipping ad`);
                sendAdSkippedAnalytics(req, 'country_blocked', isStreaming, {
                    affiliate_id: "kofi",
                    affiliate_name: kofiAffiliate.name,
                    country: userCountry
                });
                return null;
            }

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
                        country: userCountry || 'unknown'
                    });

                    // Send analytics for the ad impression
                    sendToAnalytics(req, 'ad_impression', {
                        affiliate_id: "kofi",
                        affiliate_name: kofiAffiliate.name,
                        ad_source: 'kofi_fallback',
                        streaming: isStreaming,
                        forced: shouldForceAd,
                        country: userCountry || 'unknown'
                    });
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
