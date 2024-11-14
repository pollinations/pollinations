import 'dotenv/config'
import { countFluxJobs } from './availableServers.js';
import { countJobs } from './generalImageQueue.js';
import { getIp } from './getIp.js';

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;

/**
 * Creates base metadata object used across different analytics events
 * @param {Object} params - Parameters including req, originalPrompt, safeParams, referrer
 * @returns {Object} Base metadata object
 */
const createAnalyticsMetadata = (req, { originalPrompt, safeParams, referrer, timingInfo, bufferAndMaturity, error }) => ({
  ...safeParams,
  promptRaw: originalPrompt,
  concurrentRequests: countFluxJobs(),
  referrer,
  ip: getIp(req),
  queueSize: countJobs(true),
  totalProcessingTime: Math.floor(((timingInfo?.[timingInfo?.length - 1]?.timestamp - timingInfo?.[0]?.timestamp) || 0) / 1000),
  nsfw: bufferAndMaturity?.isMature,
  isChild: bufferAndMaturity?.isChild,
  error: error?.message || error,
});


export async function sendToAnalytics(request, name, metadata) {
    const referrer = request.headers.referer;
    const userAgent = request.headers['user-agent'];
    const language = request.headers['accept-language'];
    const clientIP = request.headers["x-real-ip"] || request.headers['x-forwarded-for'] || request.connection.remoteAddress;

    const analyticsMetadata = createAnalyticsMetadata(request, metadata);
    // Extracting query parameters
    const queryParams = request.query;

    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
        method: "POST",
        body: JSON.stringify({
            client_id: clientIP,
            "events": [{
                "name": name,
                "params": {
                    referrer,
                    userAgent,
                    language,
                    queryParams,
                    ...analyticsMetadata,
                }
            }]
        })
    });
    const responseText = await response.text();
}