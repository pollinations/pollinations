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

import FormData from 'form-data';

const activeQueues = {};

const requestListener = async function (req, res) {

  let { pathname, query } = parse(req.url, true);
    // get query params
    const extraParams = {...query};

  // /feed uses server sent events to update the client with the latest images
  if (pathname.startsWith("/feed")) {
    registerFeedListener(req, res);
    sendToAnalytics(req, "feedRequested", {});
    return;
  }

  if (!pathname.startsWith("/prompt")) {
    res.end('404: Not Found');
    return
  }




  // get ip address of the request
  const ip = req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  const activeQueueSize = activeQueues[ip]?.size;

  if (activeQueueSize > 0) {
    console.log("ip: ", ip, "queue size", activeQueues[ip]?.size);  
  }


  // const { showImage, finish } = gifCreator(res);

  // await showImage("https://i.imgur.com/lTAeMmN.jpg");

  const promptRaw = pathname.split("/prompt/")[1];
  

  // extract a unique client id from the request


  if (!promptRaw) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }

  sendToAnalytics(req, "imageRequested", {promptRaw, concurrentRequests});

  // if ip address is already processing an image wait for it to finish
  if (!activeQueues[ip]) {
    activeQueues[ip] = new PQueue({concurrency: 1});
  }


  
  // console.log("queue size", imageGenerationQueue.size)
    try {
     const bufferWithLegend = await createAndReturnImageCached(promptRaw, extraParams, res, req,  activeQueues[ip].size, concurrentRequests, activeQueues[ip]);    
     // console.log(bufferWithLegend)
     res.write(bufferWithLegend);
     res.end();

      // console.log(bufferWithLegend)

    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end('500: Internal Server Error');
    }
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

  const nsfwDivider = isMature(prompt) ? 2 : 1;

  const steps = Math.floor(Math.max(5, Math.min(50, (50 - (concurrentRequests * 7)) / nsfwDivider)));
  
  console.log("concurent requests", concurrentRequests, "steps", steps, "prompt", prompt, "extraParams", extraParams);
  
  // const animal = prompt.toLowerCase().includes("black") ? "panda:1.3" : "gorilla:1.2";
  // const appendToPrompt = isMature(prompt) ? `. (${animal})` : "";
  
  concurrentRequests++;
  let buffer = null;
  try {
    const safeParams = makeParamsSafe(extraParams);

    
    sendToFeedListeners({concurrentRequests});
    
      const body = {
          "prompt": prompt + " <lora:noiseoffset:0.6>  <lora:flat_color:0.2>  <lora:add_detail:0.4> ",//+" | key visual| intricate| highly detailed| precise lineart| vibrant| comprehensive cinematic",
          "steps": steps,
          "height": 384,
          "sampler_index": "Euler a",//"DPM++ SDE Karras",
          "negative_prompt": "easynegative, cgi, doll, lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, text, watermark, artist name, copyright name, name, necklace",
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
    buffer = Buffer.from(base64Image, 'base64');
  } catch (e) {
    concurrentRequests--;
    throw e;
  }
  
  concurrentRequests--;
  // sendToFeedListeners({concurrentRequests});
  return buffer;
}

// NSFW API
// # curl command
// # curl -X POST -F "file=@<image_file_path>" http://localhost:10000/check 
// # result: {"nsfw": true/false}

const nsfwCheck = async (buffer) => {
  const form = new FormData();
  form.append('file', buffer, { filename: 'image.jpg' });
  const res =  await fetch('http://localhost:10000/check', { method: 'POST', body: form })
  const json = await res.json();
  return json;
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

async function createAndReturnImage(promptRaw, extraParams, res, req, ipQueueSize, concurrentRequests, enqueue) {

  if (ipQueueSize > 0) {
    console.log("sleeping as long as the queue size");
    //  (so e.g. if someone drops 30 images in parallel to pollinations we penalize that
    await sleep(2000 * ipQueueSize);
  } else
    console.log("no queue size, no sleep", ipQueueSize);

  return await enqueue.add(async () => {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });

    const promptAnyLanguage = urldecode(promptRaw);
    
    const prompt = await translateIfNecessary(promptAnyLanguage);

    const buffer = await callWebUI(prompt, extraParams);

    const {concept, nsfw: isMature} = await nsfwCheck(buffer);
    
    const isChild = Object.values(concept?.special_scores)?.some(score => score > 0);
    console.log("isMature", isMature, "concepts", isChild);

    // check for header add_header 'X-Lusti' 'true';

    const logoPath =  (req.headers['x-lusti'] || extraParams["lusti"] || isMature) ? 'logo_lusti_small_black.png' : 'logo.png';


    let bufferWithLegend = await addPollinationsLogoWithImagemagick(buffer, logoPath);

    // if (isChild && isMature) {
    //   // blur
    //   bufferWithLegend = await blurImage(bufferWithLegend, 8);
    // }

    // get current url from request
    const imageURL = `https://image.pollinations.ai${req.url}`; 
    
    sendToFeedListeners({concurrentRequests, imageURL, prompt, originalPrompt: promptAnyLanguage, nsfw: isMature, isChild}, {saveAsLastState: true});


    sendToAnalytics(req, "imageGenerated", {promptRaw, concurrentRequests});
    
    // res.write(bufferWithLegend);
    // res.end();
    return bufferWithLegend;
  });
}

const createAndReturnImageCached = cacheGeneratedImages(createAndReturnImage);


// imagemagick command line command to composite the logo on top of the image
// convert -background none -gravity southeast -geometry +10+10 logo.png -composite image.jpg image.jpg

function addPollinationsLogoWithImagemagick(buffer, logoPath="logo.png") {

  // create temporary file for the image
  const tempImageFile = tempfile({extension: 'png'});
  const tempOutputFile = tempfile({extension: 'jpg'});

  // write buffer to temporary file
  fs.writeFileSync(tempImageFile, buffer);


  return new Promise((resolve, reject) => {
    exec(`convert -background none -gravity southeast -geometry +10+10  ${tempImageFile} ${logoPath} -composite ${tempOutputFile}`, (error, stdout, stderr) => {

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

function blurImage(buffer, size=8) {
  // create temporary file for the image
  const tempImageFile = tempfile({extension: 'png'});
  const tempOutputFile = tempfile({extension: 'jpg'});

  // write buffer to temporary file
  fs.writeFileSync(tempImageFile, buffer);

  // blur image
  return new Promise((resolve, reject) => {

    exec(`convert ${tempImageFile} -blur 0x${size} ${tempOutputFile}`, (error, stdout, stderr) => {

      if (error) {
        console.log(`error: ${error.message}`);
        reject(error);
        return;
      }
      // get buffer
      const bufferBlurred = fs.readFileSync(tempOutputFile);

      // delete temporary files

      fs.unlinkSync(tempImageFile);
      fs.unlinkSync(tempOutputFile);

      resolve(bufferBlurred);
    });
  });


}
