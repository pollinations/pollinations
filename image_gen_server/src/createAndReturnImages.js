import { exec } from 'child_process';
import fetch from 'node-fetch';
import tempfile from 'tempfile';
import fs from 'fs';
// import { sendToFeedListeners } from './feedListeners.js';
import FormData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';
import { getNextFluxServerUrl } from './availableServers.js';
import { writeExifMetadata } from './writeExifMetadata.js';
import { MODELS } from './models.js';
import { sanitizeString } from './translateIfNecessary.js';

const SERVER_URL = 'http://ec2-34-197-29-104.compute-1.amazonaws.com:5002/generate';
const MEOOW_SERVER_URL = 'https://api.airforce/imagine';

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

  const steps = concurrentRequests < 8 ? 4 : concurrentRequests < 14 ? 3 : concurrentRequests < 24 ? 2 : 1;

  try {
    prompt = sanitizeString(prompt);
    const body = {
      "prompts": [prompt],
      "width": safeParams.width,
      "height": safeParams.height,
      "seed": safeParams.seed,
      "negative_prompt": safeParams.negative_prompt,
      "steps": steps
    };

    console.log("calling prompt", body.prompts, "width", body.width, "height", body.height);

    // Start timing for fetch
    const fetch_start_time = Date.now();

    // Retry logic for fetch
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const chosenServer = safeParams.model === 'flux' ? getNextFluxServerUrl() : SERVER_URL;
        response = await fetch(chosenServer, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (response.ok) break; // If response is ok, break out of the loop
        console.error("Error from server. input was", body);
        throw new Error(`Server responded with ${response.status}. Server url: ${chosenServer}`);
      } catch (error) {
        console.error(`Fetch attempt ${attempt} failed: ${error.message}`);
        if (attempt === 5) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
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
      throw new Error(`Server responded with ${response}`);
    }

    const jsonResponse = await response.json();

    const { image, ...rest } = Array.isArray(jsonResponse) ? jsonResponse[0] : jsonResponse;

    if (!image) {
      console.error("image is null");
      throw new Error("image is null");
    }

    console.log("decoding base64 image");

    const buffer = Buffer.from(image, 'base64');

    return { buffer, ...rest };

  } catch (e) {
    console.error('Error in callWebUI:', e);
    throw e;
  }
};
/**
 * Calls the Meoow API with the given parameters and returns image buffers.
 * @param {string} prompt - The prompt for the image generation.
 * @param {Object} safeParams - The safe parameters for the image generation.
 * @returns {Promise<{buffer: Buffer, [key: string]: any}>}
 */
const callMeoow = async (prompt, safeParams) => {
  try {
    const url = new URL(MEOOW_SERVER_URL);
    prompt = sanitizeString(prompt);
    url.searchParams.append('prompt', prompt);

    const closestRatio = calculateClosestAspectRatio(safeParams.width, safeParams.height);

    url.searchParams.append('size', closestRatio);
    url.searchParams.append('seed', safeParams.seed);
    url.searchParams.append('model', safeParams.model);
    console.log("calling meoow", url.toString(), "aspect ratio", closestRatio);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const buffer = await response.buffer();
    return { buffer: buffer, has_nsfw_concept: false, concept: null };

  } catch (e) {
    console.error('Error in callMeoow:', e);
    throw e;
  }
};

/**
 * Calculates the closest aspect ratio from a list of predefined aspect ratios.
 * @param {number} width - The width of the image.
 * @param {number} height - The height of the image.
 * @returns {string} - The closest aspect ratio as a string.
 */
function calculateClosestAspectRatio(width, height) {
  const aspectRatios = ['1:1', '16:9', '9:16', '21:9', '9:21', '1:2', '2:1'];
  const ratio = width / height;
  let closestRatio = aspectRatios[0];
  let closestDifference = Math.abs(ratio - 1);

  aspectRatios.forEach(ar => {
    const [w, h] = ar.split(':').map(Number);
    const arRatio = w / h;
    const difference = Math.abs(ratio - arRatio);
    if (difference < closestDifference) {
      closestDifference = difference;
      closestRatio = ar;
    }
  });

  return closestRatio;
}

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

/**
 * Creates and returns images with optional logo and metadata, checking for NSFW content.
 * @param {{ jobs: Job[], safeParams: Object, concurrentRequests: number, ip: string }} params
 * @returns {Promise<Array<{ buffer: Buffer, isChild: boolean, isMature: boolean }>>}
 */
export async function createAndReturnImageCached(prompt, safeParams, concurrentRequests) {
  let bufferAndMaturity;
  const meoowModels = Object.keys(MODELS).filter(model => MODELS[model].type === 'meoow');
  if (meoowModels.includes(safeParams.model)) {
    bufferAndMaturity = await callMeoow(prompt, safeParams);
  } else {
    bufferAndMaturity = await callWebUI(prompt, safeParams, concurrentRequests);
  }

  let isMature = bufferAndMaturity.has_nsfw_concept;
  const concept = bufferAndMaturity.concept;
  const isChild = Object.values(concept?.special_scores || {})?.some(score => score > -0.05);
  console.error("isMature", isMature, "concepts", isChild);

  const logoPath = getLogoPath(safeParams, isChild, isMature);
  let bufferWithLegend = !logoPath ? bufferAndMaturity.buffer : await addPollinationsLogoWithImagemagick(bufferAndMaturity.buffer, logoPath, safeParams);

  //Resize the final image to the user's desired size
  bufferWithLegend = await resizeImage(bufferWithLegend, safeParams.width, safeParams.height);

  // // blure image if isChild && isMature
  // if (isChild && isMature) {
  //   bufferWithLegend = await blurImage(bufferWithLegend);
  // }

  // if (isChild) isMature = true;

  const { buffer: _buffer, ...maturity } = bufferAndMaturity;
  bufferWithLegend = await writeExifMetadata(bufferWithLegend, safeParams, maturity);

  return { buffer: bufferWithLegend, isChild, isMature };

}

/**
 * Determines the appropriate logo path based on the parameters and maturity flags.
 * @param {Object} safeParams - The safe parameters for the image generation.
 * @param {boolean} isChild - Flag indicating if the image is considered child content.
 * @param {boolean} isMature - Flag indicating if the image is considered mature content.
 * @returns {string|null} - The path to the logo file or null if no logo should be added.
 */
function getLogoPath(safeParams, isChild, isMature) {
  if (safeParams["nologo"] || safeParams["nofeed"] || isChild || isMature) {
    return null;
  }
  return MODELS[safeParams.model].type === 'meoow' ? 'logo_meoow.png' : 'logo.png';
}

/**
 * Adds a logo to the image using ImageMagick.
 * @param {Buffer} buffer - The image buffer.
 * @param {string} logoPath - The path to the logo file.
 * @param {Object} safeParams - Parameters for adjusting the logo size.
 * @returns {Promise<Buffer>} - The image buffer with the logo added.
 */
async function addPollinationsLogoWithImagemagick(buffer, logoPath, safeParams) {
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
async function blurImage(buffer, size = 12) {
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

