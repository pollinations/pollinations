import debug from "debug";

const log = debug("pollinations:nexad:formatter");
const errorLog = debug("pollinations:nexad:formatter:error");

/**
 * Extract event ID from nex.ad URL
 * @param {string} url - nex.ad URL
 * @returns {string|null} - Event ID or null
 */
function _extractNexAdEventId(url) {
    // Match URLs like https://api-prod.nex-ad.com/ad/event/iGRSbWGo
    const match = url.match(/api-prod\.nex-ad\.com\/ad\/event\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

/**
 * Replace nex.ad URLs with Pollinations redirect URLs
 * @param {string} content - Content containing nex.ad URLs
 * @returns {string} - Content with replaced URLs
 */
function replaceNexAdUrls(content, userId) {
    // Replace nex.ad event URLs with our redirect URLs
    return content.replace(
        /https:\/\/api-prod\.nex-ad\.com\/ad\/event\/([a-zA-Z0-9]+)/g,
        (match, eventId) => {
            let redirectUrl = `https://pollinations.ai/redirect-nexad/${eventId}`;
            if (userId) {
                redirectUrl += `?user_id=${encodeURIComponent(userId)}`;
            }
            log(`Replacing nex.ad URL: ${match} -> ${redirectUrl}`);
            return redirectUrl;
        },
    );
}

/**
 * Convert HTML to Markdown
 * @param {string} html - HTML content
 * @returns {string} - Markdown content
 */
function htmlToMarkdown(html, userId) {
    if (!html) return "";

    // Simple HTML to Markdown conversion
    let markdown = html;

    // Convert links
    markdown = markdown.replace(
        /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi,
        "[$2]($1)",
    );

    // Remove any remaining HTML tags
    markdown = markdown.replace(/<[^>]+>/g, "");

    // Clean up whitespace
    markdown = markdown.trim();

    // Replace nex.ad URLs with our redirect URLs
    markdown = replaceNexAdUrls(markdown, userId);

    return markdown;
}

/**
 * Format nex.ad response into our standard ad format
 * @param {Object} nexAdData - Response from nex.ad API
 * @returns {string|null} - Formatted ad text or null
 */
export function formatNexAd(nexAdData, userId) {
    try {
        if (!nexAdData?.ads?.[0]) {
            log("No ads in nex.ad response");
            return null;
        }

        const ad = nexAdData.ads[0];

        // Extract ad content
        let adContent = "";

        if (ad.native_ad?.description) {
            adContent = ad.native_ad.description;
        } else if (ad.text_ad?.text) {
            adContent = ad.text_ad.text;
        } else {
            errorLog("Unknown ad format:", ad);
            return null;
        }

        // Convert HTML to Markdown
        const markdownContent = htmlToMarkdown(adContent, userId);

        if (!markdownContent) {
            errorLog("Empty ad content after conversion");
            return null;
        }

        // Format with our standard ad prefix
        const formattedAd = `\n\n---\n\n**Sponsor**\n${markdownContent}`;

        log("Formatted ad:", formattedAd);

        return formattedAd;
    } catch (error) {
        errorLog("Error formatting nex.ad response:", error);
        return null;
    }
}

/**
 * Extract tracking data from nex.ad response
 * @param {Object} nexAdData - Response from nex.ad API
 * @returns {Object} - Tracking URLs and metadata
 */
export function extractTrackingData(nexAdData) {
    try {
        if (!nexAdData?.ads?.[0]) {
            return null;
        }

        const ad = nexAdData.ads[0];

        return {
            tid: nexAdData.tid,
            campaign_id: ad.campaign_id,
            ad_id: ad.ad_id,
            ad_type: ad.ad_type,
            click_through_url: ad.click_through,
            impression_urls: ad.tracking_urls?.impression_urls || [],
            click_urls: ad.tracking_urls?.click_urls || [],
        };
    } catch (error) {
        errorLog("Error extracting tracking data:", error);
        return null;
    }
}

/**
 * Track ad impression by calling nex.ad tracking URLs
 * @param {Object} trackingData - Tracking data from extractTrackingData
 * @returns {Promise<void>}
 */
export async function trackImpression(trackingData) {
    if (!trackingData?.impression_urls?.length) {
        return;
    }

    try {
        // Fire all impression tracking URLs
        const trackingPromises = trackingData.impression_urls.map((url) =>
            fetch(url, { method: "GET" }).catch((err) =>
                errorLog("Impression tracking error:", err),
            ),
        );

        await Promise.all(trackingPromises);
        log("Tracked ad impression for tid:", trackingData.tid);
    } catch (error) {
        errorLog("Error tracking impression:", error);
    }
}
