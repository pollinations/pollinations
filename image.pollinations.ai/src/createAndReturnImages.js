import fetch from 'node-fetch';
import { fileTypeFromBuffer } from 'file-type';
import { addPollinationsLogoWithImagemagick, getLogoPath } from './imageOperations.js';
import { MODELS } from './models.js';
import { fetchFromLeastBusyFluxServer, getNextTurboServerUrl } from './availableServers.js';
import debug from 'debug';
import { checkContent } from './llamaguard.js';

const logError = debug('pollinations:error');
const logPerf = debug('pollinations:perf');
const logOps = debug('pollinations:ops');
const logCloudflare = debug('pollinations:cloudflare');

import { writeExifMetadata } from './writeExifMetadata.js';
import { sanitizeString } from './translateIfNecessary.js';
import sharp from 'sharp';
import sleep from 'await-sleep';

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
    const steps = Math.max(1, Math.round(4 - ((concurrentRequests - 2) * (3 - 1)) / (10 - 2)));
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
 * Calls the Cloudflare AI API to generate images using the specified model
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @param {string} modelPath - The Cloudflare AI model path
 * @param {Object} [additionalParams={}] - Additional parameters specific to the model
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
async function callCloudflareModel(prompt, safeParams, modelPath, additionalParams = {}) {
  const { accountId, apiToken } = getCloudflareCredentials();
  
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare credentials not configured');
  }

  // Limit prompt to 2048 characters
  const truncatedPrompt = prompt.slice(0, 2048);

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/${modelPath}`;
  logCloudflare(`Calling Cloudflare model: ${modelPath}`, url);

  // Round width and height to nearest multiple of 8
  const width = roundToMultipleOf8(safeParams.width || 1024);
  const height = roundToMultipleOf8(safeParams.height || 1024);

  const requestBody = {
    prompt: truncatedPrompt,
    width: width,
    height: height,
    seed: safeParams.seed || Math.floor(Math.random() * 1000000),
    ...additionalParams
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  // Check if response is successful
  if (!response.ok) {
    const errorText = await response.text();
    logError(`Cloudflare ${modelPath} API request failed, status:`, response.status, 'response:', errorText);
    throw new Error(`Cloudflare ${modelPath} API request failed with status ${response.status}: ${errorText}`);
  }

  // Check content type to determine how to handle the response
  const contentType = response.headers.get('content-type');
  let imageBuffer;

  if (contentType && contentType.includes('image/')) {
    // Direct binary image response (typical for SDXL)
    logCloudflare(`Received binary image from Cloudflare ${modelPath}`);
    imageBuffer = await response.buffer();
  } else {
    // JSON response with base64 encoded image (typical for Flux)
    const data = await response.json();
    if (!data.success) {
      logError(`Cloudflare ${modelPath} API request failed, full response:`, data);
      throw new Error(data.errors?.[0]?.message || `Cloudflare ${modelPath} API request failed`);
    }
    if (!data.result?.image) {
      throw new Error('No image in response');
    }
    imageBuffer = Buffer.from(data.result.image, 'base64');
  }
  
  return { buffer: imageBuffer, isMature: false, isChild: false };
}

/**
 * Calls the Cloudflare Flux API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
async function callCloudflareFlux(prompt, safeParams) {
  return callCloudflareModel(prompt, safeParams, 'black-forest-labs/flux-1-schnell', { steps: 4 });
}

/**
 * Calls the Cloudflare SDXL API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
async function callCloudflareSDXL(prompt, safeParams) {
  return callCloudflareModel(prompt, safeParams, 'bytedance/stable-diffusion-xl-lightning');
}

/**
 * Rounds a number to the nearest multiple of 8
 * @param {number} n - Number to round
 * @returns {number} - Nearest multiple of 8
 */
function roundToMultipleOf8(n) {
  return Math.round(n / 8) * 8;
}

/**
 * Common Cloudflare API configuration
 * @returns {{accountId: string, apiToken: string}} Cloudflare credentials
 */
function getCloudflareCredentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  return { accountId, apiToken };
}

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
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - Parameters for image generation.
 * @param {number} concurrentRequests - Number of concurrent requests.
 * @param {string} originalPrompt - The original prompt before any transformations.
 * @param {Object} progress - Progress tracking object.
 * @param {string} requestId - Request ID for progress tracking.
 * @param {boolean} wasTransformedForBadDomain - Flag indicating if the prompt was transformed due to bad domain.
 * @returns {Promise<{buffer: Buffer, isChild: boolean, isMature: boolean}>}
 */
export async function createAndReturnImageCached(prompt, safeParams, concurrentRequests, originalPrompt, progress, requestId, wasTransformedForBadDomain = false) {
  try {
    // Update generation progress
    if (progress) progress.updateBar(requestId, 60, 'Generation', 'Calling API...');
    let bufferAndMaturity;

    // Try Cloudflare Flux first if model is 'flux'
    if (safeParams.model === 'flux') {
      try {
        if (progress) progress.updateBar(requestId, 30, 'Processing', 'Trying Cloudflare Flux...');
        bufferAndMaturity = await callCloudflareFlux(prompt, safeParams);
      } catch (error) {
        logError('Cloudflare Flux failed, trying SDXL:', error.message);
        try {
          if (progress) progress.updateBar(requestId, 35, 'Processing', 'Trying Cloudflare SDXL...');
          bufferAndMaturity = await callCloudflareSDXL(prompt, safeParams);
        } catch (sdxlError) {
          logError('Cloudflare SDXL failed, falling back to ComfyUI:', sdxlError.message);
          // Fall through to ComfyUI
        }
      }
    }
    if (!bufferAndMaturity)
      bufferAndMaturity = await callComfyUI(prompt, safeParams, concurrentRequests);

    if (progress) progress.updateBar(requestId, 70, 'Generation', 'API call complete');
    if (progress) progress.updateBar(requestId, 75, 'Processing', 'Checking safety...');

    logError("bufferAndMaturity", bufferAndMaturity);

    // Get initial values from model
    let isMature = bufferAndMaturity?.isMature || bufferAndMaturity?.has_nsfw_concept;
    const concept = bufferAndMaturity?.concept;
    let isChild = bufferAndMaturity?.isChild || Object.values(concept?.special_scores || {})?.slice(1).some(score => score > -0.05);

    // // Check with LlamaGuard and override if necessary
    // try {

    //     const llamaguardResult = await checkContent(prompt);
        
    //     // Override safety flags if LlamaGuard detects issues
    //     if (llamaguardResult.isMature) {
    //         isMature = true;
    //         log('LlamaGuard detected mature content, overriding isMature to true');
    //     }
        
    //     if (llamaguardResult.isChild) {
    //         isChild = true;
    //         log('LlamaGuard detected child exploitation content, overriding isChild to true');
    //     }
    // } catch (error) {
    //     logError('LlamaGuard check failed:', error);
    //     // Continue with original model classifications if LlamaGuard fails
    // }

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
    
    // Metadata preparation - handle bad domain transformation
    // When a prompt was transformed due to bad domain, always use the original prompt in metadata
    // This ensures clients never see the transformed prompt
    const metadataObj = wasTransformedForBadDomain ? 
      { ...safeParams, prompt: originalPrompt, originalPrompt } : 
      { prompt, originalPrompt, ...safeParams };
    
    bufferWithLegend = await writeExifMetadata(bufferWithLegend, metadataObj, maturity);

    // if isChild is true and isMature is true throw a content is prohibited error
    // if (isChild && isMature) {
    //   throw new Error("Content is prohibited");
    // }
    return { buffer: bufferWithLegend, isChild, isMature };
  } catch (error) {
    logError('Error in createAndReturnImageCached:', error);
    throw error;
  }
}
