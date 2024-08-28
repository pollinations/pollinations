import urldecode from 'urldecode';
import http from 'http';
import { parse } from 'url';
import PQueue from 'p-queue';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { createAndReturnImageCached } from './createAndReturnImages.js';
import { makeParamsSafe } from './makeParamsSafe.js';
import { getCachedImage, cacheImage, isImageCached } from './cacheGeneratedImages.js';
import { normalizeAndTranslatePrompt } from './normalizeAndTranslatePrompt.js';
import { generalImageQueue, countJobs, BATCH_SIZE } from './generalImageQueue.js';
import { getIp } from './getIp.js';
import sleep from 'await-sleep';
import { readFileSync } from 'fs';
export let currentJobs = [];

const queueFullImages = [readFileSync("./assets/queuefull1.png"), readFileSync("./assets/queuefull2.png"), readFileSync("./assets/queuefull3.png")];

// this is used to create a queue per ip address
const BOT_IP = "150.136.112.172";

const ricUrl = "https://github.com/pollinations/rickroll-against-ddos/raw/main/Rick%20Astley%20-%20Never%20Gonna%20Give%20You%20Up%20(Remastered%204K%2060fps,AI)-(720p60).mp4";

const ipQueue = {};


const rickrollCount = {}; // Count of times each IP was rickrolled
const rickrollData = {}; // Amount of data each IP has downloaded as a rickroll in GB


const handleRickroll = (ip, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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


/** 
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<Object|boolean>}
 */
const preMiddleware = async function (pathname, req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
const imageGen = async ({ req, timingInfo, originalPrompt, safeParams }) => {
  timingInfo.push({ step: 'Start processing', timestamp: Date.now() });
  const prompt = await normalizeAndTranslatePrompt(originalPrompt, req, timingInfo, safeParams);

  console.error("prompt", prompt);

  console.log("safeParams", safeParams);
  const bufferAndMaturity = await createAndReturnImageCached(prompt, safeParams, countJobs());

  // if isChild and nsfw is true, delay the response by 10 seconds
  if (bufferAndMaturity.isChild && bufferAndMaturity.isMature) {
    console.log("isChild and isMature, delaying response by 15 seconds");
    await sleep(15000);
  }

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

};

/**
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 */
const checkCacheAndGenerate = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  let { pathname, query } = parse(req.url, true);

  const needsProcessing = await preMiddleware(pathname, req, res);

  if (!needsProcessing) return;

  const originalPrompt = pathname.split("/prompt/")[1] || "random prompt";

  const safeParams = makeParamsSafe(query);

  const analyticsMetadata = { promptRaw: originalPrompt, concurrentRequests: countJobs(), model: safeParams["model"] };
  sendToAnalytics(req, "imageRequested", analyticsMetadata);


  // Cache the generated image
  const buffer = await cacheImage(originalPrompt, safeParams, async () => {

    const ip = getIp(req);

    const timingInfo = [{ step: 'Request received and queued.', timestamp: Date.now() }];
    sendToFeedListeners({ ...safeParams, prompt: originalPrompt, ip, status: "queueing", concurrentRequests: countJobs(true), timingInfo: relativeTiming(timingInfo) });

    let queueExisted = false;
    if (!ipQueue[ip]) {
      ipQueue[ip] = new PQueue({ concurrency: 1 });
    } else {
      queueExisted = true;
    }

    // // Check if the job count of an individual IP queue is larger than 8
    // if (ipQueue[ip].size + ipQueue[ip].pending > 8) {
    //   const randomImage = queueFullImages[Math.floor(Math.random() * queueFullImages.length)];
    //   res.writeHead(200, { 'Content-Type': 'image/png' });
    //   res.write(randomImage);
    //   res.end();
    //   return;
    // }

    const result = await ipQueue[ip].add(async () => {
      if (queueExisted && countJobs() > 2) {
        const queueSize = ipQueue[ip].size + ipQueue[ip].pending;

        console.log("queueExisted", queueExisted, "for ip", ip, " sleeping a little", queueSize);
        if (queueSize >= 8) {
          const randomImage = queueFullImages[Math.floor(Math.random() * queueFullImages.length)];
          return randomImage;
        }

        await sleep(1000 * queueSize);
      }
      timingInfo.push({ step: 'Start generating job', timestamp: Date.now() });
      const buffer = await generalImageQueue.add(async () => {
        return await imageGen({ req, timingInfo, originalPrompt, safeParams });
      });
      timingInfo.push({ step: 'End generating job', timestamp: Date.now() });

      return buffer;
    });

    // if the queue is empty and none pending or processing we can delete the queue
    if (ipQueue[ip].size === 0 && ipQueue[ip].pending === 0) {
      delete ipQueue[ip];
    }

    return result;
  });

  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  res.write(buffer);
  res.end();



  sendToAnalytics(req, "imageGenerated", analyticsMetadata);

};

const server = http.createServer(checkCacheAndGenerate);
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

