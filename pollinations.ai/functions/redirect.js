// Netlify function to handle redirects with analytics
import { incrementUserMetric } from "../../shared/userMetrics.js";

// Import redirect mapping and affiliate data from the consolidated affiliates.js file
import { redirectMapping, affiliatesData } from "../../shared/affiliates.js";

// Use the redirectMapping directly as it's already in the correct format
const REFERRAL_LINKS = redirectMapping;

/**
 * Sanitize target ID to handle common formatting issues
 * @param {string} targetId - The raw target ID from the URL
 * @returns {string} - Sanitized target ID
 */
function sanitizeTargetId(targetId) {
    if (!targetId) return "";

    // Remove any trailing slashes
    let sanitized = targetId.replace(/\/+$/, "");

    // Remove any query parameters
    sanitized = sanitized.split("?")[0];

    // Remove any spaces
    sanitized = sanitized.trim();

    // Handle double slashes that might appear in malformed URLs
    // e.g., if the URL was /redirect//kofi instead of /redirect/kofi
    if (sanitized.startsWith("/")) {
        sanitized = sanitized.substring(1);
    }

    console.log(`Sanitized target ID: '${targetId}' -> '${sanitized}'`);
    return sanitized;
}

/**
 * Send analytics event to Google Analytics
 * @param {string} eventName - Name of the event
 * @param {object} metadata - Event metadata
 * @param {object} request - Request object
 * @returns {Promise} - Analytics response
 */
async function sendAnalytics(eventName, metadata, request) {
    try {
        const measurementId = process.env.GA_MEASUREMENT_ID;
        const apiSecret = process.env.GA_API_SECRET;

        if (!measurementId || !apiSecret) {
            console.log("Missing analytics credentials:", {
                hasMeasurementId: !!measurementId,
                hasApiSecret: !!apiSecret,
            });
            return;
        }

        // Extract client information
        const headers = request.headers || {};
        const referrer = headers.referer || headers.referrer || "";
        const userAgent = headers["user-agent"] || "";
        const clientIP =
            headers["x-real-ip"] ||
            headers["x-forwarded-for"] ||
            headers["client-ip"] ||
            "::1";
        // Extract country code from headers
        const userCountry =
            headers["cf-ipcountry"] || headers["x-geo-country"] || "unknown";

        // Find affiliate name
        const affiliateId = metadata.referralId || "";
        const affiliate = affiliatesData.find((a) => a.id === affiliateId);
        const affiliateName = affiliate ? affiliate.name : "unknown";

        // Prepare analytics payload - following GA4 requirements
        const payload = {
            client_id:
                clientIP.replace(/[^a-zA-Z0-9]/g, "").substring(0, 20) ||
                "anonymous",
            events: [
                {
                    name: eventName,
                    params: {
                        // GA4 requires snake_case for parameter names
                        referral_id: metadata.referralId || "",
                        target_url: metadata.targetUrl || "",
                        source: metadata.source || "",
                        referrer: referrer || "",
                        user_agent: userAgent.substring(0, 100) || "",
                        timestamp: Date.now().toString(),
                        debug_mode: 1,
                        engagement_time_msec: 1, // Standard for server-side events
                        affiliate_id: affiliateId,
                        affiliate_name: affiliateName,
                        country: userCountry,
                    },
                },
            ],
        };

        console.log(
            `Sending analytics event: ${eventName}`,
            JSON.stringify(payload, null, 2),
        );

        // Send to Google Analytics
        const response = await fetch(
            `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            },
        );

        const responseText = await response.text();
        console.log("Analytics response:", {
            status: response.status,
            statusText: response.statusText,
            body: responseText || "(empty response)",
            headers: Object.fromEntries(response.headers),
        });

        return response;
    } catch (error) {
        console.error("Error sending analytics:", error);
    }
}

export const handler = async function (event, context) {
    console.log("Redirect function called with event:", {
        path: event.path,
        httpMethod: event.httpMethod,
        headers: event.headers,
        queryStringParameters: event.queryStringParameters,
    });

    // Get the target ID from the path
    const path = event.path || "";
    const pathSegments = path.split("/");
    const rawTargetId = pathSegments[pathSegments.length - 1];

    // Sanitize the target ID to handle common formatting issues
    const targetId = sanitizeTargetId(rawTargetId);

    // Get URL from query parameters or use the mapped URL
    const params = event.queryStringParameters || {};
    const url = params.url || REFERRAL_LINKS[targetId];

    // If no URL is found for this ID, return an error
    if (!url) {
        return {
            statusCode: 404,
            body: JSON.stringify({
                error: "Redirect target not found",
                message: `No redirect URL found for ID: ${targetId}`,
            }),
        };
    }

    console.log(`Redirect requested for: ${targetId} to ${url}`);

    try {
        // Send analytics event
        await sendAnalytics(
            "ad_clicked",
            {
                referralId: targetId,
                targetUrl: url,
                source: "referral",
            },
            event,
        );

        // Track per-user affiliate click metrics if user ID is provided
        const userId =
            event.queryStringParameters && event.queryStringParameters.user_id;
        if (userId) {
            // DISABLED: Metrics updates causing DB contention (GitHub Issue #3258)
            // incrementUserMetric(userId, "affiliate_clicks");
        } else {
            console.log(
                "No user_id found in query parameters. Skipping per-user affiliate_clicks increment.",
            );
        }

        // Return redirect response
        return {
            statusCode: 302,
            headers: {
                Location: url,
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
            body: "Redirecting...",
        };
    } catch (error) {
        console.error("Redirect error:", error);

        // If analytics fails, still redirect the user
        return {
            statusCode: 302,
            headers: {
                Location: url,
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
            body: "Redirecting...",
        };
    }
};
