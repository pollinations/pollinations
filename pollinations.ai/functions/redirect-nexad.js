// Netlify function to handle nex.ad redirects with analytics
import fetch from 'node-fetch';

/**
 * Extract event ID from the path
 * @param {string} path - The request path
 * @returns {string} - Event ID or empty string
 */
function extractEventId(path) {
  // Path format: /redirect-nexad/{eventId}
  const pathSegments = path.split('/');
  const eventId = pathSegments[pathSegments.length - 1];
  
  if (!eventId || eventId === 'redirect-nexad') {
    return '';
  }
  
  console.log(`Extracted event ID: ${eventId}`);
  return eventId;
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
      console.log('Missing analytics credentials:', { 
        hasMeasurementId: !!measurementId, 
        hasApiSecret: !!apiSecret 
      });
      return;
    }

    // Extract client information
    const headers = request.headers || {};
    const referrer = headers.referer || headers.referrer || '';
    const userAgent = headers['user-agent'] || '';
    const clientIP = headers['x-real-ip'] || 
                    headers['x-forwarded-for'] || 
                    headers['client-ip'] || 
                    '::1';
    const userCountry = headers['cf-ipcountry'] || 
                        headers['x-geo-country'] || 
                        'unknown';

    // Prepare analytics payload - following GA4 requirements
    const payload = {
      client_id: clientIP.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) || 'anonymous',
      events: [{
        name: eventName,
        params: {
          // GA4 requires snake_case for parameter names
          event_id: metadata.eventId || '',
          target_url: metadata.targetUrl || '',
          source: 'nexad',
          referrer: referrer || '',
          user_agent: userAgent.substring(0, 100) || '',
          timestamp: Date.now().toString(),
          debug_mode: 1,
          engagement_time_msec: 1, // Standard for server-side events
          country: userCountry,
          session_id: Date.now().toString(), // GA4 automatically tracks session_id
        }
      }]
    };

    console.log(`Sending analytics event: ${eventName}`, JSON.stringify(payload, null, 2));

    // Send to Google Analytics
    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const responseText = await response.text();
    console.log('Analytics response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText || '(empty response)',
      headers: Object.fromEntries(response.headers)
    });

    return response;
  } catch (error) {
    console.error('Error sending analytics:', error);
  }
}

export const handler = async function(event, context) {
  console.log('Nex.ad redirect function called with event:', {
    path: event.path,
    httpMethod: event.httpMethod,
    headers: event.headers,
    queryStringParameters: event.queryStringParameters
  });

  // Extract event ID from path
  const eventId = extractEventId(event.path);
  
  if (!eventId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing event ID',
        message: 'No event ID provided in the URL path'
      })
    };
  }
  
  // Construct the nex.ad click tracking URL
  const targetUrl = `https://api-prod.nex-ad.com/ad/event/${eventId}`;
  
  console.log(`Redirecting to nex.ad: ${eventId} -> ${targetUrl}`);

  // Check for user_id and increment ad_clicks if present
  const userId = event.queryStringParameters && event.queryStringParameters.user_id;
  if (userId) {
    console.log(`User ID found: ${userId}. Attempting to increment ad_clicks.`);
    const adminApiKey = process.env.POLLINATIONS_ADMIN_API_KEY;
    if (adminApiKey) {
      const metricsUrl = `https://auth.pollinations.ai/admin/metrics?user_id=${encodeURIComponent(userId)}`;
      const metricsPayload = {
        increment: {
          key: "ad_clicks",
          by: 1
        }
      };

      // Fire and forget - do not await, so it doesn't block the redirect
      fetch(metricsUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metricsPayload)
      })
      .then(async response => {
        const responseBodyText = await response.text(); // Read as text to handle non-JSON or empty responses
        try {
          // Attempt to parse as JSON only if content-type suggests it, or log raw text
          const responseBody = response.headers.get('content-type')?.includes('application/json') && responseBodyText ? JSON.parse(responseBodyText) : responseBodyText;
          if (!response.ok) {
            console.error(`Failed to increment ad_clicks for user ${userId}. Status: ${response.status}`, responseBody);
          } else {
            console.log(`Successfully triggered ad_clicks increment for user ${userId}. Response:`, responseBody);
          }
        } catch (e) {
            console.error(`Error parsing metrics response for user ${userId} (Status: ${response.status}):`, e, `Raw Body: ${responseBodyText}`);
        }
      })
      .catch(error => {
        console.error(`Network error or other issue incrementing ad_clicks for user ${userId}:`, error);
      });
    } else {
      console.warn('POLLINATIONS_ADMIN_API_KEY not found in environment. Cannot increment ad_clicks.');
    }
  }
  
  try {
    // Send analytics with metadata
    await sendAnalytics('nexad_clicked', {
      eventId: eventId,
      targetUrl: targetUrl
    }, event);
    
    // Return redirect response
    return {
      statusCode: 302,
      headers: {
        'Location': targetUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: 'Redirecting to sponsor...'
    };
  } catch (error) {
    console.error('Redirect error:', error);
    
    // If analytics fails, still redirect the user
    return {
      statusCode: 302,
      headers: {
        'Location': targetUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: 'Redirecting to sponsor...'
    };
  }
};
