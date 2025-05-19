/**
 * Analytics functionality for Cloudflare Worker
 * This mirrors the sendToAnalytics functionality from the main image.pollinations.ai service
 * Following the "thin proxy" design principle - minimal processing, direct forwarding
 */

import { getClientIp } from "./ip-utils.js";

// Define maximum string length for truncation
const MAX_STRING_LENGTH = 150;

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

    // Process query parameters into safeParams format
    const safeParams = {};
    for (const [key, value] of url.searchParams.entries()) {
      safeParams[key] = value;
    }

    // Get client information - check URL params first, then headers
    const referrer = 
      request.headers.get("referer") || 
      request.headers.get("referrer") || 
      "";
    const userAgent = request.headers.get("user-agent") || "";
    const language = request.headers.get("accept-language") || "";
    const clientIP = getClientIp(request) || "::1";

    // Combine all parameter sources with priority
    const combinedParams = {
      referrer,
      ...safeParams,
      ...params,
      userAgent,
      language,
      ip: clientIP,
    };

    // Process parameters - only truncate strings
    const processedParams = processParameters(combinedParams);

    // Build the payload
    const payload = {
      client_id: clientIP,
      events: [
        {
          name: name,
          params: processedParams
        },
      ],
    };

    console.log(`[Analytics] Sending ${name} event to Google Analytics:`, payload);

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

    console.log(`[Analytics] Response for ${name} event:`, response);

    return response;
  } catch (error) {
    console.error("Error in sendToAnalytics:", error);
    return undefined;
  }
}

/**
 * Process parameters - only truncate strings, pass everything else through
 * @param {Object} params - Parameters to process
 * @returns {Object} Processed parameters
 */
function processParameters(params) {
  const result = {};
  
  // Process all parameters
  for (const [key, value] of Object.entries(params)) {
    // Skip undefined/null values
    if (value === undefined || value === null) {
      continue;
    }
    
    // Handle nested safeParams object
    if (key === 'safeParams' && typeof value === 'object') {
      // Extract properties from safeParams and add them directly
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (nestedValue !== undefined && nestedValue !== null) {
          // Don't process this key again if it already exists at the top level
          if (!(nestedKey in params)) {
            result[nestedKey] = processValue(nestedValue);
          }
        }
      }
      continue;
    }
    
    // Process regular parameters - just pass through with string truncation
    result[key] = processValue(value);
  }
  
  // Set defaults for important parameters if they're missing
  if (!('model' in result)) result.model = 'flux';
  if (!('width' in result)) result.width = 1024;
  if (!('height' in result)) result.height = 1024;
  if (!('seed' in result)) result.seed = 42;
  if (!('negative_prompt' in result)) result.negative_prompt = 'worst quality, blurry';
  if (!('cacheStatus' in result)) result.cacheStatus = 'unknown';
  
  return result;
}

/**
 * Process a single value - only truncate strings, pass everything else through
 * @param {any} value - Parameter value
 * @returns {any} Processed value
 */
function processValue(value) {
  // Only truncate strings, pass everything else through as-is
  if (typeof value === 'string') {
    return value.substring(0, MAX_STRING_LENGTH);
  }
  
  // Return all other values as-is
  return value;
}
