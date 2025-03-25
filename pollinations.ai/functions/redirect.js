// Netlify function to handle redirects with analytics
const fetch = require('node-fetch');

// Define referral link mappings
const REFERRAL_LINKS = {
  lovemy: 'https://lovemy.ai/?linkId=lp_060145&sourceId=pollinations&tenantId=lovemyai',
  hentai: 'https://aihentaichat.com/?linkId=lp_617069&sourceId=pollinations&tenantId=lovemyai'
};

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

    // Prepare analytics payload
    const payload = {
      client_id: clientIP,
      events: [{
        name: eventName,
        params: {
          ...metadata,
          referrer,
          userAgent: userAgent.substring(0, 100),
          ip: clientIP,
          timestamp: new Date().toISOString()
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

exports.handler = async function(event, context) {
  console.log('Redirect function called with event:', {
    path: event.path,
    httpMethod: event.httpMethod,
    headers: event.headers,
    queryStringParameters: event.queryStringParameters
  });

  // Get the target ID from the path
  const path = event.path || '';
  const pathSegments = path.split('/');
  const targetId = pathSegments[pathSegments.length - 1];
  
  // Get URL from query parameters or use the mapped URL
  const params = event.queryStringParameters || {};
  const url = params.url || REFERRAL_LINKS[targetId] || 'https://pollinations.ai';
  
  console.log(`Redirect requested for: ${targetId} to ${url}`);
  
  try {
    // Send analytics event
    await sendAnalytics('referral_click', {
      referralId: targetId,
      targetUrl: url,
      source: 'nsfw_referral'
    }, event);
    
    // Return redirect response
    return {
      statusCode: 302,
      headers: {
        'Location': url,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: 'Redirecting...'
    };
  } catch (error) {
    console.error('Redirect error:', error);
    
    // If analytics fails, still redirect the user
    return {
      statusCode: 302,
      headers: {
        'Location': url,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: 'Redirecting...'
    };
  }
};
