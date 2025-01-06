import 'dotenv/config';
import crypto from 'crypto';
import dotenv from 'dotenv';
import debug from 'debug';

dotenv.config();

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;

const logError = debug('pollinations:error');
const logAnalytics = debug('pollinations:analytics');

function getClientId(request) {
    const clientIP = request.headers?.["x-real-ip"] || 
                    request.headers?.['x-forwarded-for'] || 
                    request?.connection?.remoteAddress;
    return clientIP || 'unknown';
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

        const clientId = getClientId(request);
        const referrer = request.headers?.referer;
        const userAgent = request.headers?.['user-agent'];
        const language = request.headers?.['accept-language'];

        const analyticsData = {
            client_id: clientId,
            events: [{
                name: name,
                params: {
                    referrer,
                    userAgent,
                    language,
                    ...metadata
                }
            }]
        };

        logAnalytics('Sending analytics payload:', JSON.stringify(analyticsData, null, 2));
        logAnalytics('Using measurement ID:', measurementId);

        const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: "POST",
            body: JSON.stringify(analyticsData)
        });

        const responseText = await response.text();
        logAnalytics('Analytics response status:', response.status);
        logAnalytics('Analytics response body:', responseText);

        if (!response.ok) {
            logError('Analytics request failed:', response.status, responseText);
        }

        return responseText;
    } catch (error) {
        logError('Error sending analytics:', error);
        return;
    }
}
