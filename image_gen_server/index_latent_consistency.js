import urldecode from 'urldecode';
import http from 'http';
import { parse } from 'url';
import PQueue from 'p-queue';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { createAndReturnImageCached, makeParamsSafe } from './createAndReturnImages.js';
import { getCachedImage, cacheImage, isImageCached } from './cacheGeneratedImages.js';
import { normalizeAndTranslatePrompt } from './normalizeAndTranslatePrompt.js';
import { generalImageQueue, countJobs, BATCH_SIZE } from './generalImageQueue.js';
import { getIp } from './getIp.js';
export let currentJobs = [];

// this is used to create a queue per ip address
const BOT_IP = "150.136.112.172";

const ricUrl = "https://github.com/pollinations/rickroll-against-ddos/raw/main/Rick%20Astley%20-%20Never%20Gonna%20Give%20You%20Up%20(Remastered%204K%2060fps,AI)-(720p60).mp4";

const ipQueue = {};


const rickrollCount = {}; // Count of times each IP was rickrolled
const rickrollData = {}; // Amount of data each IP has downloaded as a rickroll in GB


const handleRickroll = (ip, res) => {
  console.log("\x1b[36m%s\x1b[0m", "🚀🚀🚀 Redirecting IP: " + ip + " to rickroll 🎵🎵🎵");
  rickrollCount[ip] += 1; // Increment rickroll count for this IP
  rickrollData[ip] += 0.07; // Add 72.1MB (0.0721GB) to rickroll data for this IP
  console.log(`[queue] IP: ${ip} has been rickrolled ${rickrollCount[ip]} times, downloading ${rickrollData[ip].toFixed(2)}GB of rickroll data.`);
  res.writeHead(302, {
    'Location': ricUrl
  });
  res.end();
};


// Function to log the top IP addresses by number of images in the queue
const logTopIPsByQueueSize = (ipQueue) => {
  const sortedIPs = Object.entries(ipQueue)
    .map(([ip, queue]) => ({ ip, queueSize: queue.size + queue.pending }))
    .sort((a, b) => b.queueSize - a.queueSize)
    .slice(0, 5); // Get top 5 IPs

  console.log("Top IPs by Queue Size:");
  sortedIPs.forEach((ipInfo, index) => {
    console.log(`${index + 1}. IP: ${ipInfo.ip}, Queue Size: ${ipInfo.queueSize}`);
  });
};


let memCache = {};

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

const handleCache = async (memCacheKey, originalPrompt, safeParams, req, res) => {

  if (memCache[memCacheKey]) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' })
    const memCacheContent = await memCache[memCacheKey];
    console.log("memCacheContent", memCacheContent);
    res.write(memCacheContent);
    res.end();
    return true;
  }

  if (isImageCached(originalPrompt, safeParams)) {
    const cachedImage = await getCachedImage(originalPrompt, safeParams);
    res.writeHead(200, { 'Content-Type': 'image/jpeg' })
    res.write(cachedImage);
    res.end();
    console.error("image cached, returning from cache", originalPrompt, safeParams);
    return true;
  }

  return false;

};
/**
 * @async
 * @function
 * @param {Object} params - The parameters object.
 * @returns {Promise<void>}
 */
const imageGen = async ({ req, res, timingInfo, originalPrompt, safeParams }) => {
  timingInfo.push({ step: 'Start processing', timestamp: Date.now() });
  const prompt = await normalizeAndTranslatePrompt(originalPrompt, req, timingInfo, safeParams);

  console.error("prompt", prompt);

  try {
    console.log("safeParams", safeParams);
    const bufferAndMaturity = await createAndReturnImageCached(prompt, safeParams, countJobs());

    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.write(bufferAndMaturity.buffer);
    res.end();

    timingInfo.push({ step: 'Image returned', timestamp: Date.now() });

    const imageURL = `https://image.pollinations.ai${req.url}`;

    if (!safeParams.nofeed) {
      const concurrentRequests = countJobs();
      const ip = getIp(req);
      sendToFeedListeners({
        ...safeParams,
        concurrentRequests,
        imageURL,
        prompt,
        originalPrompt: urldecode(originalPrompt),
        nsfw: bufferAndMaturity.isMature,
        isChild: bufferAndMaturity.isChild,
        timingInfo: relativeTiming(timingInfo),
        ip,
        status: "end_generating",
      }, { saveAsLastState: true });
    }

    // Return the generated image buffer
    return bufferAndMaturity.buffer;

  } catch (error) {
    console.error("error", error);
    // print stack trace
    console.error(error.stack);
    res.writeHead(500);
    res.end('500: Internal Server Error');
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

  const originalPrompt = pathname.split("/prompt/")[1];

  const safeParams = makeParamsSafe(query);

  const cacheKey = `${originalPrompt}-${JSON.stringify(safeParams)}`;

  const isCached = await handleCache(cacheKey, originalPrompt, safeParams, req, res);

  if (isCached) return;

  const ip = getIp(req);

  const timingInfo = [{ step: 'Request received and queued.', timestamp: Date.now() }];
  sendToFeedListeners({ ...safeParams, prompt: originalPrompt, ip, status: "queueing", concurrentRequests: countJobs(true), timingInfo: relativeTiming(timingInfo) });

  const analyticsMetadata = { promptRaw: originalPrompt, concurrentRequests: countJobs(), model: safeParams["model"] };
  sendToAnalytics(req, "imageRequested", analyticsMetadata);

  if (!ipQueue[ip]) {
    ipQueue[ip] = new PQueue({ concurrency: 1 });
  }

  memCache[cacheKey] = ipQueue[ip].add(async () => {
    timingInfo.push({ step: 'Start generating job', timestamp: Date.now() });
    const buffer = await generalImageQueue.add(async () => {
      return await imageGen({ req, res, timingInfo, memCacheKey: cacheKey, originalPrompt, safeParams });
    });
    timingInfo.push({ step: 'End generating job', timestamp: Date.now() });

    // Cache the generated image
    cacheImage(originalPrompt, safeParams, buffer);
    return buffer;
  });

  await memCache[cacheKey];

  sendToAnalytics(req, "imageGenerated", analyticsMetadata);

};

const server = http.createServer(checkCacheAndGenerate);

// Set the timeout to 5 minutes (300,000 milliseconds)
server.setTimeout(300000, (socket) => {
  console.log('Request timed out.');
  socket.end('HTTP/1.1 408 Request Timeout\r\n\r\n');
});

server.listen(process.env.PORT || 16384);

function relativeTiming(timingInfo) {
  return timingInfo.map(info => ({
    ...info,
    timestamp: info.timestamp - timingInfo[0].timestamp
  }));
}

