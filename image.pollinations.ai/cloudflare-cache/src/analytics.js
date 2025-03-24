/**
 * Analytics functionality for Cloudflare Worker
 * This mirrors the sendToAnalytics functionality from the main image.pollinations.ai service
 */

import { getClientIp } from "./ip-utils.js";

/**
 * Creates base metadata object used across different analytics events
 * @param {Request} request - The original request
 * @param {Object} params - Additional parameters
 * @returns {Object} Base metadata object
 */
const createAnalyticsMetadata = (request, params = {}) => {
  const { originalPrompt, safeParams, error } = params;

  // Get client information
  const clientIP = getClientIp(request);

  const referrer =
    request.headers.get("referer") || request.headers.get("referrer") || "";

  // Extract query parameters
  const url = new URL(request.url);
  const queryParams = {};
  for (const [key, value] of url.searchParams.entries()) {
    queryParams[key] = value;
  }

  // Build metadata object similar to the original
  const metadata = {
    ...safeParams,
    promptRaw: originalPrompt,
    referrer,
    ip: clientIP,
    queryParams,
    error: error?.message || error,
    // Cache-specific information
    cacheStatus: params.cacheStatus || "unknown",
  };

  console.log("Analytics metadata created:", metadata);
  return metadata;
};

/**
 * Sends analytics event to Google Analytics
 * @param {Request} request - The original request
 * @param {string} name - Event name
 * @param {Object} params - Additional parameters
 * @param {Object} env - Environment variables
 * @returns {Promise<Response|undefined>} Response from Google Analytics
 */
export async function sendToAnalytics(request, name, params = {}, env) {
  try {
    console.log("Sending analytics for event:", name);
    if (!request || !name) {
      console.log("Missing required parameters. Aborting analytics.");
      return;
    }

    // Extract measurement ID and API secret from environment
    const measurementId = env.GA_MEASUREMENT_ID;
    const apiSecret = env.GA_API_SECRET;

    if (!measurementId || !apiSecret) {
      console.log("Missing analytics credentials. Aborting.");
      return;
    }

    // Get URL components
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Extract the prompt from URL path
    const originalPrompt = pathname.startsWith("/prompt/")
      ? decodeURIComponent(pathname.split("/prompt/")[1])
      : "";

    // Get client information
    const referrer =
      request.headers.get("referer") || request.headers.get("referrer") || "";
    const userAgent = request.headers.get("user-agent") || "";
    const language = request.headers.get("accept-language") || "";
    const clientIP = getClientIp(request) || "::1";

    // Process query parameters into safeParams format
    const safeParams = {};
    for (const [key, value] of url.searchParams.entries()) {
      safeParams[key] = value;
    }

    // Extract specific parameters from query params or params object
    const width = safeParams.width || params.width || 1024;
    const height = safeParams.height || params.height || 1024;
    const seed = safeParams.seed || params.seed || 42;
    const model = safeParams.model || params.model || "flux";
    const negative_prompt =
      safeParams.negative_prompt ||
      params.negative_prompt ||
      "worst quality, blurry";
      
    // Extract cache status with enhanced handling for nested structures
    const cacheStatus = safeParams.cacheStatus || 
                       (params.safeParams && params.safeParams.cacheStatus) || 
                       params.cacheStatus || 
                       "unknown";

    // Build the payload in the exact same format as the curl command
    const payload = {
      client_id: clientIP,
      events: [
        {
          name: name,
          params: {
            userAgent: (userAgent || "").substring(0, 100),
            language: (language || "").substring(0, 100),
            width: Number(width),
            height: Number(height),
            seed: Number(seed),
            model: (model || "flux").substring(0, 100),
            nologo: (
              safeParams.nologo !== undefined
                ? safeParams.nologo
                : params.nologo
            )
              ? "true"
              : "false",
            negative_prompt: (negative_prompt || "").substring(0, 100),
            nofeed: (
              safeParams.nofeed !== undefined
                ? safeParams.nofeed
                : params.nofeed
            )
              ? "true"
              : "false",
            safe: (
              safeParams.safe !== undefined ? safeParams.safe : params.safe
            )
              ? "true"
              : "false",
            promptRaw: (originalPrompt || params.promptRaw || "").substring(
              0,
              100
            ),
            concurrentRequests:
              safeParams.concurrentRequests !== undefined
                ? Number(safeParams.concurrentRequests)
                : params.concurrentRequests || 0,
            ip: (clientIP || "").substring(0, 100),
            totalProcessingTime:
              safeParams.totalProcessingTime !== undefined
                ? Number(safeParams.totalProcessingTime)
                : params.totalProcessingTime || 0,
            isChild: (
              safeParams.isChild !== undefined
                ? safeParams.isChild
                : params.isChild
            )
              ? "true"
              : "false",
            referrer: (referrer || "").substring(0, 100),
            cacheStatus: cacheStatus,
          },
        },
      ],
    };

    // Added detailed logging for cacheStatus debugging
    console.log(`[ANALYTICS.JS DEBUG] Event: ${name}, Cache Status from safeParams: ${safeParams.cacheStatus || 'not set'}`);
    console.log(`[ANALYTICS.JS DEBUG] Cache Status from params.safeParams: ${params.safeParams?.cacheStatus || 'not set'}`);
    console.log(`[ANALYTICS.JS DEBUG] Direct cache status from params: ${params.cacheStatus || 'not set'}`);
    console.log(`[ANALYTICS.JS DEBUG] Final cache status in payload: ${payload.events[0].params.cacheStatus}`);

    console.log(
      `[Analytics] Sending ${name} event to Google Analytics:`,
      payload
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
      }
    );

    const responseText = await response.text();
    const logDetails = {
      status: response.status,
      statusText: response.statusText,
      body: responseText || "(empty body)",
      headers: Object.fromEntries(response.headers.entries()),
      event: name,
      hasCredentials: {
        measurementId: !!measurementId,
        apiSecret: !!apiSecret,
      },
    };

    if (!response.ok) {
      console.error(
        `[Analytics Error] Failed to send ${name} event:`,
        logDetails
      );

      // Try the validation endpoint to get more detailed error info
      try {
        const validationResponse = await fetch(
          `https://www.google-analytics.com/debug/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        const validationResult = await validationResponse.json();
        console.error(
          `[Analytics Debug] Validation response for failed ${name} event:`,
          validationResult
        );
      } catch (validationError) {
        console.error(
          `[Analytics Debug] Failed to get validation info for ${name}:`,
          validationError
        );
      }
    } else {
      console.log(`[Analytics Success] Sent ${name} event:`, logDetails);
    }

    return response;
  } catch (error) {
    console.error("[Analytics Error] Exception while sending analytics:", {
      error: error.message,
      stack: error.stack,
      event: name,
    });
    return;
  }
}
