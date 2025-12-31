import { getRequestData } from "../requestUtils.js";
import { REDIRECT_BASE_URL } from "./adLlmMapper.js";
import { markdownRegex, REQUIRE_MARKDOWN } from "./adUtils.js";

// Global flag to completely disable ad system
const ADS_GLOBALLY_DISABLED = true;

// Ads disabled by default (legacy system being phased out)
const REFERRAL_LINK_PROBABILITY = 0;

const TEST_ADS_MARKER = "p-ads";

const SKIP_USER_AGENTS = ["Roblox/Linux"];
// Parse bad domains from environment variable (comma-separated list)
// Add vk.com as a blocked domain due to advertiser complaints
const BAD_DOMAINS = process.env.BAD_DOMAINS
    ? process.env.BAD_DOMAINS.split(",").map((domain) =>
          domain.trim().toLowerCase(),
      )
    : [];

// Always include vk.com in blocked domains
if (!BAD_DOMAINS.includes("vk.com")) {
    BAD_DOMAINS.push("vk.com");
}

import debug from "debug";

const log = debug("pollinations:shouldShowAds");
// Extracted utility functions

export async function shouldShowAds(
    content,
    messages = [],
    req = null,
    authResult = null,
) {
    // Early return if ads are globally disabled
    if (ADS_GLOBALLY_DISABLED) {
        return {
            shouldShowAd: false,
            markerFound: false,
            globallyDisabled: true,
        };
    }

    log(
        "shouldShowAds called with content length:",
        content?.length,
        "messages:",
        messages?.length,
        "req:",
        !!req,
        "authResult:",
        !!authResult,
    );

    // Skip ads for specific user agents
    if (req?.headers?.["user-agent"]) {
        const userAgent = req.headers["user-agent"];
        if (
            SKIP_USER_AGENTS.some((skipAgent) => userAgent.includes(skipAgent))
        ) {
            log(`Skipping ads for user agent: ${userAgent}`);
            return { shouldShowAd: false, markerFound: false };
        }
    }

    // Check for the test marker first - if found, immediately return true
    let markerFound = false;

    // Check for marker in content
    if (content && typeof content === "string") {
        markerFound = content.includes(TEST_ADS_MARKER);

        // If marker is found, force ad display regardless of other conditions
        if (markerFound) {
            log(
                'Test marker "p-ads" found in content, forcing ad display regardless of other conditions',
            );
            return { shouldShowAd: true, markerFound: true, forceAd: true };
        }
    }

    // Also check for marker in messages (important for streaming case)
    if (!markerFound && messages && messages.length > 0) {
        // Convert all message contents to strings for consistent checking
        const messageContents = messages.map((msg) => {
            if (!msg) return "";
            if (typeof msg.content === "string") return msg.content;
            if (msg.content) return JSON.stringify(msg.content);
            return "";
        });

        // Check if any message contains the marker
        markerFound = messageContents.some((content) =>
            content.includes(TEST_ADS_MARKER),
        );

        if (markerFound) {
            log(
                'Test marker "p-ads" found in messages, forcing ad display regardless of other conditions',
            );
            return { shouldShowAd: true, markerFound: true, forceAd: true };
        }
    }

    // User preference checks removed - ads disabled by default

    // Get request data for referrer check
    const requestData = getRequestData(req);

    // Special handling for bad domains in referrer
    if (
        requestData?.referrer &&
        requestData.referrer !== "unknown" &&
        BAD_DOMAINS.length > 0
    ) {
        const referrerLower = requestData.referrer.toLowerCase();

        // Check if referrer contains any bad domain
        const isBadDomain = BAD_DOMAINS.some((domain) =>
            referrerLower.includes(domain),
        );

        if (isBadDomain) {
            log(
                `Bad domain detected in referrer: ${requestData.referrer}, blocking ads`,
            );
            return {
                shouldShowAd: false,
                markerFound: false,
                isBadDomain: true,
            };
        }
    }

    // Skip ad processing if referrer is from roblox or image.pollinations.ai
    if (
        requestData?.referrer &&
        requestData.referrer !== "unknown" &&
        (requestData.referrer?.includes("v1_rblx_access") ||
            requestData.referrer?.includes("image.pollinations.ai"))
    ) {
        // log('Skipping ad processing due to referrer presence:', requestData.referrer);
        return { shouldShowAd: false, markerFound: false };
    }

    // Check if an ad already exists in the conversation history
    if (messages && messages.length > 0) {
        // Look for the redirect URL pattern in any of the messages
        const hasExistingAd = messages.some((msg) => {
            if (!msg.content || typeof msg.content !== "string") return false;
            return msg.content.includes(REDIRECT_BASE_URL);
        });

        if (hasExistingAd) {
            log(
                "Ad already exists in conversation history, skipping additional ad",
            );
            return {
                shouldShowAd: false,
                markerFound: false,
                adAlreadyExists: true,
            };
        }
    }

    // // Skip ad generation if content is too short
    // if (!content || typeof content !== 'string' || content.length < 100) {
    //     return { shouldShowAd: false, markerFound: false };
    // }
    if (!content) {
        log("No content found, using messages instead");
        content = messages?.map((msg) => msg.content).join("\n");
    }

    // Skip if content does not have markdown-like formatting, unless we're testing
    // This helps distinguish actual text responses from other formats like code
    if (
        REQUIRE_MARKDOWN &&
        !markdownRegex.test(content) &&
        !content.includes(TEST_ADS_MARKER)
    ) {
        log("Skipping ad processing due to lack of markdown formatting");
        return { shouldShowAd: false, markerFound: false };
    }

    // If marker is not found, use the default probability
    const effectiveProbability = markerFound
        ? 1.0 // 100% probability for marker found
        : REFERRAL_LINK_PROBABILITY;

    if (markerFound) {
        log('Test marker "p-ads" found, using 100% probability');
    }

    // Random check - only process based on the effective probability
    const shouldShowAd = Math.random() <= effectiveProbability;

    return { shouldShowAd, markerFound };
}
