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
const activeQueues = {};


const imageGenerationQueue = new PQueue({concurrency: 1});

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

  let { pathname } = parse(req.url, true);

  console.log("path: ", pathname);
  
  let useKandinky = false;
  // if pathname contains /kandinsky set useKandinsky to true and replace /kandinisky with /prompt
  if (pathname.startsWith("/kandinsky")) {
    useKandinky = true;
    pathname = pathname.replace("/kandinsky", "/prompt");
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

  const promptAndSeed = pathname.split("/prompt/")[1];
  
  if (!promptAndSeed) {
    res.writeHead(404);
    res.end('404: Not Found');
    return
  }

  // console.log("queue size", imageGenerationQueue.size)
  console.log("IP queue size", activeQueues[ip].size)
  await (activeQueues[ip].add(() => createAndReturnImage(res, promptAndSeed, activeQueues[ip].size,  useKandinky)));
}

// dummy handler that  redirects all requests to the static : https://i.imgur.com/emiRJ04.gif
const dummyListener = async function (req, res) {
  // return a 302 redirect to the static image
  res.writeHead(302, {
    'Location': 'https://i.imgur.com/DgRPBiJ.gif'
  });
  res.end();
}
  

const server = http.createServer(requestListener);
server.listen(16384);


// call rest api like this

// const body = {
//   "image": "replicate:pollinations/lemonade-preset",
//   "input": {
//       "image": await toBase64(image),
//       "styles": styles,
//       "num_images_per_style": num_images_per_style,
//       "strength": strength,
//       "gender": gender,
//       "ethnicity": ethnicity
//   }
// }

// const response = await fetch('https://rest.pollinations.ai/pollen', {
//   method: 'POST',
//   body: JSON.stringify(body),
//   headers: {
//       "Authorization": `Bearer ${document.querySelector('#token').value}`,
//       "Content-Type": "application/json"
//   }
// });

let concurrentRequests = 0;
const callWebUI = params => async (prompt, extraParams={}) => {

  
  // more steps means better image quality. 60 steps is good quality. 10 steps is fast.
  // set the amount of steps based on the queue size. 
  // if the queue is greater than 10 use only 10 steps 
  // if the queue is zero use 60 steps
  // smooth between 5 and 60 steps based on the queue size
  const steps = Math.min(60, Math.max(10, 60 - concurrentRequests * 10));
  console.log("concurent requests", concurrentRequests, "steps", steps, "prompt", prompt);
  concurrentRequests++;
  
    const body = {
        "prompt": prompt,
        "steps": steps,
        "height": 384,
        "sampler_index": "Euler a",
        "negative_prompt": "empty, boring, blank space, black, dark, low quality, noisy, grainy, watermark, signature, logo, writing, text, person, people, human, baby, cute, young, simple, cartoon, face, uncanny valley, deformed, silly",
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

// wget http://localhost:12345/kandinsky/{prompt} -O image.png

const callKandinsky = async (prompt) => {
  // url encode prompt
  const promptEncoded = encodeURIComponent(prompt);
  const url = `http://localhost:12345/kandinsky/${promptEncoded}`;

  const response = await fetch(url);
  const buffer = await response.buffer();

  return buffer;
}
// exec("./connect_reverse_ssh.sh", (error, stdout, stderr) => {
//   if (error) {
//       console.log(`error: ${error.message}`);
//       return;
//   }
//   if (stderr) {
//       console.log(`stderr: ${stderr}`);
//       return;
//   }
//   console.log(`stdout: ${stdout}`);
// })


const runModel = cacheGeneratedImages(callWebUI())

const runKandinsky = cacheGeneratedImages(callWebUI({width: 786, height:512, steps: 100 }))//, "/tmp/kandinsky_cache")

async function createAndReturnImage(res, promptAndSeed, ipQueueSize,  useKandinky) {

  if (ipQueueSize > 0) {
    console.log("sleeping 3000ms because there was an image in the queue before");
    await sleep(5000);
  }

  res.writeHead(200, { 'Content-Type': 'image/jpeg' });

  const [promptRaw, seedOverride] = promptAndSeed.split("/");

  const prompt = urldecode(promptRaw).replaceAll("_", " ");


  const buffer = useKandinky ? await runKandinsky(prompt) : await runModel(prompt);


  const bufferWithLegend = await addPollinationsLogoWithImagemagick(buffer);

  // console.log(bufferWithLegend)
  res.write(bufferWithLegend);

  // res.write(buffer);
  console.log("finishing");
  res.end();
}

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
