import urldecode from 'urldecode';
import http from 'http';
import { parse } from 'url';
import PQueue from 'p-queue';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
import { handleMcpSSE, handleMcpMessage } from './mcpServer.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { createAndReturnImageCached } from './createAndReturnImages.js';
import { makeParamsSafe } from './makeParamsSafe.js';
import { cacheImage } from './cacheGeneratedImages.js';
import { normalizeAndTranslatePrompt } from './normalizeAndTranslatePrompt.js';
import { countJobs } from './generalImageQueue.js';
import { getIp } from './getIp.js';
import sleep from 'await-sleep';
import { MODELS } from './models.js';
import { countFluxJobs } from './availableServers.js';
import { handleRegisterEndpoint } from './availableServers.js';
import debug from 'debug';
import { createProgressTracker } from './progressBar.js';
import { extractToken, isValidToken } from './config/tokens.js';

const logError = debug('pollinations:error');
const logApi = debug('pollinations:api');
const logAuth = debug('pollinations:auth');

export let currentJobs = [];

const ipQueue = {};

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
    sendToAnalytics(req, "feedRequested", {});
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
    const { prompt, wasPimped } = await normalizeAndTranslatePrompt(originalPrompt, req, timingInfo, safeParams);
    progress.updateBar(requestId, 30, 'Prompt', 'Normalized');
    
    logApi("prompt", prompt);
    logApi("safeParams", safeParams);

    // Server selection and image generation
    progress.updateBar(requestId, 40, 'Server', 'Selecting optimal server...');
    progress.updateBar(requestId, 50, 'Generation', 'Preparing...');
    
    const { buffer, ...maturity } = await createAndReturnImageCached(prompt, safeParams, countFluxJobs(), originalPrompt, progress, requestId);

    progress.updateBar(requestId, 50, 'Generation', 'Starting generation');
    
    const concurrentRequests = countJobs(true);

    timingInfo.push({ step: 'Generation started.', timestamp: Date.now() });
    sendToFeedListeners({ ...safeParams, prompt: originalPrompt, ip, status: "generating", concurrentRequests, timingInfo: relativeTiming(timingInfo), referrer });

    progress.updateBar(requestId, 95, 'Finalizing', 'Processing complete');
    timingInfo.push({ step: 'Generation completed.', timestamp: Date.now() });
    sendToFeedListeners({ ...safeParams, prompt: originalPrompt, ip, status: "done", concurrentRequests, timingInfo: relativeTiming(timingInfo), referrer, maturity });

    progress.updateBar(requestId, 100, 'Complete', 'Generation successful');
    progress.stop();

    // Safety checks
    if (maturity.isChild && maturity.isMature) {
      logApi("isChild and isMature, delaying response by 15 seconds");
      progress.updateBar(requestId, 85, 'Safety', 'Additional review...');
      await sleep(3000);
    }
    progress.updateBar(requestId, 90, 'Safety', 'Check complete');

    timingInfo.push({ step: 'Image returned', timestamp: Date.now() });

    const imageURL = `https://image.pollinations.ai${req.url}`;

    // Cache and feed updates
    progress.updateBar(requestId, 95, 'Cache', 'Updating feed...');
    if (!safeParams.nofeed) {
      if (!(maturity.isChild && maturity.isMature)) {
        sendToFeedListeners({
          ...safeParams,
          concurrentRequests: countFluxJobs(),
          imageURL,
          prompt,
          ...maturity,
          maturity,
          timingInfo: relativeTiming(timingInfo),
          ip: getIp(req),
          status: "end_generating",
          referrer,
          wasPimped
        }, { saveAsLastState: true });
      }
    }
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

  sendToAnalytics(req, "imageRequested", { req, originalPrompt, safeParams, referrer });

  let timingInfo = [];  // Moved outside try block
  
  try {
    // Cache the generated image
    const bufferAndMaturity = await cacheImage(originalPrompt, safeParams, async () => {
      const ip = getIp(req);

      progress.updateBar(requestId, 10, 'Queueing', 'Request queued');
      timingInfo = [{ step: 'Request received and queued.', timestamp: Date.now() }];
      sendToFeedListeners({ ...safeParams, prompt: originalPrompt, ip: getIp(req), status: "queueing", concurrentRequests: countJobs(true), timingInfo: relativeTiming(timingInfo), referrer });

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

      // Check for valid token to bypass queue
      const token = extractToken(req);
      const hasValidToken = isValidToken(token);
      if (hasValidToken) {
        logAuth('Queue bypass granted for token:', token);
        progress.updateBar(requestId, 20, 'Priority', 'Token authenticated');
        
        // Skip queue for valid tokens
        timingInfo.push({ step: 'Token authenticated - bypassing queue', timestamp: Date.now() });
        return generateImage();
      }

      let queueExisted = false;
      if (!ipQueue[ip]) {
        ipQueue[ip] = new PQueue({ concurrency: 1, interval: 5000 });
      } else {
        queueExisted = true;
      }

      progress.updateBar(requestId, 20, 'Queueing', 'Checking cache');

      const result = await ipQueue[ip].add(async () => {
        if (queueExisted && countJobs() > 2) {
          const queueSize = ipQueue[ip].size + ipQueue[ip].pending;
          const queuePosition = Math.min(40, queueSize);
          const progressPercent = 30 + Math.floor((40 - queuePosition) / 40 * 20); // Maps position 40->30%, 0->50%

          progress.updateBar(requestId, progressPercent, 'Queueing', `Queue position: ${queuePosition}`);
          logApi("queueExisted", queueExisted, "for ip", ip, " sleeping a little", queueSize);
          
          if (queueSize >= 10) {
            progress.errorBar(requestId, 'Queue full');
            progress.stop();
            throw new Error("queue full");
          }

          progress.setQueued(queueSize);
          await sleep(500);
        }
        
        progress.setProcessing();
        return generateImage();
      });

      // if the queue is empty and none pending or processing we can delete the queue
      if (ipQueue[ip].size === 0 && ipQueue[ip].pending === 0) {
        delete ipQueue[ip];
      }

      return result;
    });


    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.write(bufferAndMaturity.buffer);
    res.end();

    // Send the same comprehensive metadata on success
    sendToAnalytics(req, "imageGenerated", { req, originalPrompt, safeParams, referrer, bufferAndMaturity, timingInfo });

  } catch (error) {
    logError("Error generating image:", error);
    progress.errorBar(requestId, error.message || 'Internal Server Error');
    progress.stop();
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message || 'An error occurred while processing your request',
      details: error.details || {},
      timingInfo,
      requestId,
      requestParameters: {
        prompt: originalPrompt,
        ...safeParams,
        referrer
      }
    }));
  }
};

// Modify the server creation to set CORS headers for all requests
const server = http.createServer((req, res) => {
  setCORSHeaders(res);

  const { pathname } = parse(req.url, true);

  // Handle MCP endpoints
  if (pathname === '/mcp/sse') {
    handleMcpSSE(req, res);
    return;
  }

  if (pathname === '/mcp/messages') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const message = JSON.parse(body);
        handleMcpMessage(message, res);
      } catch (error) {
        logError('Failed to parse MCP message:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON message' }));
      }
    });
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
