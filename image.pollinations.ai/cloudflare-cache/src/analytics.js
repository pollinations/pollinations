/**
 * Analytics functionality for Cloudflare Worker
 * This mirrors the sendToAnalytics functionality from the main image.pollinations.ai service
 */

import { getClientIp } from './ip-utils.js';

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
  
  const referrer = request.headers.get('referer') || 
                   request.headers.get('referrer') || 
                   '';
                   
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
    cacheStatus: params.cacheStatus || 'unknown',
  };
  
  console.log('Analytics metadata created:', metadata);
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
    console.log('Sending analytics for event:', name);
    if (!request || !name) {
      console.log('Missing required parameters. Aborting analytics.');
      return;
    }
    
    // Extract measurement ID and API secret from environment
    const measurementId = env.GA_MEASUREMENT_ID;
    const apiSecret = env.GA_API_SECRET;
    
    if (!measurementId || !apiSecret) {
      console.log('Missing analytics credentials. Aborting.');
      return;
    }
    
    // Get URL components
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Extract the prompt from URL path
    const originalPrompt = pathname.startsWith('/prompt/') 
      ? decodeURIComponent(pathname.split('/prompt/')[1]) 
      : '';
    
    // Get client information
    const referrer = request.headers.get('referer') || 
                     request.headers.get('referrer') || 
                     '';
    const userAgent = request.headers.get('user-agent') || '';
    const language = request.headers.get('accept-language') || '';
    const clientIP = getClientIp(request) || '::1';
    
    // Process query parameters into safeParams format
    const safeParams = {};
    for (const [key, value] of url.searchParams.entries()) {
      safeParams[key] = value;
    }
    
    // Create a base event params object with defaults
    const eventParams = {
      userAgent: userAgent,
      language: language,
      width: safeParams.width || params.width || 1024,
      height: safeParams.height || params.height || 1024,
      seed: safeParams.seed || params.seed || 42,
      model: safeParams.model || params.model || 'flux',
      nologo: params.nologo || false,
      negative_prompt: safeParams.negative_prompt || params.negative_prompt || 'worst quality, blurry',
      nofeed: params.nofeed || false,
      safe: params.safe || false,
      promptRaw: originalPrompt || params.promptRaw || '',
      concurrentRequests: params.concurrentRequests || 0,
      ip: clientIP,
      queueSize: params.queueSize || 0,
      totalProcessingTime: params.totalProcessingTime || 12,
      isChild: params.isChild || false
    };

    // Add all additional parameters from params that aren't already included
    // This allows flexible addition of new parameters while preserving the structure
    Object.keys(params).forEach(key => {
      // Only add if not already set and value is defined
      if (eventParams[key] === undefined && params[key] !== undefined) {
        eventParams[key] = params[key];
      }
    });
    
    // Build the payload in the exact same format as the curl command
    const payload = {
      client_id: clientIP,
      events: [{
        name: name,
        params: eventParams
      }]
    };
    
    console.log(`[Analytics] Sending ${name} event to Google Analytics:`, payload);
    
    // Send to Google Analytics
    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    const logDetails = {
      status: response.status,
      statusText: response.statusText,
      body: responseText || '(empty body)',
      headers: Object.fromEntries(response.headers.entries()),
      event: name,
      hasCredentials: {
        measurementId: !!measurementId,
        apiSecret: !!apiSecret
      }
    };
    
    if (!response.ok) {
      console.error(`[Analytics Error] Failed to send ${name} event:`, logDetails);
      
      // Try the validation endpoint to get more detailed error info
      try {
        const validationResponse = await fetch(`https://www.google-analytics.com/debug/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        const validationResult = await validationResponse.json();
        console.error(`[Analytics Debug] Validation response for failed ${name} event:`, validationResult);
      } catch (validationError) {
        console.error(`[Analytics Debug] Failed to get validation info for ${name}:`, validationError);
      }
    } else {
      console.log(`[Analytics Success] Sent ${name} event:`, logDetails);
    }
    
    return response;
  } catch (error) {
    console.error('[Analytics Error] Exception while sending analytics:', {
      error: error.message,
      stack: error.stack,
      event: name
    });
    return;
  }
}
