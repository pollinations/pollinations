import urldecode from 'urldecode';
import http from 'http';
import { parse } from 'url';
import PQueue from 'p-queue';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { createAndReturnImageCached, makeParamsSafe } from './createAndReturnImageCached.js';
import { getCachedImage, cacheImage, isImageCached } from './cacheGeneratedImages.js';
import awaitSleep from 'await-sleep';
import { splitEvery } from 'ramda';
import { readFileSync, writeFileSync } from 'fs';
import Table from 'cli-table3'; // Importing cli-table3 for table formatting
import { sanitizeString, translateIfNecessary } from './translateIfNecessary.js';

const BATCH_SIZE = 10; // Number of requests per batch

const concurrency = 3; // Number of concurrent requests per bucket key

const generalImageQueue = new PQueue({ concurrency});
let currentBatches = [];

const queueFullImages = [readFileSync("./queuefull1.png"), readFileSync("./queuefull2.png"), readFileSync("./queuefull3.png")];

let requestTimestamps = []; // Array to store timestamps of image requests
let imageReturnTimestamps = []; // Array to store timestamps of returned images

// this is used to create a queue per ip address

const ipPromises = {};

// Initialize an object to track images requested and returned per bucket key
let bucketKeyStats = {};

const processChunk = async (chunk, bucketKey, extraParams) => {
  try {
    const buffersWithLegend = await createAndReturnImageCached(chunk.map(job => job.prompt), extraParams, {concurrentRequests: countJobs(true)});
    chunk.forEach((job, index) => {
      job.callback(null, buffersWithLegend[index]);
      cacheImage(job.prompt, extraParams, buffersWithLegend[index].buffer);
      // Increment the count of images returned for this bucket key
      bucketKeyStats[bucketKey].returned++;
    });
  } catch (e) {
    console.error(e);
    chunk.forEach(job => job.callback(e)); // Error callback
  }
};

const processBatches = async () => {
  if (generalImageQueue.pending < concurrency) {
    // console.log("batch processor became free.pending", generalImageQueue.pending,"concurrency", concurrency);

    // Determine if we should use the first batch (90% of cases) or the second batch (10% of cases)
    const batchIndex = Math.random() < 0.8 ? 0 : 1;
    const batch = currentBatches[batchIndex];
    if (batch) {
      const { bucketKey, jobs, extraParams } = batch;
      const chunks = splitEvery(BATCH_SIZE, jobs);
      const chunk = chunks.shift();
      if (chunk) {
        batch.jobs = batch.jobs.slice(chunk.length);
        if (batch.jobs.length === 0) {
          // Remove the processed batch from the array
          currentBatches.splice(batchIndex, 1);
        }
        generalImageQueue.add(async () => processChunk(chunk, bucketKey, extraParams));
      }
    }
  }
  setTimeout(processBatches, 100);
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

const requestListener = async function (req, res) {
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

  let prompt = pathname.split("/prompt/")[1];

  if (!prompt) {
    res.writeHead(404);
    res.end('404: Not Found');
    return;
  }

  prompt = await normalizeAndTranslatePrompt(prompt);
  
  const extraParams = {...query};


  const safeParams = makeParamsSafe(extraParams);

  const bucketKey = ["model","width","height"]
    .filter(key => safeParams[key])
    .map(key => safeParams[key])
    .join('-');

  const concurrentRequests = countJobs();
  const analyticsMetadata = { promptRaw: prompt, concurrentRequests, bucketKey, model: safeParams["model"] };
  sendToAnalytics(req, "imageRequested", analyticsMetadata);

  const memCacheKey = `${bucketKey}-${prompt}-${JSON.stringify(extraParams)}`;

  // Initialize the stats for this bucket key if they don't exist yet
  if (!bucketKeyStats[bucketKey]) {
    bucketKeyStats[bucketKey] = { requested: 0, returned: 0 };
  }

  if (memCache[memCacheKey]) {
    res.write(await memCache[memCacheKey]);
    res.end();
    // Add current timestamp to imageReturnTimestamps array
    imageReturnTimestamps.push(Date.now());
    // Filter out timestamps older than 60 seconds
    imageReturnTimestamps = imageReturnTimestamps.filter(timestamp => Date.now() - timestamp < 60000);
    // Log the number of images returned in the last minute
    // console.log(`Images returned in the last minute: ${imageReturnTimestamps.length}`);
    return;
  }

  if (await isImageCached(prompt, extraParams)) {
    const cachedImage = await getCachedImage(prompt, extraParams);
    res.write(cachedImage);
    res.end();
    return;
  }

  // Increment the count of images requested for this bucket key
  bucketKeyStats[bucketKey].requested++;

  if (countJobs() > 100) {
    // return a random queue full image
    const queueFullImage = queueFullImages[Math.floor(Math.random() * queueFullImages.length)];
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.write(queueFullImage);
    res.end();
    return;
  }

  const ip = req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // we want to add a sleep if there was already a request from this ip
  if (!ipPromises[ip]) {
    ipPromises[ip] = Promise.resolve();
  }

  memCache[memCacheKey] = new Promise(async (resolve, reject) => {

    ipPromises[ip] = ipPromises[ip].then(async () => {
      // await awaitSleep(1000);
    
      console.error("prompt",prompt, "bucketKey", bucketKey);

      const callback = (error, bufferAndMaturity) => {
        if (error) {
          res.writeHead(500);
          res.end('500: Internal Server Error');
          reject(error);
          return;
        }
        res.write(bufferAndMaturity.buffer);
        resolve(bufferAndMaturity.buffer);
        res.end();
        // Add current timestamp to imageReturnTimestamps array
        imageReturnTimestamps.push(Date.now());
        // Filter out timestamps older than 60 seconds
        imageReturnTimestamps = imageReturnTimestamps.filter(timestamp => Date.now() - timestamp < 60000);
        // Log the number of images returned in the last minute
        // console.log(`Images returned in the last minute: ${imageReturnTimestamps.length}`);
        
        const imageURL = `https://image.pollinations.ai${req.url}`;
        sendToFeedListeners({ concurrentRequests, imageURL, prompt, originalPrompt: prompt, nsfw: bufferAndMaturity.isMature, isChild: bufferAndMaturity.isChild, model: extraParams["model"] }, { saveAsLastState: true });
        sendToAnalytics(req, "imageGenerated", analyticsMetadata);


      };

      const existingBatch = currentBatches.find(batch => batch.bucketKey === bucketKey);

      if (!existingBatch) {
        currentBatches.push({ bucketKey, jobs: [{prompt, callback}], extraParams });
        return;
      }

      // make a sanity check to be sure a job with the same prompt doesn't already exist in the queue
      const existingJob = existingBatch.jobs.find(job => job.prompt === prompt);
      if (existingJob) {
        console.error("job already exists in queue", prompt);
        return;
      }

      existingBatch.jobs.push({prompt, callback});
    })
  });

  // Add current timestamp to requestTimestamps array
  requestTimestamps.push(Date.now());
  // Filter out timestamps older than 60 seconds
  requestTimestamps = requestTimestamps.filter(timestamp => Date.now() - timestamp < 60000);
  // Log the number of image requests in the last minute
  printQueueStatus();
};

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
server.listen(16385);
processBatches();



const normalizeAndTranslatePrompt = async (promptRaw) => {
  promptRaw = sanitizeString(promptRaw);
  
  if (promptRaw.includes("content:")) {
    promptRaw = promptRaw.replace("content:", "");
  }
  const promptAnyLanguage = urldecode(promptRaw);

  const prompt = await translateIfNecessary(promptAnyLanguage);

  return prompt;
};