import urldecode from 'urldecode';
import http from 'http';
import { parse } from 'url';
import PQueue from 'p-queue';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { createAndReturnImageCached } from './createAndReturnImages.js';
import { makeParamsSafe } from './makeParamsSafe.js';
import { cacheImage } from './cacheGeneratedImages.js';
import { normalizeAndTranslatePrompt } from './normalizeAndTranslatePrompt.js';
import { generalImageQueue, countJobs, BATCH_SIZE } from './generalImageQueue.js';
import { getIp } from './getIp.js';
import sleep from 'await-sleep';
import { MODELS } from './models.js';
import { countFluxJobs } from './availableServers.js';
import { handleRegisterEndpoint } from './availableServers.js';

export let currentJobs = [];

const ipQueue = {};

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
  console.error("requestListener", req.url);

  if (pathname.startsWith("/feed")) {
    registerFeedListener(req, res);
    sendToAnalytics(req, "feedRequested", {});
    return false;
  }

  if (!pathname.startsWith("/prompt")) {
    res.end('404: Not Found');
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
const imageGen = async ({ req, timingInfo, originalPrompt, safeParams, referrer }) => {
  timingInfo.push({ step: 'Start processing', timestamp: Date.now() });
  const { prompt, wasPimped } = await normalizeAndTranslatePrompt(originalPrompt, req, timingInfo, safeParams);

  console.error("prompt", prompt);

  console.log("safeParams", safeParams);
  const bufferAndMaturity = await createAndReturnImageCached(prompt, safeParams, countFluxJobs(), originalPrompt);

  // if isChild and nsfw is true, delay the response by 10 seconds
  if (bufferAndMaturity.isChild && bufferAndMaturity.isMature) {
    console.log("isChild and isMature, delaying response by 15 seconds");
    await sleep(8000);
  }

  timingInfo.push({ step: 'Image returned', timestamp: Date.now() });

  const imageURL = `https://image.pollinations.ai${req.url}`;


  if (!safeParams.nofeed) {
    if (!(bufferAndMaturity.isChild && bufferAndMaturity.isMature)) {
      sendToFeedListeners({
        ...safeParams,
        concurrentRequests: countFluxJobs(),
        imageURL,
        prompt,
        originalPrompt,
        nsfw: bufferAndMaturity.isMature,
        isChild: bufferAndMaturity.isChild,
        timingInfo: relativeTiming(timingInfo),
        ip: getIp(req),
        status: "end_generating",
        referrer,
        wasPimped
      }, { saveAsLastState: true });
    }
  }

  return bufferAndMaturity;
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

  const referrer = query.referrer || req.headers.referer || req.headers.referrer || req.headers.origin;

  sendToAnalytics(req, "imageRequested", { req, originalPrompt, safeParams, referrer });

  try {
    let timingInfo = [];
    // Cache the generated image
    const bufferAndMaturity = await cacheImage(originalPrompt, safeParams, async () => {
      const ip = getIp(req);

      timingInfo = [{ step: 'Request received and queued.', timestamp: Date.now() }];
      // sendToFeedListeners({ ...safeParams, prompt: originalPrompt, ip, status: "queueing", concurrentRequests: countJobs(true), timingInfo: relativeTiming(timingInfo), referrer });

      let queueExisted = false;
      if (!ipQueue[ip]) {
        ipQueue[ip] = new PQueue({ concurrency: 1 });
      } else {
        queueExisted = true;
      }

      const result = await ipQueue[ip].add(async () => {
        if (queueExisted && countJobs() > 2) {
          const queueSize = ipQueue[ip].size + ipQueue[ip].pending;

          console.log("queueExisted", queueExisted, "for ip", ip, " sleeping a little", queueSize);
          if (queueSize >= 40) {
            throw new Error("queue full");
          }

          await sleep(1000 * queueSize);
        }
        timingInfo.push({ step: 'Start generating job', timestamp: Date.now() });
        const bufferAndMaturity = await generalImageQueue.add(async () => {
          return await imageGen({ req, timingInfo, originalPrompt, safeParams, referrer });
        });
        timingInfo.push({ step: 'End generating job', timestamp: Date.now() });

        return bufferAndMaturity;
      });

      // if the queue is empty and none pending or processing we can delete the queue
      if (ipQueue[ip].size === 0 && ipQueue[ip].pending === 0) {
        delete ipQueue[ip];
      }

      return result;
    });

    const sanitizedFileName = sanitizeFileName(originalPrompt) + '.png';

    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.write(bufferAndMaturity.buffer);
    res.end();

    // Send the same comprehensive metadata on success
    sendToAnalytics(req, "imageGenerated", { req, originalPrompt, safeParams, referrer, bufferAndMaturity, timingInfo });

  } catch (error) {
    console.error("error", error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`500: Internal Server Error - ${error.message}`);

    // Enhanced error analytics with the same base metadata
    sendToAnalytics(req, "imageGenerationError", { req, originalPrompt, safeParams, referrer, error });
  }
};

// Modify the server creation to set CORS headers for all requests
const server = http.createServer((req, res) => {
  setCORSHeaders(res);

  const { pathname } = parse(req.url, true);

  if (pathname === '/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.keys(MODELS)));
    return;
  }

  if (pathname === '/register') {
    handleRegisterEndpoint(req, res);
    return;
  }

  checkCacheAndGenerate(req, res);
});

// Set the timeout to 5 minutes (300,000 milliseconds)
// server.setTimeout(300000, (socket) => {
//   console.log('Request timed out.');
//   // console.log(`Request details:`, socket);
//   socket.end('HTTP/1.1 408 Request Timeout\r\n\r\n');
// });

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
