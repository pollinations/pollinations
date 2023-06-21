import http from 'http';

// import memoize from 'lodash.memoize';
// import memoize from 'lodash.memoize';
import { parse } from 'url';
import urldecode from 'urldecode';

import { exec } from 'child_process';


import fetch from 'node-fetch';
import PQueue from 'p-queue';

import sleep from 'await-sleep';
import tempfile from 'tempfile';

import fs from 'fs';
import { cacheGeneratedImages } from './cacheGeneratedImages.js';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';

import { translateIfNecessary } from './translateIfNecessary.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { isMature } from "./lib/mature.js"





const activeQueues = {};




const requestListener = async function (req, res) {

  let { pathname, query } = parse(req.url, true);
    // get query params
    const extraParams = {...query};

  // /feed uses server sent events to update the client with the latest images
  if (pathname.startsWith("/feed")) {
    registerFeedListener(req, res);
    return;
  }

  if (!pathname.startsWith("/prompt")) {
    res.end('404: Not Found');
    return
  }




  // get ip address of the request
  const ip = req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (activeQueues[ip]?.size > 0) {
    console.log("ip: ", ip, "queue size", activeQueues[ip]?.size);  
  }

  // if ip address is already processing an image wait for it to finish
  if (!activeQueues[ip]) {
    activeQueues[ip] = new PQueue({concurrency: 1});
  }

  // const { showImage, finish } = gifCreator(res);

  // await showImage("https://i.imgur.com/lTAeMmN.jpg");

  const promptRaw = pathname.split("/prompt/")[1];
  

  // extract a unique client id from the request

  sendToAnalytics(req, "imageRequested", {promptRaw, concurrentRequests});

  if (!promptRaw) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }

  // console.log("queue size", imageGenerationQueue.size)
  await (activeQueues[ip].add(async () => {
    try {
      const bufferWithLegend = await createAndReturnImageCached(promptRaw, extraParams, res, req, activeQueues[ip].size, concurrentRequests);
    
      // console.log(bufferWithLegend)
      res.write(bufferWithLegend);
      res.end();
      sendToAnalytics(req, "imageGenerated", {promptRaw, concurrentRequests});
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end('500: Internal Server Error');
    }
  }));
}

const server = http.createServer(requestListener);
server.listen(16384);

let concurrentRequests = 0;
const callWebUI = async (prompt, extraParams={}) => {

  
  // more steps means better image quality. 60 steps is good quality. 10 steps is fast.
  // set the amount of steps based on the queue size. 
  // if the queue is greater than 10 use only 10 steps 
  // if the queue is zero use 50 steps
  // smooth between 5 and 50 steps based on the queue size
  const steps = isMature(prompt) ? 10 : Math.min(50, Math.max(15, 50 - concurrentRequests * 10));
  
  console.log("concurent requests", concurrentRequests, "steps", steps, "prompt", prompt, "extraParams", extraParams);
  
  const animal = prompt.toLowerCase().includes("black") ? "panda:1.3" : "gorilla:1.45";
  const appendToPrompt = isMature(prompt) ? `. (${animal})` : "";
  
  concurrentRequests++;
  
  const safeParams = makeParamsSafe(extraParams);

  
  sendToFeedListeners({concurrentRequests});
  
    const body = {
        "prompt": prompt + " <lora:noiseoffset:0.6>  <lora:flat_color:0.2>  <lora:add_detail:0.4> "+ appendToPrompt,//+" | key visual| intricate| highly detailed| precise lineart| vibrant| comprehensive cinematic",
        "steps": steps,
        "height": 384,
        "sampler_index": "Euler a",//"DPM++ SDE Karras",
        "negative_prompt": "easynegative naked woman, huge breasts, cgi, doll, lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, text, watermark, artist name, copyright name, name, necklace",
        "cfg_scale": steps < 20 ? 3.0 : 7.0,
        ...safeParams
      }
  
    console.log("calling steps", body.steps, "prompt",body.prompt);
    const response = await fetch('http://localhost:7860/sdapi/v1/txt2img', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
        "Content-Type": "application/json"
    }
  });

  const resJson = await response.json();
  const base64Image = resJson["images"][0];
  // convert base64 image to buffer
  const buffer = Buffer.from(base64Image, 'base64');

  concurrentRequests--;
  sendToFeedListeners({concurrentRequests});
  return buffer;
}

const maxPixels = 640 * 640;
const makeParamsSafe = ({width=512, height=384, seed}) => {
  // if we exaggerate with the dimensions, cool things down a  little
  // maintaining aspect ratio
  if (width * height > maxPixels) {
    const ratio = Math.sqrt(maxPixels / (width * height));
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }

  // if seed is not an integer set to a random integer
  if (seed && !Number.isInteger(parseInt(seed))) {
    seed = Math.floor(Math.random() * 1000000);
  }

  return {width, height, seed};
}

async function createAndReturnImage(promptRaw, extraParams, res, req, ipQueueSize, concurrentRequests) {

  if (ipQueueSize > 0) {
    console.log("sleeping 3000ms because there was an image in the queue before");
    await sleep(4000);
  }

  res.writeHead(200, { 'Content-Type': 'image/jpeg' });

  const promptAnyLanguage = urldecode(promptRaw);
  
  const prompt = await translateIfNecessary(promptAnyLanguage);

  const buffer = await callWebUI(prompt, extraParams);

  const bufferWithLegend = await addPollinationsLogoWithImagemagick(buffer);

  // get current url from request
  const imageURL = `https://image.pollinations.ai${req.url}`; 
  sendToFeedListeners({concurrentRequests, imageURL, prompt, originalPrompt: promptAnyLanguage}, {saveAsLastState: true});
  
  return bufferWithLegend;
}

const createAndReturnImageCached = cacheGeneratedImages(createAndReturnImage);


// imagemagick command line command to composite the logo on top of the image
// convert -background none -gravity southeast -geometry +10+10 logo.png -composite image.jpg image.jpg

function addPollinationsLogoWithImagemagick(buffer) {

  // create temporary file for the image
  const tempImageFile = tempfile({extension: 'png'});
  const tempOutputFile = tempfile({extension: 'jpg'});

  // write buffer to temporary file
  fs.writeFileSync(tempImageFile, buffer);


  return new Promise((resolve, reject) => {
    exec(`convert -background none -gravity southeast -geometry +10+10  ${tempImageFile} logo.png -composite ${tempOutputFile}`, (error, stdout, stderr) => {

      if (error) {
        console.log(`error: ${error.message}`);
        reject(error);
        return;
      }
      // get buffer
      const bufferWithLegend = fs.readFileSync(tempOutputFile);

      // delete temporary files

      fs.unlinkSync(tempImageFile);
      fs.unlinkSync(tempOutputFile);

      resolve(bufferWithLegend);
    });
  });
}




