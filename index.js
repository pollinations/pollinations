import http from 'http';

// import memoize from 'lodash.memoize';
import { parse } from 'url';
import urldecode from 'urldecode';

import { exec } from 'child_process';
import jimp from 'jimp';
import fetch from 'node-fetch';
import PQueue from 'p-queue';

import sleep from 'await-sleep';
import tempfile from 'tempfile';

import fs from 'fs';
import { cacheGeneratedImages } from './cacheGeneratedImages.js';
import { registerFeedListener, sendToFeedListeners } from './feedListeners.js';
const activeQueues = {};


// add legend
// use image.print of jimp to add text to the bottom of the image

let logo = null;

(async () => { 
  const logoPath = "./pollinations_logo.png";
  console.log("loading logo", logoPath)
  // get buffer
  const buffer = fs.readFileSync(logoPath);
  logo = await jimp.read(buffer);

  // resize logo to 100x10
  const aspectRatio = logo.getWidth() / logo.getHeight();
  logo.resize(170, 170 / aspectRatio);
})();


const requestListener = async function (req, res) {

  // // CORS
  // res.setHeader('Access-Control-Allow-Origin', '*');
	// res.setHeader('Access-Control-Request-Method', '*');
	// res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
	// res.setHeader('Access-Control-Allow-Headers', '*');
	// if ( req.method === 'OPTIONS' ) {
	// 	res.writeHead(200);
	// 	res.end();
	// 	return;
	// }

  let { pathname } = parse(req.url, true);

  console.log("path: ", pathname);
  
  let useKandinky = false;
  // if pathname contains /kandinsky set useKandinsky to true and replace /kandinisky with /prompt
  if (pathname.startsWith("/kandinsky")) {
    useKandinky = true;
    pathname = pathname.replace("/kandinsky", "/prompt");
  }

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
  console.log("ip: ", ip);  

  // if ip address is already processing an image wait for it to finish
  if (!activeQueues[ip]) {
    activeQueues[ip] = new PQueue({concurrency: 1});
  }

  // const { showImage, finish } = gifCreator(res);

  // await showImage("https://i.imgur.com/lTAeMmN.jpg");

  const promptRaw = pathname.split("/prompt/")[1];
  
  if (!promptRaw) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }

  // console.log("queue size", imageGenerationQueue.size)
  console.log("IP queue size", activeQueues[ip].size)
  await (activeQueues[ip].add(async () => {
    const bufferWithLegend = await createAndReturnImageCached(promptRaw, res, activeQueues[ip].size,  useKandinky)
  
    // console.log(bufferWithLegend)
    res.write(bufferWithLegend);
    res.end();

  }));
}

const server = http.createServer(requestListener);
server.listen(16384);

let concurrentRequests = 0;
const callWebUI = params => async (prompt, extraParams={}) => {

  
  // more steps means better image quality. 60 steps is good quality. 10 steps is fast.
  // set the amount of steps based on the queue size. 
  // if the queue is greater than 10 use only 10 steps 
  // if the queue is zero use 50 steps
  // smooth between 5 and 50 steps based on the queue size
  const steps = Math.min(50, Math.max(10, 50 - concurrentRequests * 10));
  console.log("concurent requests", concurrentRequests, "steps", steps, "prompt", prompt);
  concurrentRequests++;
  
  sendToFeedListeners({concurrentRequests});
  
    const body = {
        "prompt": prompt,//+" | key visual| intricate| highly detailed| precise lineart| vibrant| comprehensive cinematic",
        "steps": steps,
        "height": 384,
        "sampler_index": "Euler a",
        "negative_prompt": "cgi, doll, lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, text, watermark, artist name, copyright name, name, necklace",
        "cfg_scale": steps < 20 ? 3.0 : 7.0,
        ...params,
        ...extraParams
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
  return buffer;
}


const runModel = callWebUI();

const runKandinsky = callWebUI({width: 786, height:512, steps: 100 });

async function createAndReturnImage(promptRaw, res, ipQueueSize,  useKandinky) {

  if (ipQueueSize > 0) {
    console.log("sleeping 3000ms because there was an image in the queue before");
    await sleep(2000);
  }

  res.writeHead(200, { 'Content-Type': 'image/jpeg' });

  const prompt = urldecode(promptRaw);

  const buffer = useKandinky ? await runKandinsky(prompt) : await runModel(prompt);

  const bufferWithLegend = await addPollinationsLogoWithImagemagick(buffer);

  sendToFeedListeners({concurrentRequests, imageURL: `https://image.pollinations.ai/prompt/${promptRaw}`, prompt});
  return bufferWithLegend;
}

const createAndReturnImageCached = cacheGeneratedImages(createAndReturnImage);

// imagemagick command line command to composite the logo on top of the image
// convert -background none -gravity southeast -geometry +10+10 logo.png -composite image.jpg image.jpg

function addPollinationsLogoWithImagemagick(buffer) {

  // create temporary file for the image
  const tempImageFile = tempfile({extension: 'png'});
  const tempOutputFile = tempfile({extension: 'png'});

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

