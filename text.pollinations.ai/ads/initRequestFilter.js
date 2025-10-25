import { sendToAnalytics } from "../sendToAnalytics.js";
import debug from "debug";
import { generateAffiliateAd } from "./adLlmMapper.js";
import { logAdInteraction } from "./adLogger.js";
import { affiliatesData } from "../../shared/affiliates.js";
import { shouldShowAds } from "./shouldShowAds.js";
import { shouldProceedWithAd, sendAdSkippedAnalytics } from "./adUtils.js";
// NEXAD DISABLED: Removed nexad imports
// import { fetchNexAd, createNexAdRequest } from "./nexAdClient.js";
// import {
//     formatNexAd,
//     extractTrackingData,
//     trackImpression,
// } from "./nexAdFormatter.js";
import { handleAuthentication } from "../../shared/auth-utils.js";
import { incrementUserMetric } from "../../shared/userMetrics.js";

const log = debug("pollinations:adfilter");
const errorLog = debug("pollinations:adfilter:error");

/**
 * Main function to generate ads for content
 * @param {Object} req - Express request object
 * @param {string} content - The content to potentially add ads to
 * @param {Array} messages - Array of message objects with role and content
 * @param {boolean} isStreaming - Whether this is a streaming response
 * @returns {Promise<string|null>} - Ad string or null
 */
export async function generateAdForContent(
    req,
    content,
    messages = [],
    isStreaming = false,
) {
    try {
        // Get authenticated user ID if available - do this once at the top
        let authResult = null;
        let authenticatedUserId = null;

        try {
            authResult = await handleAuthentication(req);
            if (authResult.authenticated && authResult.userId) {
                authenticatedUserId = authResult.userId;
                log(`Authenticated user ID: ${authenticatedUserId}`);
            }
        } catch (error) {
            // Authentication failed, continue without user ID
            log(
                "Authentication failed or not provided, continuing without user ID",
            );
        }

        // Check if we should show ads - pass auth result to avoid duplicate authentication
        const { shouldShowAd, markerFound, forceAd } = await shouldShowAds(
            content,
            messages,
            req,
            authResult,
        );
        const shouldForceAd = markerFound || forceAd;

        // Determine if we should proceed with ad generation
        if (
            !shouldProceedWithAd(
                shouldShowAd,
                req,
                content,
                messages,
                isStreaming,
            )
        ) {
            return null;
        }

        log("Generating ad for content...");

        // NEXAD DISABLED: Skip nex.ad and use Ko-fi directly
        log("nexad disabled, using Ko-fi for ads");

        // Find the Ko-fi affiliate in our data
        const kofiAffiliate = affiliatesData.find((a) => a.id === "kofi");

        if (kofiAffiliate) {
            // Generate the ad string for Ko-fi
            const adString = await generateAffiliateAd(
                "kofi",
                content,
                messages,
                markerFound || forceAd,
            );

            if (adString) {
                // Log the ad interaction
                if (req) {
                    logAdInteraction({
                        timestamp: new Date().toISOString(),
                        ip:
                            req.ip ||
                            req.headers["x-forwarded-for"] ||
                            "unknown",
                        affiliate_id: "kofi",
                        affiliate_name: kofiAffiliate.name,
                        ad_source: "kofi",
                        streaming: isStreaming,
                        referrer:
                            req.headers.referer ||
                            req.headers.referrer ||
                            req.headers.origin ||
                            "unknown",
                        user_agent: req.headers["user-agent"] || "unknown",
                    });

                    // Send analytics for the ad impression
                    sendToAnalytics(req, "ad_impression", {
                        affiliate_id: "kofi",
                        affiliate_name: kofiAffiliate.name,
                        ad_source: "kofi",
                        streaming: isStreaming,
                        forced: shouldForceAd,
                        user_id: authenticatedUserId || null,
                        username: authResult?.username || null,
                        authenticated: !!authenticatedUserId,
                        session_id: req.sessionID || null,
                    });

                    // Track per-user ad impression metrics for Ko-fi
                    if (authenticatedUserId) {
                        // DISABLED: Metrics updates causing DB contention (GitHub Issue #3258)
                        // incrementUserMetric(
                        //     authenticatedUserId,
                        //     "ad_impressions",
                        // );
                        // DISABLED: Ad source specific metric
                        // incrementUserMetric(
                        //     authenticatedUserId,
                        //     "kofi_impressions",
                        // );
                    }
                }

                return adString;
            }
        }

        // If all else fails, return null
        log("No ad could be generated");
        sendAdSkippedAnalytics(req, "no_ad_available", isStreaming);
        return null;
    } catch (error) {
        errorLog("Error in generateAdForContent:", error);
        sendAdSkippedAnalytics(req, "error", isStreaming, {
            error: error.message,
        });
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
