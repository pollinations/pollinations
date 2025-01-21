import fetch from 'node-fetch';
import { fileTypeFromBuffer } from 'file-type';
import { addPollinationsLogoWithImagemagick, getLogoPath } from './imageOperations.js';
import { MODELS } from './models.js';
import { fetchFromLeastBusyFluxServer, getNextTurboServerUrl } from './availableServers.js';
import debug from 'debug';

const logError = debug('pollinations:error');
const logPerf = debug('pollinations:perf');
const logOps = debug('pollinations:ops');
const logMeoow = debug('pollinations:meoow');

import { writeExifMetadata } from './writeExifMetadata.js';
import { sanitizeString } from './translateIfNecessary.js';
import sharp from 'sharp';
import sleep from 'await-sleep';

const MEOOW_SERVER_URL = 'https://api.airforce/imagine';
const MEOOW_2_SERVER_URL = 'https://cablyai.com/v1/images/generations';
const MEOOW_2_API_KEY = process.env.MEOOW_2_API_KEY;
// const TURBO_SERVER_URL = 'http://54.91.176.109:5003/generate';
let total_start_time = Date.now();
let accumulated_fetch_duration = 0;

const TARGET_PIXEL_COUNT = 1024 * 1024; // 1 megapixel

/**
 * Calculates scaled dimensions while maintaining aspect ratio
 * @param {number} width - Original width
 * @param {number} height - Original height
 * @returns {{ scaledWidth: number, scaledHeight: number, scalingFactor: number }}
 */
export function calculateScaledDimensions(width, height) {
  const currentPixels = width * height;
  if (currentPixels >= TARGET_PIXEL_COUNT) {
    return { scaledWidth: width, scaledHeight: height, scalingFactor: 1 };
  }

  const scalingFactor = Math.sqrt(TARGET_PIXEL_COUNT / currentPixels);
  const scaledWidth = Math.round(width * scalingFactor);
  const scaledHeight = Math.round(height * scalingFactor);

  return { scaledWidth, scaledHeight, scalingFactor };
}

async function fetchFromTurboServer(params) {
  const host = await getNextTurboServerUrl();
  return fetch(`${host}/generate`, params);
}

/**
 * Calls the ComfyUI API to generate images.
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - The parameters for image generation.
 * @param {number} concurrentRequests - The number of concurrent requests.
 * @returns {Promise<Array>} - The generated images.
 */

/**
 * Calls the Web UI with the given parameters and returns image buffers.
 * @param {{ jobs: Job[], safeParams: Object, concurrentRequests: number, ip: string }} params
 * @returns {Promise<Array<{buffer: Buffer, [key: string]: any}>>}
 */
export const callComfyUI = async (prompt, safeParams, concurrentRequests) => {
  try {
    logOps("concurrent requests", concurrentRequests, "safeParams", safeParams);

    // Linear scaling of steps between 6 (at concurrentRequests=2) and 1 (at concurrentRequests=36)
    const steps = Math.max(1, Math.round(4 - ((concurrentRequests - 2) * (4 - 1)) / (36 - 2)));
    logOps("calculated_steps", steps);

    prompt = sanitizeString(prompt);
    
    // Calculate scaled dimensions
    const { scaledWidth, scaledHeight, scalingFactor } = calculateScaledDimensions(
      safeParams.width, 
      safeParams.height
    );

    const body = {
      "prompts": [prompt],
      "width": scaledWidth,
      "height": scaledHeight,
      "seed": safeParams.seed,
      "negative_prompt": safeParams.negative_prompt,
      "steps": steps
    };

    logOps("calling prompt", body.prompts, "width", body.width, "height", body.height);

    // Start timing for fetch
    const fetch_start_time = Date.now();

    // Retry logic for fetch
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const fetchFunction = safeParams.model === "turbo" ? fetchFromTurboServer : fetchFromLeastBusyFluxServer;
        response = await fetchFunction({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (response.ok) break; // If response is ok, break out of the loop
        logError("Error from server. input was", body);
        throw new Error(`Server responded with ${response.status}`);
      } catch (error) {
        logError(`Fetch attempt ${attempt} failed: ${error.message}`);
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      }
    }

    const fetch_end_time = Date.now();

    // Calculate the time spent in fetch
    const fetch_duration = fetch_end_time - fetch_start_time;
    logPerf(`Fetch duration: ${fetch_duration}ms`);
    accumulated_fetch_duration += fetch_duration;

    // Calculate the total time the app has been running
    const total_time = Date.now() - total_start_time;

    // Calculate and print the percentage of time spent in fetch
    const fetch_percentage = (accumulated_fetch_duration / total_time) * 100;
    logPerf(`Fetch time percentage: ${fetch_percentage}%`);

    if (!response?.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const jsonResponse = await response.json();

    const { image, ...rest } = Array.isArray(jsonResponse) ? jsonResponse[0] : jsonResponse;

    if (!image) {
      logError("image is null");
      throw new Error("image is null");
    }

    logOps("decoding base64 image");

    const buffer = Buffer.from(image, 'base64');

    // Resize back to original dimensions if scaling was applied
    if (scalingFactor > 1) {
      const resizedBuffer = await sharp(buffer)
        .resize(safeParams.width, safeParams.height, {
          fit: 'fill',
          withoutEnlargement: false
        })
        .jpeg()
        .toBuffer();
      return { buffer: resizedBuffer, ...rest };
    }

    // Convert to JPEG even if no resize was needed
    const jpegBuffer = await sharp(buffer)
      .jpeg({
        quality: 90,
        mozjpeg: true
      })
      .toBuffer();
    return { buffer: jpegBuffer, ...rest };

  } catch (e) {
    logError('Error in callComfyUI:', e);
    throw e;
  }
};

/**
 * Calls the Meoow API with the given parameters and returns image buffers.
 * @param {string} prompt - The prompt for the image generation.
 * @param {Object} safeParams - The safe parameters for the image generation.
 * @returns {Promise<{buffer: Buffer, [key: string]: any}>}
 */
export async function callMeoow(prompt, safeParams) {
  try {
    const url = new URL(MEOOW_SERVER_URL);
    prompt = sanitizeString(prompt);
    // calculate a unique 4 digit seed for this prompt
    // it should depend on the prompt text
    const seedHack = prompt.split(' ').reduce((acc, word) => acc + word.charCodeAt(0), 0) % 10000;

    url.searchParams.append('prompt', `#${seedHack} - ${prompt}`);

    const closestRatio = calculateClosestAspectRatio(safeParams.width, safeParams.height);

    url.searchParams.append('size', closestRatio);
    url.searchParams.append('seed', safeParams.seed);
    url.searchParams.append('model', safeParams.model);
    logMeoow("calling meoow", url.toString(), "aspect ratio", closestRatio);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const contentType = response.headers.get('content-type');
    if (!response.ok || (contentType && contentType.includes('text'))) {
      const errorText = await response.text();
      throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }

    const buffer = await response.buffer();
    return { buffer: buffer, has_nsfw_concept: false, concept: null };

  } catch (e) {
    logError('Error in callMeoow:', e);
    throw e;
  }
};

/**
 * Calls the Meoow-2 API with the given parameters and returns image buffers.
 * @param {string} prompt - The prompt for the image generation.
 * @param {Object} safeParams - The safe parameters for the image generation.
 * @returns {Promise<{buffer: Buffer, [key: string]: any}>}
 */
export async function callMeoow2(prompt, safeParams) {
  try {
    prompt = sanitizeString(prompt);
    const body = {
      prompt: prompt,
      n: 1,
      size: `${safeParams.width}x${safeParams.height}`,
      response_format: 'url',
      model: safeParams.model === 'flux-pro' ? 'flux-pro' : 'flux-1.1-pro',
    };

    logMeoow("calling meoow-2", body);
    const response = await fetch(MEOOW_2_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MEOOW_2_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }

    const jsonResponse = await response.json();
    const imageUrl = jsonResponse.data[0].url;
    await sleep(500);
    // Fetch the image from the URL
    const imageResponse = await fetch(imageUrl);
    const buffer = await imageResponse.buffer();

    return { buffer: buffer, has_nsfw_concept: false, concept: null };

  } catch (e) {
    logError('Error in callMeoow2:', e);
    throw e;
  }
};

/**
 * Calculates the closest aspect ratio from a list of predefined aspect ratios.
 * @param {number} width - The width of the image.
 * @param {number} height - The height of the image.
 * @returns {string} - The closest aspect ratio as a string.
 */
export function calculateClosestAspectRatio(width, height) {
  const aspectRatio = width / height
  const ratios = {
    '1:1': 1,
    '4:3': 4/3,
    '16:9': 16/9,
    '3:2': 3/2
  }

  let closestRatio = '1:1'
  let minDiff = Math.abs(aspectRatio - 1)

  for (const [ratio, value] of Object.entries(ratios)) {
    const diff = Math.abs(aspectRatio - value)
    if (diff < minDiff) {
      minDiff = diff
      closestRatio = ratio
    }
  }

  return closestRatio
}

/**
 * Converts an image buffer to JPEG format if it's not already a JPEG.
 * @param {Buffer} buffer - The image buffer to convert.
 * @returns {Promise<Buffer>} - The converted image buffer.
 */
export async function convertToJpeg(buffer) {
  try {
    const fileType = await fileTypeFromBuffer(buffer);
    if (!fileType || (fileType.ext !== 'jpg' && fileType.ext !== 'jpeg')) {
      const result = await sharp(buffer).jpeg().toBuffer();
      return result;
    }
    return buffer;
  } catch (error) {
    throw error;
  }
}

/**
 * Creates and returns images with optional logo and metadata, checking for NSFW content.
 * @param {{ jobs: Job[], safeParams: Object, concurrentRequests: number, ip: string }} params
 * @returns {Promise<Array<{ buffer: Buffer, isChild: boolean, isMature: boolean }>>}
 */
export async function createAndReturnImageCached(prompt, safeParams, concurrentRequests, originalPrompt, progress, requestId) {
  let bufferAndMaturity;
  const meoowModels = Object.keys(MODELS).filter(model => MODELS[model].type === 'meoow');
  const meoow2Models = Object.keys(MODELS).filter(model => MODELS[model].type === 'meoow-2');
  
  // Update generation progress
  if (progress) progress.updateBar(requestId, 60, 'Generation', 'Calling API...');
  
  if (meoowModels.includes(safeParams.model)) {
    bufferAndMaturity = await callMeoow(prompt, safeParams);
  } else if (meoow2Models.includes(safeParams.model)) {
    bufferAndMaturity = await callMeoow2(prompt, safeParams);
  } else {
    bufferAndMaturity = await callComfyUI(prompt, safeParams, concurrentRequests);
  }
  
  if (progress) progress.updateBar(requestId, 70, 'Generation', 'API call complete');
  if (progress) progress.updateBar(requestId, 75, 'Processing', 'Checking safety...');

  logError("bufferAndMaturity", bufferAndMaturity);

  let isMature = bufferAndMaturity?.has_nsfw_concept;
  const concept = bufferAndMaturity?.concept;
  const isChild = Object.values(concept?.special_scores || {})?.slice(1).some(score => score > -0.05);
  logError("isMature", isMature, "concepts", isChild);

  // Throw error if NSFW content is detected and safe mode is enabled
  if (safeParams.safe && isMature) {
    throw new Error("NSFW content detected. This request cannot be fulfilled when safe mode is enabled.");
  }

  if (progress) progress.updateBar(requestId, 80, 'Processing', 'Adding logo...');
  const logoPath = getLogoPath(safeParams, isChild, isMature);
  let bufferWithLegend = !logoPath ? bufferAndMaturity.buffer : await addPollinationsLogoWithImagemagick(bufferAndMaturity.buffer, logoPath, safeParams);

  if (progress) progress.updateBar(requestId, 85, 'Processing', 'Converting format...');
  // Convert the buffer to JPEG if it is not already in JPEG format
  bufferWithLegend = await convertToJpeg(bufferWithLegend);

  if (progress) progress.updateBar(requestId, 90, 'Processing', 'Writing metadata...');
  const { buffer: _buffer, ...maturity } = bufferAndMaturity;
  bufferWithLegend = await writeExifMetadata(bufferWithLegend, { prompt, originalPrompt, ...safeParams }, maturity);

  return { buffer: bufferWithLegend, isChild, isMature };
}
