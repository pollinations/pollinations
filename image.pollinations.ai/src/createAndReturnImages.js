import fetch from 'node-fetch';
import { fileTypeFromBuffer } from 'file-type';
import { addPollinationsLogoWithImagemagick, getLogoPath } from './imageOperations.js';
import FormData from 'form-data';
import { fetchFromLeastBusyFluxServer, getNextTurboServerUrl } from './availableServers.js';
import debug from 'debug';
import { writeExifMetadata } from './writeExifMetadata.js';
import { sanitizeString } from './translateIfNecessary.js';
// Import shared authentication utilities
import sharp from 'sharp';
import dotenv from 'dotenv';

dotenv.config();

// Loggers
const logError = debug('pollinations:error');
const logPerf = debug('pollinations:perf');
const logOps = debug('pollinations:ops');
const logCloudflare = debug('pollinations:cloudflare');

// Constants
const TARGET_PIXEL_COUNT = 1024 * 1024; // 1 megapixel

// Performance tracking variables
let total_start_time = Date.now();
let accumulated_fetch_duration = 0;

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

    // Single attempt - no retry logic
    let response;
    try {
      const fetchFunction = safeParams.model === "turbo" ? fetchFromTurboServer : fetchFromLeastBusyFluxServer;
      response = await fetchFunction({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        logError("Error from server. input was", body);
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (error) {
      logError(`Fetch failed: ${error.message}`);
      throw error;
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

  logCloudflare(`Cloudflare ${modelPath} request body:`, JSON.stringify(requestBody, null, 2));

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
    logError(`Cloudflare ${modelPath} API request headers:`, JSON.stringify(Object.fromEntries([...response.headers]), null, 2));
    throw new Error(`Cloudflare ${modelPath} API request failed with status ${response.status}: ${errorText}`);
  }

  // Check content type to determine how to handle the response
  const contentType = response.headers.get('content-type');
  let imageBuffer;

  if (contentType && contentType.includes('image/')) {
    // Direct binary image response (typical for SDXL)
    logCloudflare(`Received binary image from Cloudflare ${modelPath} with content type: ${contentType}`);
    imageBuffer = await response.buffer();
    logCloudflare(`Image buffer size: ${imageBuffer.length} bytes`);
  } else {
    // JSON response with base64 encoded image (typical for Flux)
    const data = await response.json();
    logCloudflare(`Received JSON response from Cloudflare ${modelPath}:`, JSON.stringify(data, null, 2));
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
 * Calls the Cloudflare Dreamshaper API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
async function callCloudflareDreamshaper(prompt, safeParams) {
  try {
    // Append seed to prompt if it's non-default
    let modifiedPrompt = prompt;
    if (safeParams.seed && safeParams.seed !== 42) {
      modifiedPrompt = `${prompt}, seed:${safeParams.seed}`;
    }
    
    // Create a minimal params object with only width and height
    const dreamshaperParams = {
      width: safeParams.width || 1024,
      height: safeParams.height || 1024
    };
    
    // Create a modified safeParams without the seed
    const modifiedSafeParams = { ...safeParams };
    delete modifiedSafeParams.seed;
    
    // Call the model with the minimal parameters
    logCloudflare(`Using Dreamshaper with prompt: ${modifiedPrompt} and parameters:`, JSON.stringify(dreamshaperParams, null, 2));
    const result = await callCloudflareModel(modifiedPrompt, modifiedSafeParams, 'lykon/dreamshaper-8-lcm', dreamshaperParams);
    return result;
  } catch (error) {
    // Log detailed error information
    logError('Dreamshaper detailed error:', error);
    if (error.response) {
      try {
        const responseText = await error.response.text();
        logError('Dreamshaper response text:', responseText);
      } catch (textError) {
        logError('Could not get response text:', textError.message);
      }
    }
    throw error;
  }
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
 * Updates progress bar if progress object is available
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @param {number} percentage - Progress percentage
 * @param {string} stage - Current stage of processing
 * @param {string} message - Progress message
 */
const updateProgress = (progress, requestId, percentage, stage, message) => {
  if (progress) {
    progress.updateBar(requestId, percentage, stage, message);
  }
};

/**
 * Helper function to call Azure GPT Image with specific endpoint
 * @param {string} prompt - The prompt for image generation or editing
 * @param {Object} safeParams - The parameters for image generation or editing
 * @param {Object} userInfo - User authentication info object
 * @param {number} endpointIndex - The endpoint index to use (1 or 2)
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
const callAzureGPTImageWithEndpoint = async (prompt, safeParams, userInfo, endpointIndex) => {
  const apiKey = process.env[`GPT_IMAGE_${endpointIndex}_AZURE_API_KEY`];
  let endpoint = process.env[`GPT_IMAGE_${endpointIndex}_ENDPOINT`];
  
  if (!apiKey || !endpoint) {
    throw new Error(`Azure API key or endpoint ${endpointIndex} not found in environment variables`);
  }
  
  // Check if we need to use the edits endpoint instead of generations
  const isEditMode = safeParams.image && safeParams.image.length > 0;
  if (isEditMode) {
    // Replace 'generations' with 'edits' in the endpoint URL
    endpoint = endpoint.replace('/images/generations', '/images/edits');
    logCloudflare(`Using Azure endpoint ${endpointIndex} in edit mode`);
  } else {
    logCloudflare(`Using Azure endpoint ${endpointIndex} in generation mode`);
  }

  // Map safeParams to Azure API parameters
  const size = `${safeParams.width}x${safeParams.height}`;
  
  // Determine quality based on safeParams or use medium as default
  const quality = safeParams.quality || 'medium';
  
  // Set output format to png for best quality
  const outputFormat = 'jpeg';
  
  // Default compression to 100 (best quality)
  const outputCompression = 70;
  
  // Build request body
  const requestBody = {
    prompt: sanitizeString(prompt),
    size:"auto",
    quality,
    output_format: outputFormat,
    output_compression: outputCompression,
    moderation: "low",
    n: 1
  };
  
  // We'll only use the requestBody for generation mode
  // For edit mode, we'll use FormData instead
  
  // Note: Azure GPT Image API doesn't support the 'seed' parameter
  // We'll log the seed for reference but not include it in the request
  if (safeParams.seed) {
    logCloudflare(`Seed value ${safeParams.seed} not supported by Azure GPT Image API, ignoring`);
  }
  
  logCloudflare('Calling Azure GPT Image API with params:', requestBody);
  
  let response;
  
  if (isEditMode) {
    // For edit mode, always use FormData (multipart/form-data)
    const formData = new FormData();
    
    // Add the prompt
    formData.append('prompt', sanitizeString(prompt));
    
    // Handle images based on their type
    try {
      // Convert to array if it's a string (backward compatible)
      const imageUrls = Array.isArray(safeParams.image) ? safeParams.image : [safeParams.image];
      
      if (imageUrls.length === 0) {
          // Handle errors for missing image
          throw new Error('Image URL is required for GPT Image edit mode but was not provided');
      }
      
      // Process each image in the array
      for (let i = 0; i < imageUrls.length; i++) {
          const imageUrl = imageUrls[i];
          logCloudflare(`Fetching image ${i+1}/${imageUrls.length} from URL: ${imageUrl}`);
          
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
              throw new Error(`Failed to fetch image from URL: ${imageUrl}`);
          }
          
          const buffer = await imageResponse.buffer();
          
          // Determine file extension from Content-Type header
          const contentType = imageResponse.headers.get('content-type') || '';
          let extension = '.png'; // Default extension
          
          // Extract extension from content type (e.g., "image/jpeg" -> "jpeg")
          if (contentType.startsWith('image/')) {
              const mimeExtension = contentType.split('/')[1].split(';')[0]; // Handle cases like "image/jpeg; charset=utf-8"
              extension = `.${mimeExtension}`;
          }
          
          // Use the image[] array notation as required by Azure OpenAI API
          formData.append('image[]', buffer, { filename: `image${i}${extension}` });
      }
    } catch (error) {
      logError('Error processing image for editing:', error);
      throw new Error(`Failed to process image: ${error.message}`);
    }
    
    // Add other parameters
    formData.append('quality', quality);
    formData.append('n', '1');
    
    // Log the endpoint and headers for debugging
    logCloudflare(`Sending edit request to endpoint: ${endpoint}`);
    
    // Get the headers from formData
    const formHeaders = formData.getHeaders();
    
    // Single attempt - no retry logic
    response = await fetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          ...formHeaders,
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      }
    );
    
    logCloudflare(`Edit request response status: ${response.status}`);
  } else {
    // Standard JSON request for generation - single attempt, no retry logic
    response = await fetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      }
    );
  }
  
  if (!response.ok) {
    // Clone the response before consuming its body
    const errorResponse = response.clone();
    try {
      const errorText = await errorResponse.text();
      throw new Error(`Azure GPT Image API error: ${response.status} - error ${errorText}`);
    } catch (textError) {
      // If we can't read the response as text, just throw with the status
      throw textError;
    }
  }
  
  const data = await response.json();
  
  if (!data.data || !data.data[0] || !data.data[0].b64_json) {
    throw new Error('Invalid response from Azure GPT Image API');
  }
  
  // Convert base64 to buffer
  const imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');
  
  // Azure doesn't provide content safety information directly, so we'll set defaults
  // In a production environment, you might want to use a separate content moderation service
  return {
    buffer: imageBuffer,
    isMature: false,  // Default assumption
    isChild: false,   // Default assumption
  };
};

/**
 * Calls the Azure GPT Image API to generate or edit images
 * @param {string} prompt - The prompt for image generation or editing
 * @param {Object} safeParams - The parameters for image generation or editing
 * @param {Object} userInfo - Complete user authentication info object with authenticated, userId, tier, etc.
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
export const callAzureGPTImage = async (prompt, safeParams, userInfo = {}) => {
  try {
    // Extract user tier with fallback to 'seed'
    const userTier = userInfo.tier || 'seed';
    
    // Stage-based endpoint selection instead of random
    // seed stage → GPT_IMAGE_1_ENDPOINT (standard endpoint)
    // flower/nectar stage → GPT_IMAGE_2_ENDPOINT (advanced endpoint)
    // const endpointIndex = (userTier === 'seed') ? 1 : 2;
    
    const endpointIndex = userTier === 'seed' ? 2 : 1;
    logCloudflare(`Using Azure GPT Image endpoint ${endpointIndex} for user tier: ${userTier}`, userInfo.userId ? `(userId: ${userInfo.userId})` : '(anonymous)');
    
    try {
      // Try with the tier-appropriate endpoint first
      return await callAzureGPTImageWithEndpoint(prompt, safeParams, userInfo, endpointIndex);
    } catch (error) {
      // Only try fallback for higher tier users when endpoint 2 fails
      if (endpointIndex === 2) {
        logCloudflare(`Endpoint 2 failed, falling back to endpoint 1 for user: ${userInfo.userId || 'anonymous'}`);
        return await callAzureGPTImageWithEndpoint(prompt, safeParams, userInfo, 1);
      }
      // For seed tier users, just propagate the error
      throw error;
    }
  } catch (error) {
    logError('Error calling Azure GPT Image API:', error);
    throw error;
  }
};

/**
 * Generates an image using the appropriate model based on safeParams
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - Parameters for image generation
 * @param {number} concurrentRequests - Number of concurrent requests
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @param {Object} userInfo - Complete user authentication info object with authenticated, userId, tier, etc.
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean, [key: string]: any}>}
 */
const generateImage = async (prompt, safeParams, concurrentRequests, progress, requestId, userInfo) => {
  // Model selection strategy using a more functional approach
  if (safeParams.model === 'gptimage') {
    // Detailed logging of authentication info for GPT image access
    logError('GPT Image authentication check:', 
      userInfo ? 
        `authenticated=${userInfo.authenticated}, tokenAuth=${userInfo.tokenAuth}, referrerAuth=${userInfo.referrerAuth}, reason=${userInfo.reason}, userId=${userInfo.userId || 'none'}, tier=${userInfo.tier || 'none'}` 
        : 'No userInfo provided');
    
    // Restrict GPT Image model to users with valid authentication
    if (!userInfo || !userInfo.authenticated || userInfo.tier === 'seed') {
      const errorText = "We temporarily limited access to gpt-image-1 until Azure approves increased quota. Access to GPT Image model requires authentication. Please authenticate at https://auth.pollinations.ai and request a tier upgrade at https://github.com/pollinations/pollinations/issues/new?template=special-bee-request.yml";
      logError(errorText);
      progress.updateBar(requestId, 35, 'Auth', 'GPT Image requires authorization');
      throw new Error(errorText);      
    } else {
      // For gptimage model, always throw errors instead of falling back
      updateProgress(progress, requestId, 30, 'Processing', 'Trying Azure GPT Image...');
      try {
        return await callAzureGPTImage(prompt, safeParams, userInfo);
      } catch (error) {
        // Log the error but don't fall back - propagate it to the caller
        logError('Azure GPT Image failed:', error.message);
        progress.updateBar(requestId, 35, 'Error', 'GPT Image API error');
        throw error;
      }
    }
  }
  
  if (safeParams.model === 'flux') {
    try {
      updateProgress(progress, requestId, 30, 'Processing', 'Trying Cloudflare Flux...');
      return await callCloudflareFlux(prompt, safeParams);
    } catch (error) {
      logError('Cloudflare Flux failed, trying Dreamshaper:', error.message);
    }
  }
  try {
    return await callComfyUI(prompt, safeParams, concurrentRequests);
  } catch (error) {
    updateProgress(progress, requestId, 35, 'Processing', 'Trying Cloudflare Dreamshaper...');
    return await callCloudflareDreamshaper(prompt, safeParams);
  }
};

/**
 * Extracts and normalizes maturity flags from image generation result
 * @param {Object} result - The image generation result
 * @returns {{isMature: boolean, isChild: boolean}}
 */
const extractMaturityFlags = (result) => {
  const isMature = result?.isMature || result?.has_nsfw_concept;
  const concept = result?.concept;
  const isChild = result?.isChild || 
    Object.values(concept?.special_scores || {})?.slice(1).some(score => score > -0.05);
  
  return { isMature, isChild };
};

/**
 * Prepares metadata object based on prompt information and bad domain status
 * @param {string} prompt - The processed prompt
 * @param {string} originalPrompt - The original prompt before transformations
 * @param {Object} safeParams - Parameters for image generation
 * @param {boolean} wasTransformedForBadDomain - Flag indicating if prompt was transformed
 * @returns {Object} - Metadata object
 */
const prepareMetadata = (prompt, originalPrompt, safeParams, wasTransformedForBadDomain) => {
  // When a prompt was transformed due to bad domain, always use the original prompt in metadata
  // This ensures clients never see the transformed prompt
  return wasTransformedForBadDomain ? 
    { ...safeParams, prompt: originalPrompt, originalPrompt } : 
    { prompt, originalPrompt, ...safeParams };
};

/**
 * Processes the image buffer with logo, format conversion, and metadata
 * @param {Buffer} buffer - The raw image buffer
 * @param {Object} maturityFlags - Object containing isMature and isChild flags
 * @param {Object} safeParams - Parameters for image generation
 * @param {Object} metadataObj - Metadata to embed in the image
 * @param {Object} maturity - Additional maturity information
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<Buffer>} - The processed image buffer
 */
const processImageBuffer = async (buffer, maturityFlags, safeParams, metadataObj, maturity, progress, requestId) => {
  const { isMature, isChild } = maturityFlags;
  
  // Add logo
  updateProgress(progress, requestId, 80, 'Processing', 'Adding logo...');
  const logoPath = getLogoPath(safeParams, isChild, isMature);
  let processedBuffer = !logoPath ? buffer : 
    await addPollinationsLogoWithImagemagick(buffer, logoPath, safeParams);
  
  // Convert format
  updateProgress(progress, requestId, 85, 'Processing', 'Converting format...');
  processedBuffer = await convertToJpeg(processedBuffer);
  
  // Add metadata
  updateProgress(progress, requestId, 90, 'Processing', 'Writing metadata...');
  return await writeExifMetadata(processedBuffer, metadataObj, maturity);
};

/**
 * Creates and returns images with optional logo and metadata, checking for NSFW content.
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - Parameters for image generation.
 * @param {number} concurrentRequests - Number of concurrent requests.
 * @param {string} originalPrompt - The original prompt before any transformations.
 * @param {Object} progress - Progress tracking object.
 * @param {string} requestId - Request ID for progress tracking.
 * @param {boolean} wasTransformedForBadDomain - Flag indicating if the prompt was transformed due to bad domain.
 * @param {Object} userInfo - Complete user authentication info object with authenticated, userId, tier, etc.
 * @returns {Promise<{buffer: Buffer, isChild: boolean, isMature: boolean}>}
 */
export async function createAndReturnImageCached(prompt, safeParams, concurrentRequests, originalPrompt, progress, requestId, wasTransformedForBadDomain = false, userInfo = {}) {
  try {
    // Update generation progress
    updateProgress(progress, requestId, 60, 'Generation', 'Calling API...');
    
    // Generate the image using the appropriate model
    const result = await generateImage(prompt, safeParams, concurrentRequests, progress, requestId, userInfo);
    updateProgress(progress, requestId, 70, 'Generation', 'API call complete');
    updateProgress(progress, requestId, 75, 'Processing', 'Checking safety...');
    
    // Extract maturity flags
    const maturityFlags = extractMaturityFlags(result);
    const { isMature, isChild } = maturityFlags;
    logError("isMature", isMature, "concepts", isChild);
    
    // Safety check
    if (safeParams.safe && isMature) {
      throw new Error("NSFW content detected. This request cannot be fulfilled when safe mode is enabled.");
    }
    
    // Prepare metadata
    const { buffer: _buffer, ...maturity } = result;
    const metadataObj = prepareMetadata(prompt, originalPrompt, safeParams, wasTransformedForBadDomain);
    
    // Process the image buffer
    const processedBuffer = await processImageBuffer(
      result.buffer,
      maturityFlags,
      safeParams,
      metadataObj,
      maturity,
      progress,
      requestId
    );
    
    return { buffer: processedBuffer, isChild, isMature };
  } catch (error) {
    logError('Error in createAndReturnImageCached:', error);
    throw error;
  }
}
