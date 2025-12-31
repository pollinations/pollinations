import debug from "debug";
import { affiliatesData } from "../../shared/affiliates.js";
import { generateAffiliateAd } from "./adLlmMapper.js";
import { logAdInteraction } from "./adLogger.js";
import { sendAdSkippedAnalytics, shouldProceedWithAd } from "./adUtils.js";
import { shouldShowAds } from "./shouldShowAds.js";

const log = debug("pollinations:adfilter");
const errorLog = debug("pollinations:adfilter:error");

// Global flag to disable ad system
const ADS_GLOBALLY_DISABLED = true;

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
    // Early return if ads are globally disabled
    if (ADS_GLOBALLY_DISABLED) {
        return null;
    }

    try {
        // Authentication removed - ads are globally disabled anyway
        const authResult = null;
        const authenticatedUserId = null;

        // Check if we should show ads - pass auth result to avoid duplicate authentication
        const { shouldShowAd, markerFound, forceAd } = await shouldShowAds(
            content,
            messages,
            req,
            authResult,
        );
        const _shouldForceAd = markerFound || forceAd;

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
