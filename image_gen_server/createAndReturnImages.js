import urldecode from 'urldecode';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import tempfile from 'tempfile';
import fs from 'fs';
import { sendToFeedListeners } from './feedListeners.js';
import FormData from 'form-data';
import { ExifTool } from 'exiftool-vendored';
import { fileTypeFromBuffer } from 'file-type';
import { getNextFluxServerUrl } from './availableServers.js';

const SERVER_URL = 'http://localhost:5002/generate';

let total_start_time = Date.now();
let accumulated_fetch_duration = 0;


/**
 * @typedef {Object} Job
 * @property {string} prompt
 * @property {string} ip
 */

/**
 * Calls the Web UI with the given parameters and returns image buffers.
 * @param {{ jobs: Job[], safeParams: Object, concurrentRequests: number, ip: string }} params
 * @returns {Promise<Array<{buffer: Buffer, [key: string]: any}>>}
 */
const callWebUI = async (prompt, safeParams, concurrentRequests) => {
  console.log("concurrent requests", concurrentRequests, "safeParams", safeParams);

  // steps depends on the concurrent requests
  // if there are less then 3 use 4 steps
  // if there are less than 4 use 3 steps
  // if there are less than 5 use 2 steps
  // if there are less than 6 use 1 step

  const steps = concurrentRequests < 6 ? 4 : concurrentRequests < 10 ? 3 : concurrentRequests < 16 ? 2 : 1;

  try {
    // const prompts = jobs.map(({ prompt }) => sanitizePrompt(prompt));
    prompt = sanitizePrompt(prompt);
    const body = {
      "prompts": [prompt],
      "width": safeParams.width,
      "height": safeParams.height,
      "seed": safeParams.seed,
      "negative_prompt": safeParams.negative_prompt,
      "steps": steps
    };

    console.log("calling prompt", body.prompts);

    // Start timing for fetch
    const fetch_start_time = Date.now();

    // Retry logic for fetch
    let response;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const chosenServer = safeParams.model === "flux" ? getNextFluxServerUrl() : SERVER_URL;
        response = await fetch(chosenServer, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          timeout: 30000, // 30 seconds timeout
        });
        if (response.ok) break; // If response is ok, break out of the loop
        throw new Error(`Server responded with ${response.status}`);
      } catch (error) {
        console.error(`Fetch attempt ${attempt} failed: ${error.message}`);
        if (attempt === 5) throw error;
        await new Promise(resolve => setTimeout(resolve, 4000 * attempt)); // Exponential backoff
      }
    }

    const fetch_end_time = Date.now();

    // Calculate the time spent in fetch
    const fetch_duration = fetch_end_time - fetch_start_time;
    console.log(`Fetch duration: ${fetch_duration}ms`);
    accumulated_fetch_duration += fetch_duration;

    // Calculate the total time the app has been running
    const total_time = Date.now() - total_start_time;

    // Calculate and print the percentage of time spent in fetch
    const fetch_percentage = (accumulated_fetch_duration / total_time) * 100;
    console.log(`Fetch time percentage: ${fetch_percentage}%`);

    if (!response?.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const jsonResponse = await response.json();
    // let images = jsonResponse;

    // // if images is not an array make it an array
    // if (!Array.isArray(images)) {
    //   images = [images];
    // }
    const { image, ...rest } = Array.isArray(jsonResponse) ? jsonResponse[0] : jsonResponse;

    if (!image) {
      console.error("image is null");
      throw new Error("image is null");
    }

    console.log("decoding base64 image");

    const buffer = Buffer.from(image, 'base64');
    let tempImageFile;
    const { ext } = await fileTypeFromBuffer(buffer);
    tempImageFile = tempfile({ extension: ext });
    fs.writeFileSync(tempImageFile, buffer);

    const bufferWithMetadata = fs.readFileSync(tempImageFile); // Re-read to get the version with metadata
    if (tempImageFile) fs.unlinkSync(tempImageFile);
    return { buffer: bufferWithMetadata, ...rest };

  } catch (e) {
    console.error('Error in callWebUI:', e);
    throw e;
  }
};

/**
 * Checks if the image is NSFW.
 * @param {Buffer} buffer - The image buffer to check.
 * @returns {Promise<Object>} - The result of the NSFW check.
 */
const nsfwCheck = async (buffer) => {
  const form = new FormData();
  form.append('file', buffer, { filename: 'image.jpg' });
  const nsfwCheckStartTime = Date.now();
  const res = await fetch('http://localhost:10000/check', { method: 'POST', body: form });
  const nsfwCheckEndTime = Date.now();
  console.log(`NSFW check duration: ${nsfwCheckEndTime - nsfwCheckStartTime}ms`);
  const json = await res.json();
  return json;
};

const idealSideLength = {
  turbo: 1024,
  flux: 768,
  deliberate: 640,
  dreamshaper: 800,
  formulaxl: 800,
  playground: 960,
  dpo: 768,
  dalle3xl: 768,
  realvis: 768,
};
/**
 * Sanitizes and adjusts parameters for image generation.
 * @param {{ width: number|null, height: number|null, seed: number|string, model: string, enhance: boolean|string, refine: boolean|string, nologo: boolean|string, negative_prompt: string, nofeed: boolean|string }} params
 * @returns {Object} - The sanitized parameters.
 */
export const makeParamsSafe = ({ width = null, height = null, seed, model = "flux", enhance = false, refine = false, nologo = false, negative_prompt = "worst quality, blurry", nofeed = false }) => {
  // Sanitize boolean parameters
  const sanitizeBoolean = (value) => value?.toLowerCase?.() === "true" ? true : value?.toLowerCase?.() === "false" ? false : value;
  refine = sanitizeBoolean(refine);
  enhance = sanitizeBoolean(enhance);
  nologo = sanitizeBoolean(nologo);
  nofeed = sanitizeBoolean(nofeed);

  const sideLength = idealSideLength[model] || idealSideLength["turbo"];
  const maxPixels = sideLength * sideLength;

  // Ensure width and height are integers or default to sideLength
  width = Number.isInteger(parseInt(width)) ? parseInt(width) : 768;
  height = Number.isInteger(parseInt(height)) ? parseInt(height) : 768;

  // Ensure seed is a valid integer within the allowed range
  const maxSeedValue = 18446744073709551500;
  seed = Number.isInteger(parseInt(seed)) ? parseInt(seed) : 42;

  if (seed === -1) {
    seed = Math.floor(20 * Math.random());
  }
  else if (seed < 0 || seed > maxSeedValue) {
    seed = 42;
  }

  // Adjust dimensions to maintain aspect ratio if exceeding maxPixels
  if (width * height > maxPixels) {
    const ratio = Math.sqrt(maxPixels / (width * height));
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }

  if (model !== "flux" && model !== "turbo")
    model = "flux";
  return { width, height, seed, model, enhance, refine, nologo, negative_prompt, nofeed };
};

/**
 * Creates and returns images with optional logo and metadata, checking for NSFW content.
 * @param {{ jobs: Job[], safeParams: Object, concurrentRequests: number, ip: string }} params
 * @returns {Promise<Array<{ buffer: Buffer, isChild: boolean, isMature: boolean }>>}
 */
export async function createAndReturnImageCached(prompt, safeParams, concurrentRequests) {
  const bufferAndMaturity = await callWebUI(prompt, safeParams, concurrentRequests);

  let isMature = bufferAndMaturity.has_nsfw_concept;
  const concept = bufferAndMaturity.concept;
  const isChild = Object.values(concept?.special_scores || {})?.some(score => score > -0.05);
  console.error("isMature", isMature, "concepts", isChild);
  if (isChild) isMature = true;

  const logoPath = isMature ? null : 'logo.png';
  let bufferWithLegend = safeParams["nologo"] || !logoPath ? bufferAndMaturity.buffer : await addPollinationsLogoWithImagemagick(bufferAndMaturity.buffer, logoPath, safeParams);

  // Resize the final image to the user's desired size
  bufferWithLegend = await resizeImage(bufferWithLegend, safeParams.width, safeParams.height);

  // Start timing for exif
  const exif_start_time = Date.now();
  const exifTool = new ExifTool();
  const tempImageFile = tempfile({ extension: "jpg" });
  fs.writeFileSync(tempImageFile, bufferWithLegend);
  const { buffer: _buffer, ...maturity } = bufferAndMaturity;
  // Embed safeParams as metadata
  await exifTool.write(tempImageFile, {
    UserComment: JSON.stringify({ ...safeParams, ...maturity }),
    Make: "Stable Diffusion"
  });
  const exif_end_time = Date.now();
  console.log(`Exif writing duration: ${exif_end_time - exif_start_time}ms`);
  bufferWithLegend = fs.readFileSync(tempImageFile); // Re-read to get the version with metadata
  await exifTool.end();
  if (tempImageFile) fs.unlinkSync(tempImageFile);

  return { buffer: bufferWithLegend, isChild, isMature };

}

/**
 * Adds a logo to the image using ImageMagick.
 * @param {Buffer} buffer - The image buffer.
 * @param {string} logoPath - The path to the logo file.
 * @param {Object} safeParams - Parameters for adjusting the logo size.
 * @returns {Promise<Buffer>} - The image buffer with the logo added.
 */
async function
  addPollinationsLogoWithImagemagick(buffer, logoPath, safeParams) {
  const { ext } = await fileTypeFromBuffer(buffer);
  const tempImageFile = tempfile({ extension: ext });
  const tempOutputFile = tempfile({ extension: "jpg" });

  fs.writeFileSync(tempImageFile, buffer);

  const targetWidth = safeParams.width * 0.3;
  const scaleFactor = targetWidth / 200;
  const targetHeight = scaleFactor * 31;

  return new Promise((resolve, reject) => {
    exec(`convert -background none -gravity southeast -geometry ${targetWidth}x${targetHeight}+10+10 ${tempImageFile} ${logoPath} -composite ${tempOutputFile}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`);
        reject(error);
        return;
      }
      const bufferWithLegend = fs.readFileSync(tempOutputFile);
      fs.unlinkSync(tempImageFile);
      fs.unlinkSync(tempOutputFile);
      resolve(bufferWithLegend);
    });
  });
}

/**
 * Applies a blur effect to the image using ImageMagick.
 * @param {Buffer} buffer - The image buffer.
 * @param {number} [size=8] - The size of the blur effect.
 * @returns {Promise<Buffer>} - The blurred image buffer.
 */
async function blurImage(buffer, size = 8) {
  const { ext } = await fileTypeFromBuffer(buffer);
  const tempImageFile = tempfile({ extension: ext });
  const tempOutputFile = tempfile({ extension: ext });

  fs.writeFileSync(tempImageFile, buffer);

  return new Promise((resolve, reject) => {
    exec(`convert ${tempImageFile} -blur 0x${size} ${tempOutputFile}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`);
        reject(error);
        return;
      }
      const bufferBlurred = fs.readFileSync(tempOutputFile);
      fs.unlinkSync(tempImageFile);
      fs.unlinkSync(tempOutputFile);
      resolve(bufferBlurred);
    });
  });
}

/**
 * Resizes the image to the desired dimensions using ImageMagick.
 * @param {Buffer} buffer - The image buffer.
 * @param {number} width - The desired width.
 * @param {number} height - The desired height.
 * @returns {Promise<Buffer>} - The resized image buffer.
 */
async function resizeImage(buffer, width, height) {
  const { ext } = await fileTypeFromBuffer(buffer);
  const tempImageFile = tempfile({ extension: ext });
  const tempOutputFile = tempfile({ extension: "jpg" });

  fs.writeFileSync(tempImageFile, buffer);

  // Ensure dimensions are within the allowed range
  width = Math.max(32, Math.min(1512, width));
  height = Math.max(32, Math.min(1512, height));

  return new Promise((resolve, reject) => {
    exec(`convert ${tempImageFile} -resize ${width}x${height}! ${tempOutputFile}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`);
        reject(error);
        return;
      }
      const bufferResized = fs.readFileSync(tempOutputFile);
      fs.unlinkSync(tempImageFile);
      fs.unlinkSync(tempOutputFile);
      resolve(bufferResized);
    });
  });
}


/**
 * Sanitizes the prompt by removing potentially dangerous characters for filenames.
 * Allows Unicode letters, numbers, spaces, and hyphens. Replaces newlines with spaces.
 * @param {string} prompt - The original prompt.
 * @returns {string} - The sanitized prompt.
 */
function sanitizePrompt(prompt) {
  return prompt
  //     .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')  // Remove control characters
  //     .replace(/[/\\?%*:|"<>]/g, '')                 // Remove characters illegal in filenames
  //     .replace(/\s+/g, ' ')                          // Replace multiple spaces and newlines with a single space
  //     .replace(/[^\p{L}\p{N}\s-]/gu, '')             // Keep Unicode letters, numbers, spaces, and hyphens
  //     .trim();                                       // Remove leading and trailing whitespace
}
