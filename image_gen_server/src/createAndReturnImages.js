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
import { addPollinationsLogoWithImagemagick, getLogoPath, resizeImage } from './imageOperations.js';

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

  const steps = concurrentRequests < 12 ? 4 : concurrentRequests < 18 ? 3 : concurrentRequests < 28 ? 2 : 1;

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
 * Creates and returns images with optional logo and metadata, checking for NSFW content.
 * @param {{ jobs: Job[], safeParams: Object, concurrentRequests: number, ip: string }} params
 * @returns {Promise<Array<{ buffer: Buffer, isChild: boolean, isMature: boolean }>>}
 */
export async function createAndReturnImageCached(prompt, safeParams, concurrentRequests, originalPrompt) {
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
  bufferWithLegend = await writeExifMetadata(bufferWithLegend, { prompt, originalPrompt, ...safeParams }, maturity);

  return { buffer: bufferWithLegend, isChild, isMature };

}
