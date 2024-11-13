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
export const createBaseMetadata = ({ req, originalPrompt, safeParams, referrer }) => ({
  ...safeParams,
  promptRaw: originalPrompt,
  concurrentRequests: countFluxJobs(),
  referrer,
  ip: getIp(req),
  queueSize: countJobs(true)
});

/**
 * Creates comprehensive image metadata for analytics
 * @param {Object} params - Parameters for image metadata
 * @returns {Object} Complete image metadata
 */
export const createImageMetadata = ({ req, originalPrompt, safeParams, referrer, prompt, wasPimped, imageURL, bufferAndMaturity, timingInfo }) => ({
  ...createBaseMetadata({ req, originalPrompt, safeParams, referrer }),
  promptProcessed: prompt,
  wasPimped,
  imageURL,
  nsfw: bufferAndMaturity.isMature,
  isChild: bufferAndMaturity.isChild,
  timing: relativeTiming(timingInfo),
  totalProcessingTime: timingInfo[timingInfo.length - 1].timestamp - timingInfo[0].timestamp
});

/**
 * Creates error metadata for analytics
 * @param {Object} baseMetadata - Base metadata object
 * @param {Error} error - Error object
 * @returns {Object} Error metadata
 */
export const createErrorMetadata = (baseMetadata, error) => ({
  ...baseMetadata,
  error: error.message,
  errorStack: error.stack,
  errorType: error.name,
  timeOfError: new Date().toISOString()
});

export async function sendToAnalytics(request, name, metadata) {
    const referrer = request.headers.referer;
    const userAgent = request.headers['user-agent'];
    const language = request.headers['accept-language'];
    const clientIP = request.headers["x-real-ip"] || request.headers['x-forwarded-for'] || request.connection.remoteAddress;

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
                    ...metadata,
                }
            }]
        })
    });
    const responseText = await response.text();
}