import debug from 'debug';
import { sendToAnalytics } from '../sendToAnalytics.js';
import { findRelevantAffiliate, generateAffiliateAd, extractReferralLinkInfo, REDIRECT_BASE_URL } from './adLlmMapper.js';
import { logAdInteraction } from './adLogger.js';
import { affiliatesData } from '../../affiliate/affiliates.js';
import { shouldShowAds } from './shouldShowAds.js';
import { shouldProceedWithAd , sendAdSkippedAnalytics} from './adUtils.js';
const log = debug('pollinations:adfilter');
const errorLog = debug('pollinations:adfilter:error');


// Flag for testing ads with a specific marker


// Function to get user's country code from request
function getUserCountry(req) {
    if (!req) return null;
    
    // Check for country code in headers (common for proxies like Cloudflare)
    const cfCountry = req.headers['cf-ipcountry'];
    if (cfCountry) {
        log(`Country from Cloudflare header: ${cfCountry}`);
        return cfCountry;
    }
    
    // Check for country in X-Geo-Country header (some CDNs use this)
    const xGeoCountry = req.headers['x-geo-country'];
    if (xGeoCountry) {
        log(`Country from X-Geo-Country header: ${xGeoCountry}`);
        return xGeoCountry;
    }
    
    // If no country information is available, return null
    log('No country information found in request headers');
    return null;
}

export async function generateAdForContent(content, req, messages, markerFound = false, isStreaming = false) {
    // Log the function call with details
    log(`generateAdForContent called with isStreaming=${isStreaming}, markerFound=${markerFound}, content length=${content ? content.length : 0}`);

    // For streaming requests, log more details about the content
    if (isStreaming) {
        if (content) {
            log(`Streaming content sample (first 100 chars): ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
        } else {
            log('No content provided for streaming ad generation');
        }

        // Log message count
        log(`Message count for streaming ad generation: ${messages ? messages.length : 0}`);
    }

    // Skip if we've already processed this request ID
    if (req && req.pollinationsAdProcessed) {
        log('Request already processed for ads, skipping duplicate processing');
        return null;
    }

    // Mark request as processed
    if (req) {
        req.pollinationsAdProcessed = true;
    }

    // Get user's country code
    const userCountry = getUserCountry(req);
    log(`User country detected: ${userCountry || 'unknown'}`);

    // Check if we should show ads for this content
    const { shouldShowAd, markerFound: detectedMarker, isBadDomain, adAlreadyExists, forceAd } = shouldShowAds(content, messages, req);

    // Handle bad domain referrers - always show ads (100% probability)
    if (isBadDomain) {
        markerFound = true; // Force marker to true to ensure 100% probability
    }

    // If p-ads marker was found, set forceAd flag
    const shouldForceAd = forceAd || false;

    if (!shouldShowAd && !shouldProceedWithAd(content, markerFound || detectedMarker) && !shouldForceAd) {
        if (req) {
            const reason = !content ? 'empty_content' :
                           content.length < 100 ? 'content_too_short' :
                           adAlreadyExists ? 'ad_already_exists' :
                           'probability_check_failed';

            sendAdSkippedAnalytics(req, reason, isStreaming);
        }
        return null;
    }

    try {
        log('Generating ad for content...');

        // Find the relevant affiliate, passing the user's country code
        const affiliateData = await findRelevantAffiliate(content, messages, userCountry);

        // If no affiliate data is found but we should force an ad (p-ads marker present)
        if (!affiliateData && shouldForceAd) {
            log('No relevant affiliate found, but p-ads marker is present. Using Ko-fi as fallback.');
            // Find the Ko-fi affiliate in our data as a guaranteed fallback
            const kofiAffiliate = affiliatesData.find(a => a.id === "kofi");

            if (kofiAffiliate) {
                // Check if Ko-fi is blocked in user's country
                if (userCountry && kofiAffiliate.blockedCountries && kofiAffiliate.blockedCountries.includes(userCountry)) {
                    log(`Ko-fi affiliate is blocked in user's country (${userCountry}), skipping ad`);
                    sendAdSkippedAnalytics(req, 'country_blocked', isStreaming, {
                        affiliate_id: "kofi",
                        affiliate_name: kofiAffiliate.name,
                        country: userCountry
                    });
                    return null;
                }

                // Generate the ad string for Ko-fi
                const adString = await generateAffiliateAd("kofi", content, messages, markerFound || detectedMarker);

                if (adString) {
                    // Extract info for analytics
                    const linkInfo = extractReferralLinkInfo(adString);

                    // Log the ad interaction with metadata
                    if (req) {
                        logAdInteraction({
                            timestamp: new Date().toISOString(),
                            ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                            affiliate_id: "kofi",
                            affiliate_name: kofiAffiliate.name,
                            topic: linkInfo.topic || 'unknown',
                            streaming: isStreaming,
                            referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                            user_agent: req.headers['user-agent'] || 'unknown',
                            country: userCountry || 'unknown'
                        });

                        // Send analytics for the ad impression
                        sendToAnalytics(req, 'ad_impression', {
                            affiliate_id: "kofi",
                            affiliate_name: kofiAffiliate.name,
                            topic: linkInfo.topic || 'unknown',
                            streaming: isStreaming,
                            forced: true,
                            country: userCountry || 'unknown'
                        });
                    }

                    return adString;
                }
            }
        }

        // If no affiliate data is found and not forcing an ad, send analytics and return null
        if (!affiliateData && req && !shouldForceAd) {
            sendAdSkippedAnalytics(req, 'no_relevant_affiliate', isStreaming);
            return null;
        }

        // If affiliate data is found, generate the ad string
        if (affiliateData) {
            // Pass content and messages to enable language matching
            const adString = await generateAffiliateAd(affiliateData.id, content, messages, markerFound || detectedMarker);

            // If ad generation failed but we should force an ad (p-ads marker present)
            if (!adString && shouldForceAd) {
                log('Ad generation failed, but p-ads marker is present. Using Ko-fi as fallback.');
                // Try with Ko-fi as a fallback
                const kofiAdString = await generateAffiliateAd("kofi", content, messages, markerFound || detectedMarker);

                if (kofiAdString && req) {
                    // Extract info for analytics
                    const linkInfo = extractReferralLinkInfo(kofiAdString);

                    // Log the ad interaction with metadata
                    logAdInteraction({
                        timestamp: new Date().toISOString(),
                        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                        affiliate_id: "kofi",
                        affiliate_name: "Support Pollinations on Ko-fi",
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming,
                        referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown'
                    });

                    // Send analytics for the ad impression
                    sendToAnalytics(req, 'ad_impression', {
                        affiliate_id: "kofi",
                        affiliate_name: "Support Pollinations on Ko-fi",
                        topic: linkInfo.topic || 'unknown',
                        streaming: isStreaming,
                        forced: true
                    });

                    return kofiAdString;
                }
            }

            // If ad generation failed and not forcing an ad, send analytics
            if (!adString && req && !shouldForceAd) {
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
                if (req) {
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
                        streaming: isStreaming,
                        forced: shouldForceAd
                    });
                }

                return adString;
            }
        }

        // If we get here and should force an ad, create a generic Ko-fi ad as last resort
        if (shouldForceAd) {
            log('All ad generation attempts failed, but p-ads marker is present. Creating generic Ko-fi ad.');
            const genericKofiAd = "\n\n---\n🌸 **Ad** 🌸\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";

            if (req) {
                // Log the ad interaction with metadata
                logAdInteraction({
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                    affiliate_id: "kofi",
                    affiliate_name: "Support Pollinations on Ko-fi",
                    topic: "generic",
                    streaming: isStreaming,
                    referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });

                // Send analytics for the ad impression
                sendToAnalytics(req, 'ad_impression', {
                    affiliate_id: "kofi",
                    affiliate_name: "Support Pollinations on Ko-fi",
                    topic: "generic",
                    streaming: isStreaming,
                    forced: true
                });
            }

            return genericKofiAd;
        }

        return null;
    } catch (error) {
        errorLog(`Error generating ad: ${error.message}`);

        // If error occurs but we should force an ad, return a generic Ko-fi ad
        if (shouldForceAd) {
            log('Error occurred, but p-ads marker is present. Creating generic Ko-fi ad as fallback.');
            const genericKofiAd = "\n\n---\n🌸 **Ad** 🌸\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";

            if (req) {
                // Log the ad interaction with metadata
                logAdInteraction({
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                    affiliate_id: "kofi",
                    affiliate_name: "Support Pollinations on Ko-fi",
                    topic: "error_fallback",
                    streaming: isStreaming,
                    referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });

                // Send analytics for the ad impression
                sendToAnalytics(req, 'ad_impression', {
                    affiliate_id: "kofi",
                    affiliate_name: "Support Pollinations on Ko-fi",
                    topic: "error_fallback",
                    streaming: isStreaming,
                    forced: true,
                    error: error.message
                });
            }

            return genericKofiAd;
        }

        if (req) {
            sendAdSkippedAnalytics(req, 'error', isStreaming, {
                error_message: error.message
            });
        }
        return null;
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
    const { shouldShowAd, markerFound, forceAd } = shouldShowAds(content, messages, req);

    // If p-ads marker was found, set forceAd flag
    const shouldForceAd = forceAd || false;

    if (!shouldShowAd && !shouldForceAd) {
        // We've already sent the ad_skipped analytics in shouldShowAds
        return content;
    }

    // Generate ad string based on content
    const adString = await generateAdForContent(content, req, messages, markerFound);

    if (adString) {
        return content + adString;
    }

    // If we should force an ad but none was generated, create a generic Ko-fi ad
    if (shouldForceAd) {
        log('No ad generated but p-ads marker is present. Creating generic Ko-fi ad for non-streaming response.');
        const genericKofiAd = "\n\n---\n🌸 **Ad** 🌸\nPowered by Pollinations.AI free text APIs. [Support our mission](https://pollinations.ai/redirect/kofi) to keep AI accessible for everyone.";

        if (req) {
            // Log the ad interaction with metadata
            logAdInteraction({
                timestamp: new Date().toISOString(),
                ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                affiliate_id: "kofi",
                affiliate_name: "Support Pollinations on Ko-fi",
                topic: "nonstreaming_fallback",
                streaming: false,
                referrer: req.headers.referer || req.headers.referrer || req.headers.origin || 'unknown',
                user_agent: req.headers['user-agent'] || 'unknown'
            });

            // Send analytics for the ad impression
            sendToAnalytics(req, 'ad_impression', {
                affiliate_id: "kofi",
                affiliate_name: "Support Pollinations on Ko-fi",
                topic: "nonstreaming_fallback",
                streaming: false,
                forced: true,
                fallback: true
            });
        }

        return content + genericKofiAd;
    }

    // We've already sent the ad_skipped analytics in generateAdForContent
    return content;
}
