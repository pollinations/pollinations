import 'dotenv/config';
import { getIp } from './server.js';

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;

/**
 * Creates base metadata object used across different analytics events
 * @param {Object} params - Parameters including req, messages, model
 * @returns {Object} Base metadata object
 */
const createAnalyticsMetadata = (req, { messages, model, options }) => ({
  model,
  messageCount: messages?.length,
  options,
  ip: getIp(req),
});

export async function sendToAnalytics(request, name, metadata) {
    try {
        if (!request || !name) return; // Early return if required params are missing
        
        const referrer = request.headers?.referer;
        const userAgent = request.headers?.['user-agent'];
        const language = request.headers?.['accept-language'];
        const clientIP = request.headers?.["x-real-ip"] || request.headers?.['x-forwarded-for'] || request?.connection?.remoteAddress;

        const analyticsMetadata = createAnalyticsMetadata(request, metadata);
        const queryParams = request.query;

        if (!measurementId || !apiSecret) return; // Early return if analytics credentials are missing

        const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: "POST",
            body: JSON.stringify({
                client_id: clientIP || 'unknown',
                "events": [{
                    "name": name,
                    "params": {
                        referrer,
                        userAgent,
                        language,
                        queryParams,
                        ...analyticsMetadata
                    }
                }]
            })
        });

        if (!response.ok) {
            console.error('Failed to send analytics:', await response.text());
        }
    } catch (error) {
        console.error('Error sending analytics:', error);
    }
}
