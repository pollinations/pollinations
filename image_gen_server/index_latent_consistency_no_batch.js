import http from 'http';

// import memoize from 'lodash.memoize';
// import memoize from 'lodash.memoize';
import { parse } from 'url';

import PQueue from 'p-queue';

import sleep from 'await-sleep';

import { registerFeedListener } from './feedListeners.js';

import { sendToAnalytics } from './sendToAnalytics.js';

import { getXLImage } from './sdxl.js';

// spawn
import { spawn } from 'child_process';
import { createAndReturnImageCached } from './createAndReturnImageCached_no_batch.js';
import { getCachedImage, isImageCached } from './cacheGeneratedImages.js';
import { readFileSync } from 'fs';

// load queueFull images from "./queuefull1.png", "./queuefull2.png" or "./queuefull3.png"

const queueFullImages = [readFileSync("./queuefull1.png"), readFileSync("./queuefull2.png"), readFileSync("./queuefull3.png")];

export const generalImageQueue = new PQueue({concurrency: 1});

const activeQueues = new Map();
const DELAY_PER_REQUEST = 2000; // 2 seconds delay per extra request

// Array to store timestamps of image requests
let imageRequestTimestamps = [];

const requestListener = async function (req, res) {
  let { pathname, query } = parse(req.url, true);

  // Handle /feed requests
  if (pathname.startsWith("/feed")) {
    registerFeedListener(req, res);
    sendToAnalytics(req, "feedRequested", {});
    return;
  }
  
  // Only process requests that start with "/prompt"
  if (!pathname.startsWith("/prompt")) {
    res.end('404: Not Found');
    return;
  }

  // if the generalImageQueue has more than 20 items return one of the queue full images

  if (generalImageQueue.size > 20) {
    const queueFullImage = queueFullImages[generalImageQueue.size % queueFullImages.length];
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.write(queueFullImage);
    res.end();
    return;
  }

  const ip = req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const promptRaw = pathname.split("/prompt/")[1];
  const extraParams = {...query};

  // Check if the image is already cached
  if (await isImageCached(promptRaw, extraParams)) {
    const cachedImage = await getCachedImage(promptRaw, extraParams); // Function to retrieve the cached image
    res.write(cachedImage);
    res.end();
    return;
  }

  // Create or retrieve the queue for the IP
  if (!activeQueues.has(ip)) {
    activeQueues.set(ip, new PQueue({ concurrency: 1 }));
  }
  const queue = activeQueues.get(ip);

  queue.add(async () => {
    // Add a delay if there were other tasks in the queue
    if (queue.size > 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_PER_REQUEST));
    }
    generalImageQueue.add(async () => {
    try {
      // Now pass extraParams to your image processing function
      const bufferWithLegend = await createAndReturnImageCached(promptRaw, extraParams, generalImageQueue.size, res, req);
      res.write(bufferWithLegend);
      res.end();
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end('500: Internal Server Error');
    }})
  });

  // Add the current timestamp to the imageRequestTimestamps array
  imageRequestTimestamps.push(Date.now());
  // Filter out timestamps older than 60 seconds
  imageRequestTimestamps = imageRequestTimestamps.filter(timestamp => Date.now() - timestamp < 60000);
  // Log the number of image requests in the last minute
  console.log(`Image requests in the last minute: ${imageRequestTimestamps.length}`);
}


const server = http.createServer(requestListener);
server.listen(16384);


