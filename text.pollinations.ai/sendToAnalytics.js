import 'dotenv/config';
import crypto from 'crypto';
import debug from 'debug';
import fetch from 'node-fetch';

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;

const logError = debug('pollinations:error');
const logAnalytics = debug('pollinations:analytics');

function generateClientId(request) {
    const clientIP = request.headers?.["x-real-ip"] || 
                    request.headers?.['x-forwarded-for'] || 
                    request?.connection?.remoteAddress || 
                    'unknown';
    
    // Create a consistent hash of the IP address
    return crypto
        .createHash('sha256')
        .update(clientIP + (request.headers?.['user-agent'] || ''))
        .digest('hex')
        .slice(0, 32); // GA4 client_id should not be too long
}

function validateEventName(name) {
    // GA4 event name requirements
    return name.length <= 40 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name);
}

export async function sendToAnalytics(request, name, metadata) {
    try {
        if (!request || !name) {
            logError('Missing required parameters');
            return;
        }
        
        if (!measurementId || !apiSecret) {
            logError('Missing analytics credentials');
            return;
        }

        if (!validateEventName(name)) {
            logError('Invalid event name:', name);
            return;
        }

        const clientId = generateClientId(request);
        const referrer = request.headers?.referer || 
                        request.body?.referrer || 
                        request.body?.referer || 
                        request.query?.referrer || 
                        request.query?.referer;
                        
        const userAgent = request.headers?.['user-agent'];
        const language = request.headers?.['accept-language'];
        const queryParams = request.query;

        const analyticsData = {
            client_id: clientId,
            events: [{
                name: name,
                params: {
                    referrer,
                    userAgent,
                    language,
                    queryParams,
                    page_location: request.originalUrl,
                    ...metadata
                }
            }]
        };

        logAnalytics('Sending analytics payload:', JSON.stringify(analyticsData, null, 2));

        const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': userAgent || 'Pollinations-Server/1.0'
            },
            body: JSON.stringify(analyticsData)
        });

        const responseText = await response.text();
        logAnalytics('Analytics response status:', response.status);
        logAnalytics('Analytics response body:', responseText);

        if (!response.ok) {
            logError('Analytics request failed:', response.status, responseText);
            if (response.status === 400) {
                logError('Request body:', JSON.stringify(analyticsData, null, 2));
            }
        }

        return response.ok;
    } catch (error) {
        logError('Error sending analytics:', error);
        return false;
    }
}
