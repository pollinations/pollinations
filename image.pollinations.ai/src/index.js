import urldecode from 'urldecode';
import http from 'http';
import { parse } from 'url';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
import { createAndReturnImageCached } from './createAndReturnImages.js';
import { makeParamsSafe } from './makeParamsSafe.js';
import { cacheImage } from './cacheGeneratedImages.js';
import { normalizeAndTranslatePrompt } from './normalizeAndTranslatePrompt.js';
import { countJobs } from './generalImageQueue.js';
import sleep from 'await-sleep';
import { MODELS } from './models.js';
import { countFluxJobs } from './availableServers.js';
import { handleRegisterEndpoint } from './availableServers.js';
import debug from 'debug';
import { createProgressTracker } from './progressBar.js';
import fs from 'fs';
import path from 'path';

// Import shared utilities
import { enqueue } from '../../shared/ipQueue.js';
import { isValidToken, handleAuthentication, addAuthDebugHeaders, createAuthDebugResponse } from '../../shared/auth-utils.js';
import { extractToken, getIp } from '../../shared/extractFromRequest.js';

// Queue configuration for image service
const QUEUE_CONFIG = {
  interval: 10000, // 10 seconds between requests per IP
  cap: 1          // Max 1 concurrent request per IP
};

const logError = debug('pollinations:error');
const logApi = debug('pollinations:api');
const logAuth = debug('pollinations:auth');

export let currentJobs = [];

// In-memory store for tracking IP violations
const ipViolations = new Map();
const MAX_VIOLATIONS = 5;

// Check if an IP is blocked
const isIpBlocked = (ip) => {
  return (ipViolations.get(ip) || 0) >= MAX_VIOLATIONS;
};

// Increment violations for an IP
const incrementIpViolations = (ip) => {
  const currentViolations = ipViolations.get(ip) || 0;
  ipViolations.set(ip, currentViolations + 1);
  return currentViolations + 1;
};

/**
 * @function
 * @param {Object} res - The response object.
 */
const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Auth-Status, X-Auth-Reason, X-Debug-Token, X-Debug-Token-Source, X-Debug-Referrer, X-Debug-Legacy-Token-Match, X-Debug-Allowlist-Match, X-Debug-User-Id');
}

/** 
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<Object|boolean>}
 */
const preMiddleware = async function (pathname, req, res) {
  logApi("requestListener", req.url);

  if (pathname.startsWith("/feed")) {
    registerFeedListener(req, res);
    return false;
  }

  if (!pathname.startsWith("/prompt")) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'The requested endpoint was not found',
      path: pathname
    }));
    return false;
  }

  return true;
}

/**
 * @async
 * @function
 * @param {Object} params - The parameters object.
 * @returns {Promise<void>}
 */
const imageGen = async ({ req, timingInfo, originalPrompt, safeParams, referrer, progress, requestId }) => {
  const ip = getIp(req);
  
  // Check if IP is blocked
  if (isIpBlocked(ip)) {
    throw new Error(`Your IP ${ip} has been temporarily blocked due to multiple content violations`);
  }

  try {
    timingInfo.push({ step: 'Start processing', timestamp: Date.now() });
    
    // Prompt processing
    progress.updateBar(requestId, 20, 'Prompt', 'Normalizing...');
    const { prompt, wasPimped, wasTransformedForBadDomain } = await normalizeAndTranslatePrompt(originalPrompt, req, timingInfo, safeParams, referrer);
    progress.updateBar(requestId, 30, 'Prompt', 'Normalized');
    
    // For bad domains, log that we're using the transformed prompt
    if (wasTransformedForBadDomain) {
      logApi("prompt transformed for bad domain, using alternative:", prompt);
    }
    
    // Use the processed prompt for generation
    const generationPrompt = prompt;
    
    logApi("display prompt", prompt);
    logApi("generation prompt", generationPrompt);
    logApi("safeParams", safeParams);

    // Server selection and image generation
    progress.updateBar(requestId, 40, 'Server', 'Selecting optimal server...');
    progress.updateBar(requestId, 50, 'Generation', 'Preparing...');
    
    const authResult = await handleAuthentication(req, requestId, logAuth);
    
    // Create user info object for passing to generation functions
    const userInfo = authResult;
    
    // Pass the complete user info object instead of individual properties
    const { buffer, ...maturity } = await createAndReturnImageCached(generationPrompt, safeParams, countFluxJobs(), originalPrompt, progress, requestId, wasTransformedForBadDomain, userInfo);

    progress.updateBar(requestId, 50, 'Generation', 'Starting generation');

    progress.updateBar(requestId, 95, 'Finalizing', 'Processing complete');
    timingInfo.push({ step: 'Generation completed.', timestamp: Date.now() });

    progress.updateBar(requestId, 100, 'Complete', 'Generation successful');
    progress.stop();

    // Safety checks
    if (maturity.isChild && maturity.isMature) {
      logApi("isChild and isMature, delaying response by 15 seconds");
      progress.updateBar(requestId, 85, 'Safety', 'Additional review...');
      await sleep(5000);
    }
    progress.updateBar(requestId, 90, 'Safety', 'Check complete');

    timingInfo.push({ step: 'Image returned', timestamp: Date.now() });

    const imageURL = `https://image.pollinations.ai${req.url}`;

    // Cache and feed updates
    progress.updateBar(requestId, 95, 'Cache', 'Updating feed...');
    // if (!safeParams.nofeed) {
    //   if (!(maturity.isChild && maturity.isMature)) {
        // Create a clean object with consistent data types
        const feedData = {
          // Start with properly sanitized parameters
          ...safeParams,
          concurrentRequests: countFluxJobs(),
          imageURL,
          // Always use the display prompt which will be original prompt for bad domains
          prompt,
          // Extract only the specific properties we need from maturity, ensuring boolean types
          isChild: !!maturity.isChild,
          isMature: !!maturity.isMature,
          // Include maturity as a nested object for backward compatibility
          maturity,
          timingInfo: relativeTiming(timingInfo),
          // ip: getIp(req),
          status: "end_generating",
          referrer,
          // Use original wasPimped for normal domains, never for bad domains
          wasPimped,
          nsfw: !!(maturity.isChild || maturity.isMature),
          private: !!safeParams.nofeed,
          token: extractToken(req) && extractToken(req).slice(0, 2) + "..."
        };
        
        sendToFeedListeners(feedData, { saveAsLastState: true });
      // }
    // }
    progress.updateBar(requestId, 100, 'Cache', 'Updated');
    
    // Complete main progress
    progress.completeBar(requestId, 'Image generation complete');
    progress.stop();
    
    return { buffer, ...maturity };
  } catch (error) {
    // Check if this was a prohibited content error
    if (error.message === "Content is prohibited") {
      const violations = incrementIpViolations(ip);
      if (violations >= MAX_VIOLATIONS) {
        await sleep(10000);
        throw new Error(`Your IP ${ip} has been temporarily blocked due to multiple content violations`);
      }
    }
    // Handle errors gracefully in progress bars
    progress.errorBar(requestId, 'Generation failed');
    progress.stop();
    
    // Log detailed error information
    console.error('Image generation failed:', {
      error: error.message,
      stack: error.stack,
      requestId,
      prompt: originalPrompt,
      params: safeParams,
      referrer
    });
    
    throw error;
  }
};

/**
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 */
const checkCacheAndGenerate = async (req, res) => {
  let { pathname, query } = parse(req.url, true);

  const needsProcessing = await preMiddleware(pathname, req, res);

  if (!needsProcessing) return;

  const originalPrompt = urldecode(pathname.split("/prompt/")[1] || "random_prompt");
  const { ...safeParams } = makeParamsSafe(query);
  const referrer = query.headers?.referer || 
                  query.headers?.referrer || 
                  query.headers?.Referer || 
                  query.headers?.Referrer || 
                  req.headers?.referer || 
                  req.headers?.referrer || 
                  req.headers?.['referer'] || 
                  req.headers?.['referrer'] || 
                  req.headers?.origin;
  const requestId = Math.random().toString(36).substring(7);
  const progress = createProgressTracker().startRequest(requestId);
  progress.updateBar(requestId, 0, 'Starting', 'Request received');

  logApi("Request details:", { originalPrompt, safeParams, referrer });

  let timingInfo = [];  // Moved outside try block
  
  try {
    // Cache the generated image
    const bufferAndMaturity = await cacheImage(originalPrompt, safeParams, async () => {
      const ip = getIp(req);

      progress.updateBar(requestId, 10, 'Queueing', 'Request queued');
      timingInfo = [{ step: 'Request received and queued.', timestamp: Date.now() }];
      // sendToFeedListeners({ 
      //   ...safeParams, 
      //   prompt: originalPrompt, 
      //   ip: getIp(req), status: "queueing", concurrentRequests: countJobs(true), timingInfo: relativeTiming(timingInfo), referrer, token: extractToken(req) && extractToken(req).slice(0, 2) + "..." });

      // Check for authentication status to determine queue interval
      const authResult = await handleAuthentication(req, requestId, logAuth);
      // Use the new explicit authentication fields
      const hasValidToken = authResult.tokenAuth;
      
      // Pass authentication status to generateImage (hasReferrer will be checked there for gptimage)
      const generateImage = async () => {
        timingInfo.push({ step: 'Start generating job', timestamp: Date.now() });
        const result = await imageGen({ 
          req, 
          timingInfo, 
          originalPrompt, 
          safeParams, 
          referrer,
          progress,
          requestId 
        });
        timingInfo.push({ step: 'End generating job', timestamp: Date.now() });
        return result;
      };

      // Determine queue configuration based on token
      let queueConfig;
      if (hasValidToken) {
        // Token removes delay between requests (no interval)
        queueConfig = { interval: 0, cap: 1 };
        logAuth('Token authenticated - queue with no delay');
        progress.updateBar(requestId, 20, 'Authenticated', 'Token verified');
      } else {
        // Use default queue config with interval
        queueConfig = QUEUE_CONFIG;
        logAuth('Standard queue with delay (no token)');
      }

      // Use the shared queue utility - everyone goes through queue
      const result = await enqueue(req, async () => {
        // Update progress and process the image
        progress.setProcessing();
        return generateImage();
      }, { ...queueConfig, forceQueue: true, maxQueueSize: 5 });

      return result;
    });


    // Get authentication info using shared authentication utility
    const authResult = await handleAuthentication(req);
    const isAuthenticated = authResult.authenticated;
    
    // Add debug headers for authentication information
    const headers = {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Auth-Status': isAuthenticated ? 'authenticated' : 'unauthenticated'
    };
    
    // Add Content-Disposition header with sanitized filename
    if (originalPrompt) {
      // Create a filename from the prompt, limiting length and sanitizing
      const baseFilename = originalPrompt
        .slice(0, 100) // Limit to 100 characters
        .replace(/[^a-z0-9\s-]/gi, '') // Remove special characters except spaces and hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
        .toLowerCase();
      
      const filename = (baseFilename || 'generated-image') + '.jpg';
      headers['Content-Disposition'] = `inline; filename="${filename}"`;
    }
    
    // Add authentication debug headers using shared utility
    addAuthDebugHeaders(headers, authResult.debugInfo);
    
    res.writeHead(200, headers);
    res.write(bufferAndMaturity.buffer);
    res.end();

    logApi("Generation complete:", { originalPrompt, safeParams, referrer });

  } catch (error) {
    logError("Error generating image:", error);
    progress.errorBar(requestId, error.message || 'Internal Server Error');
    progress.stop();
    
    // Determine the appropriate status code (default to 500 if not specified)
    const statusCode = error.status || 500;
    const errorType = statusCode === 401 ? 'Unauthorized' : 
                     statusCode === 403 ? 'Forbidden' : 
                     statusCode === 429 ? 'Too Many Requests' : 'Internal Server Error';
    
    // Extract debug info from error if available
    const errorDebugInfo = error.details?.debugInfo;
    
    // Add debug headers for authentication information even in error responses
    const errorHeaders = {
      'Content-Type': 'application/json',
      'X-Error-Type': errorType
    };
    
    addAuthDebugHeaders(errorHeaders, errorDebugInfo);
    
    // Log the error response using debug
    logError('Error response:', {
      requestId,
      statusCode,
      errorType,
      message: error.message
    });
    
    res.writeHead(statusCode, errorHeaders);
    // Create a response object with error information
    const responseObj = {
      error: errorType,
      message: error.message,
      details: error.details,
      debug: createAuthDebugResponse(errorDebugInfo),
      timingInfo: relativeTiming(timingInfo),
      requestId,
      requestParameters: {
        prompt: originalPrompt,
        ...safeParams,
        referrer
      }
    };
    
    // Add queue info for 429 errors
    if (statusCode === 429 && error.queueInfo) {
      responseObj.queueInfo = error.queueInfo;
    }
    
    res.end(JSON.stringify(responseObj));
  }
};

// Modify the server creation to set CORS headers for all requests
const server = http.createServer((req, res) => {
  setCORSHeaders(res);

  const parsedUrl = parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/.well-known/acme-challenge/w7JbAPtwFN_ntyNHudgKYyaZ7qiesTl4LgFa4fBr1DuEL_Hyd4O3hdIviSop1S3G') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('w7JbAPtwFN_ntyNHudgKYyaZ7qiesTl4LgFa4fBr1DuEL_Hyd4O3hdIviSop1S3G.r54qAqCZSs4xyyeamMffaxyR1FWYVb5OvwUh8EcrhpI');
    return;
  }

  if (pathname === '/crossdomain.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`);
    return;
  }

  if (pathname === '/models') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(JSON.stringify(Object.keys(MODELS)));
    return;
  }

  if (pathname === '/register') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    handleRegisterEndpoint(req, res);
    return;
  }

  checkCacheAndGenerate(req, res);
});

// Set the timeout to 5 minutes (300,000 milliseconds)
server.setTimeout(300000, (socket) => {
  socket.destroy();
});

server.on('connection', (socket) => {
  socket.on('timeout', () => {
    socket.destroy();
  });

  socket.on('error', (error) => {
    socket.destroy();
  });
});

server.listen(process.env.PORT || 16384);

function relativeTiming(timingInfo) {
  return timingInfo.map(info => ({
    ...info,
    timestamp: info.timestamp - timingInfo[0].timestamp
  }));
}

/**
 * @function
 * @param {string} prompt - The original prompt.
 * @returns {string} - The sanitized file name.
 */
const sanitizeFileName = (prompt) => {
  return prompt.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}
