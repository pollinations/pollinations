import urldecode from 'urldecode';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import tempfile from 'tempfile';
import fs from 'fs';
import { getCachedImage, cacheImage, isImageCached } from './cacheGeneratedImages.js';
import { sendToFeedListeners } from './feedListeners.js';
import { translateIfNecessary } from './translateIfNecessary.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { isMature } from "./lib/mature.js";
import FormData from 'form-data';

const SERVER_URL = 'http://localhost:5555/predict';
const callWebUI = async (prompt, extraParams = {}, concurrentRequests) => {


  const nsfwDivider = isMature(prompt) ? 2 : 1;
  const steps = Math.round(Math.max(2, (10 - concurrentRequests) / nsfwDivider));
  console.log("concurrent requests", concurrentRequests, "steps", steps, "prompt", prompt, "extraParams", extraParams);

  let imagePath = null;
  try {
    const safeParams = makeParamsSafe(extraParams);

    sendToFeedListeners({ concurrentRequests, prompt, steps });

    const body = {
      "prompt": prompt,
      "steps": steps,
      "height": 384,
      ...safeParams
    };

    console.log("calling steps", body.steps, "prompt", body.prompt);

    // Send the request to the Flask server
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const jsonResponse = await response.json();
    console.log("jsonResponse", jsonResponse);
    // quit the process
    imagePath = jsonResponse.output_path;

  } catch (e) {
    throw e;
  }


  // load from imagePath to buffer using readFileSync
  console.log("reading image from path", imagePath);
  const buffer = fs.readFileSync(imagePath);
  // delete imagePath
  setTimeout(() => fs.unlink(imagePath, () => null), 10000);
  return buffer;
};
// NSFW API
// # curl command
// # curl -X POST -F "file=@<image_file_path>" http://localhost:10000/check 
// # result: {"nsfw": true/false}
const nsfwCheck = async (buffer) => {
  const form = new FormData();
  form.append('file', buffer, { filename: 'image.jpg' });
  const res = await fetch('http://localhost:10000/check', { method: 'POST', body: form });
  const json = await res.json();
  return json;
};
const maxPixels = 640 * 640;
const makeParamsSafe = ({ width = 512, height = 512, seed, model = "turbo" }) => {


  // if seed is not an integer set to a random integer
  if (seed && !Number.isInteger(parseInt(seed))) {
    seed = Math.floor(Math.random() * 1000000);
  }

  // if we exaggerate with the dimensions, cool things down a  little
  // maintaining aspect ratio
  if (width * height > maxPixels) {
    const ratio = Math.sqrt(maxPixels / (width * height));
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }


  return { width, height, seed, model };
};

export async function createAndReturnImageCached(promptRaw, extraParams,concurrentRequests, res, req) {
  // filter all prompts that contain  "content:"

  if (promptRaw.includes("content:")) {
    // res.writeHead(404);
    // res.end('404: Not Found');
    // throw new Error("prompt contains content:");
    promptRaw = promptRaw.replace("content:", "");
  }

  // if (ipQueueSize > 0) {
  //   console.error("sleeping as long as the queue size");
  //   //  (so e.g. if someone drops 30 images in parallel to pollinations we penalize that
  //   await sleep(2000);
  // } else
  //   console.error("no queue size, no sleep", ipQueueSize);
    const result = await (async () => {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });

      const promptAnyLanguage = urldecode(promptRaw);

      const prompt = await translateIfNecessary(promptAnyLanguage);

      const buffer = await callWebUI(prompt, extraParams, concurrentRequests);

      const { concept, nsfw: isMature } = await nsfwCheck(buffer);

      const isChild = Object.values(concept?.special_scores)?.some(score => score > 0);
      console.error("isMature", isMature, "concepts", isChild);

      // check for header add_header 'X-Lusti' 'true';
      // const logoPath =  (req.headers['x-lusti'] || extraParams["lusti"] || isMature) ? 'logo_lusti_small_black.png' : 'logo.png';
      const logoPath = (req.headers['x-lusti'] || extraParams["lusti"] || isMature) ? null : 'logo.png';

      let bufferWithLegend = extraParams["nologo"] || !logoPath ? buffer : await addPollinationsLogoWithImagemagick(buffer, logoPath);

      // if (isChild && isMature) {
      //   // blur
      //   bufferWithLegend = await blurImage(bufferWithLegend, 8);
      // }
      // get current url from request
      const imageURL = `https://image.pollinations.ai${req.url}`;

      sendToFeedListeners({ concurrentRequests, imageURL, prompt, originalPrompt: promptAnyLanguage, nsfw: isMature, isChild, model: extraParams["model"] }, { saveAsLastState: true });


      sendToAnalytics(req, "imageGenerated", { promptRaw, concurrentRequests });

      // res.write(bufferWithLegend);
      // res.end();
      return bufferWithLegend;
    })();

    return result;
}
// imagemagick command line command to composite the logo on top of the image
// convert -background none -gravity southeast -geometry +10+10 logo.png -composite image.jpg image.jpg
function addPollinationsLogoWithImagemagick(buffer, logoPath = "logo.png") {

  // create temporary file for the image
  const tempImageFile = tempfile({ extension: 'png' });
  const tempOutputFile = tempfile({ extension: 'jpg' });

  // write buffer to temporary file
  fs.writeFileSync(tempImageFile, buffer);


  return new Promise((resolve, reject) => {
    exec(`convert -background none -gravity southeast -geometry +10+10  ${tempImageFile} ${logoPath} -composite ${tempOutputFile}`, (error, stdout, stderr) => {

      if (error) {
        console.error(`error: ${error.message}`);
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
function blurImage(buffer, size = 8) {
  // create temporary file for the image
  const tempImageFile = tempfile({ extension: 'png' });
  const tempOutputFile = tempfile({ extension: 'jpg' });

  // write buffer to temporary file
  fs.writeFileSync(tempImageFile, buffer);

  // blur image
  return new Promise((resolve, reject) => {

    exec(`convert ${tempImageFile} -blur 0x${size} ${tempOutputFile}`, (error, stdout, stderr) => {

      if (error) {
        console.error(`error: ${error.message}`);
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
