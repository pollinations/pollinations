import urldecode from 'urldecode';
import http from 'http';
import { parse } from 'url';
import PQueue from 'p-queue';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { createAndReturnImageCached, makeParamsSafe } from './createAndReturnImages.js';
import { getCachedImage, cacheImage, isImageCached } from './cacheGeneratedImages.js';
import awaitSleep from 'await-sleep';
import { splitEvery } from 'ramda';
import { readFileSync, writeFileSync } from 'fs';
import Table from 'cli-table3'; // Importing cli-table3 for table formatting
import { sanitizeString, translateIfNecessary } from './translateIfNecessary.js';
import { getClosesPrompt } from './promptEmbedding.js';

const BATCH_SIZE = 8; // Number of requests per batch

const concurrency = 2; // Number of concurrent requests per bucket key

const generalImageQueue = new PQueue({ concurrency });
let currentBatches = [];

const queueFullImages = [readFileSync("./queuefull1.png"), readFileSync("./queuefull2.png"), readFileSync("./queuefull3.png")];

let requestTimestamps = []; // Array to store timestamps of image requests
let imageReturnTimestamps = []; // Array to store timestamps of returned images

// this is used to create a queue per ip address


// function that wraps an async request handler and keeps count of the number of requests from the same ip address
// if an ip address already has a request in the queue, it will delay until the request is processed
// the delay increases by 1 second for each request in the queue
const queuePerIp = (handler) => {
  const ipQueue = {};
  const rickrollCount = {}; // Count of times each IP was rickrolled
  const rickrollData = {}; // Amount of data each IP has downloaded as a rickroll in GB
  return async (req, res) => {
    const ip = getIp(req);
    if (!ipQueue[ip]) {
      ipQueue[ip] = new PQueue({ concurrency: 1 });
      rickrollCount[ip] = 0; // Initialize rickroll count for this IP
      rickrollData[ip] = 0; // Initialize rickroll data for this IP
    } else {
      console.log("ip already in queue", ip, "queue length", ipQueue[ip].size, "pending", ipQueue[ip].pending);
      // if queue size > 10 then redirect to 
      const ricUurl = "https://github.com/pollinations/rickroll-against-ddos/raw/main/Rick%20Astley%20-%20Never%20Gonna%20Give%20You%20Up%20(Remastered%204K%2060fps,AI)-(720p60).mp4";
      if (ipQueue[ip].size > 10) {
        console.log("\x1b[36m%s\x1b[0m", "🚀🚀🚀 Redirecting IP: " + ip + " to rickroll 🎵🎵🎵");
        rickrollCount[ip] += 1; // Increment rickroll count for this IP
        rickrollData[ip] += 0.07; // Add 72.1MB (0.0721GB) to rickroll data for this IP
        console.log(`IP: ${ip} has been rickrolled ${rickrollCount[ip]} times, downloading ${rickrollData[ip].toFixed(2)}GB of rickroll data.`);
        res.writeHead(302, {
          'Location': ricUurl
        });
        res.end();
        return;
      }
    }
    const queueSize = ipQueue[ip].size;
    await ipQueue[ip].add(async () => {
      await handler(req, res);
      console.log("sleeping for",  queueSize * 1000, "ms")
      await awaitSleep(queueSize * 500); // Delay increases by 1 second for each request in the queue
    });
  }
}
// Initialize an object to track images requested and returned per bucket key
let bucketKeyStats = {};

const processChunk = async (chunk, bucketKey, extraParams) => {
  try {
    const buffersWithLegend = await createAndReturnImageCached(chunk.map(job => job.prompt), extraParams, {concurrentRequests: countJobs(true)});
    chunk.forEach((job, index) => {
      job.timingInfo.push({ step: 'Start processing chunk', timestamp: Date.now() });
      job.callback(null, buffersWithLegend[index], job.timingInfo);
      cacheImage(job.originalPrompt, extraParams, buffersWithLegend[index].buffer);
      // Increment the count of images returned for this bucket key
      bucketKeyStats[bucketKey].returned++;
      job.timingInfo.push({ step: 'End processing chunk', timestamp: Date.now() });
    });
  } catch (e) {
    console.error(e);
    chunk.forEach(job => job.callback(e, null, job.timingInfo)); // Error callback
  }
};

const processBatches = async () => {
  const processingPromises = [];
  while (generalImageQueue.size + generalImageQueue.pending < concurrency) {
    let batchIndex = currentBatches.findIndex(batch => batch.extraParams.model === 'turbo');
    if (batchIndex === -1) {
      // If no turbo model found, use the original logic
      batchIndex = Math.random() < 0.8 ? 0 : 1;
    }
    const batch = currentBatches[batchIndex % currentBatches.length];
    if (batch) {
      const { bucketKey, jobs, extraParams } = batch;
      const chunks = splitEvery(BATCH_SIZE, jobs);
      const chunk = chunks.shift();
      if (chunk) {
        batch.jobs = batch.jobs.slice(chunk.length);
        if (batch.jobs.length === 0) {
          currentBatches.splice(batchIndex, 1);
        }
        processingPromises.push(generalImageQueue.add(() => processChunk(chunk, bucketKey, extraParams)));
      }
    }
    if (processingPromises.length >= concurrency) {
      await Promise.all(processingPromises);
      processingPromises.length = 0; // Clear the array
    }
    await awaitSleep(100);
  }
  if (processingPromises.length > 0) {
    await Promise.all(processingPromises); // Ensure all remaining promises are settled
  }
}

let jobCounts = [];

const countJobs = (average = false) => {
  const currentCount = currentBatches.reduce((acc, batch) => acc + batch.jobs.length, 0);
  if (average) {
    jobCounts.push(currentCount);
    if (jobCounts.length > 5) {
      jobCounts.shift();
    }
    return Math.round(jobCounts.reduce((a, b) => a + b) / jobCounts.length);
  }
  return currentCount;
}

let memCache = {};

const requestListener = queuePerIp(async function (req, res) {
  


  console.error("requestListener", req.url);
  let { pathname, query } = parse(req.url, true);

  if (pathname.startsWith("/feed")) {
    registerFeedListener(req, res);
    sendToAnalytics(req, "feedRequested", {});
    return;
  }

  if (!pathname.startsWith("/prompt")) {
    res.end('404: Not Found');
    return;
  }

  const originalPrompt = pathname.split("/prompt/")[1];

  if (!originalPrompt) {
    res.writeHead(404);
    res.end('404: Not Found');
    return;
  }

  const extraParams = {...query};

  const safeParams = makeParamsSafe(extraParams);

  const bucketKey = ["model","width","height"]
    .filter(key => safeParams[key])
    .map(key => safeParams[key])
    .join('-');

  const concurrentRequests = countJobs();
  const analyticsMetadata = { promptRaw: originalPrompt, concurrentRequests, bucketKey, model: safeParams["model"] };
  sendToAnalytics(req, "imageRequested", analyticsMetadata);

  const memCacheKey = `${bucketKey}-${originalPrompt}-${JSON.stringify(extraParams)}`;

  // Initialize the stats for this bucket key if they don't exist yet
  if (!bucketKeyStats[bucketKey]) {
    bucketKeyStats[bucketKey] = { requested: 0, returned: 0 };
  }

  if (memCache[memCacheKey]) {
    res.write(await memCache[memCacheKey]);
    res.end();
    imageReturnTimestamps.push(Date.now());
    imageReturnTimestamps = imageReturnTimestamps.filter(timestamp => Date.now() - timestamp < 60000);
    return;
  }

  if (await isImageCached(originalPrompt, extraParams)) {
    const cachedImage = await getCachedImage(originalPrompt, extraParams);
    res.write(cachedImage);
    res.end();
    console.error("image cached, returning from cache", originalPrompt, extraParams);
    return;
  }

  bucketKeyStats[bucketKey].requested++;

  if (countJobs() > 100) {
    const queueFullImage = queueFullImages[Math.floor(Math.random() * queueFullImages.length)];
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.write(queueFullImage);
    res.end();
    return;
  }


  const timingInfo = [{ step: 'Request received', timestamp: Date.now() }];

  memCache[memCacheKey] = new Promise(async (resolve, reject) => {
      timingInfo.push({ step: 'Start processing', timestamp: Date.now() });
      const prompt = await normalizeAndTranslatePrompt(originalPrompt, req, timingInfo, extraParams["enhance"]);

      if (!prompt) {
        res.writeHead(500);
        res.end('500: Internal Server Error');
        return;
      }
      console.error("prompt",prompt, "bucketKey", bucketKey);

      const callback = (error, bufferAndMaturity, timingInfo) => {
        if (error) {
          res.writeHead(500);
          res.end('500: Internal Server Error');
          reject(error);
          return;
        }
        res.write(bufferAndMaturity.buffer);
        resolve(bufferAndMaturity.buffer);
        res.end();
        imageReturnTimestamps.push(Date.now());
        imageReturnTimestamps = imageReturnTimestamps.filter(timestamp => Date.now() - timestamp < 60000);
        
        timingInfo.push({ step: 'Image returned', timestamp: Date.now() });

        const requestReceivedTime = timingInfo[0].timestamp;
        timingInfo = timingInfo.map(info => ({
          ...info,
          timestamp: info.timestamp - requestReceivedTime
        }));
        console.log('Timing Info:', timingInfo);

        const imageURL = `https://image.pollinations.ai${req.url}`;
        sendToFeedListeners({ concurrentRequests, imageURL, prompt, originalPrompt:urldecode(originalPrompt), nsfw: bufferAndMaturity.isMature, isChild: bufferAndMaturity.isChild, model: extraParams["model"], timingInfo }, { saveAsLastState: true });
        sendToAnalytics(req, "imageGenerated", analyticsMetadata);
      };

      const existingBatch = currentBatches.find(batch => batch.bucketKey === bucketKey);

      if (!existingBatch) {
        currentBatches.push({ bucketKey, jobs: [{prompt, callback, originalPrompt, timingInfo}], extraParams });
        return;
      }

      const existingJob = existingBatch.jobs.find(job => job.prompt === prompt);
      if (existingJob) {
        console.error("job already exists in queue", prompt);
        return;
      }

      // check if a job from the same ip address is already in the queue for any of the batches
      
      const ip = getIp(req);

      existingBatch.jobs.push({prompt, originalPrompt, callback, timingInfo, ip});

  });

  requestTimestamps.push(Date.now());
  requestTimestamps = requestTimestamps.filter(timestamp => Date.now() - timestamp < 60000);
  printQueueStatus();
});

const printQueueStatus = () => {
  const batchHead= ['Bucket Key', 'Jobs', 'Requests', 'Returns'];
  const batchTable = new Table({
    head: batchHead,
    colWidths: [20, 10, 10, 10],
 
  });

  const imageHead= ['Requests', 'Returned', 'Q-Size', 'Q-Pending', 'Q-Utilization'];
  const imageTable = new Table({
    head: imageHead,
    colWidths: [10, 10, 10, 10, 10],
  });

  currentBatches.forEach(batch => {
    const bucketKeyStatsRow = bucketKeyStats[batch.bucketKey] || { requested: 0, returned: 0 };
    batchTable.push([batch.bucketKey, batch.jobs.length, bucketKeyStatsRow.requested, bucketKeyStatsRow.returned]);
  });

  const queueSize = generalImageQueue.size;
  const queuePending = generalImageQueue.pending;
  // const queueUtilization = ((queueSize + queuePending) / (2 * generalImageQueue.concurrency) * 100).toFixed(2);
  imageTable.push([requestTimestamps.length, imageReturnTimestamps.length, queueSize, queuePending, `N/I%`]);

  console.log(batchTable.toString());
  console.log(imageTable.toString());

  // construct simple string tables for file writing
  const fileBatchTableHeaders = batchHead.join(',');
  const fileBatchTable = batchTable.map(row => row.join(',')).join('\n');
  const fileImageTableHeaders = imageHead.join(',');
  const fileImageTable = imageTable.map(row => row.join(',')).join('\n');
  
  // Write tables to a file
  writeFileSync('tableLogs.txt', `${fileBatchTableHeaders}\n${fileBatchTable}\n${fileImageTableHeaders}\n${fileImageTable}`);
}


const server = http.createServer(requestListener);
server.listen(process.env.PORT || 16384);
processBatches();



const normalizeAndTranslatePrompt = async (promptRaw, req, timingInfo, enhance=false) => {
  timingInfo.push({ step: 'Start prompt normalization and translation', timestamp: Date.now() });
  // first 200 characters are used for the prompt
  promptRaw = urldecode(promptRaw);
  promptRaw = promptRaw.substring(0,250);
  // 
  promptRaw = sanitizeString(promptRaw);
  
  if (promptRaw.includes("content:")) {
    // promptRaw = promptRaw.replace("content:", "");
    console.log("content: detected in prompt, returning null");
    return null;
  }
  let prompt = promptRaw;

  // check from the request headers if the user most likely speaks english (value starts with en)
  const englishLikely = req.headers["accept-language"]?.startsWith("en");
  
  if (!englishLikely) {
    const startTime = Date.now();
    prompt = await translateIfNecessary(prompt);
    const endTime = Date.now();
    console.log(`Translation time: ${endTime - startTime}ms`);
  }

  const finalPrompt = prompt || promptRaw;

  // return finalPrompt;
  // if prompt is less than 70 characters get closes prompt from prompt embeddings
  if (enhance === true && finalPrompt.length < 100) { 
    try {
      const closestPrompt = await getClosesPrompt(finalPrompt);
      console.log("got closest prompt", closestPrompt)
      timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
      return closestPrompt;
    } catch(e) {
      console.error("error calculating embeddings", e.message);
    } 
  }

  timingInfo.push({ step: 'End prompt normalization and translation', timestamp: Date.now() });
  return finalPrompt;
};

function getIp(req) {
  return req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
}

// //
