import 'dotenv/config'
import { countFluxJobs } from './availableServers.js';
import { countJobs } from './generalImageQueue.js';
import { getIp } from './getIp.js';
import fetch from 'node-fetch';
import debug from 'debug';

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;

const logError = debug('pollinations:error');
const logAnalytics = debug('pollinations:analytics');

/**
 * Creates base metadata object used across different analytics events
 * @param {Object} params - Parameters including req, originalPrompt, safeParams, referrer
 * @returns {Object} Base metadata object
 */
const createAnalyticsMetadata = (req, { originalPrompt, safeParams, referrer, timingInfo, bufferAndMaturity, error }) => {
    const metadata = {
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
    };
    logAnalytics('Analytics metadata created:', metadata);
    return metadata;
};

export async function sendToAnalytics(request, name, metadata) {
    try {
        logAnalytics('Sending analytics for event:', name);
        if (!request || !name) {
            logAnalytics('Missing required parameters. Aborting.');
            return;
        }
        
        const referrer = request.headers?.referer;
        const userAgent = request.headers?.['user-agent'];
        const language = request.headers?.['accept-language'];
        const clientIP = request.headers?.["x-real-ip"] || request.headers?.['x-forwarded-for'] || request?.connection?.remoteAddress;

        logAnalytics('Request details:', { referrer, userAgent, language, clientIP });

        const analyticsMetadata = createAnalyticsMetadata(request, metadata);
        const queryParams = request.query;

        logAnalytics('Query parameters:', queryParams);

        if (!measurementId || !apiSecret) {
            logAnalytics('Missing analytics credentials. Aborting.');
            return;
        }

        const payload = {
            client_id: clientIP || 'unknown',
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
        };

        logAnalytics('Sending payload to Google Analytics:', payload);

        const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        
        const responseText = await response.text();
        logAnalytics('Response from Google Analytics:', responseText);

        return responseText;
    } catch (error) {
        logError('Error sending analytics:', error);
        return;
    }
}