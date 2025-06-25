import fetch from 'node-fetch';
import debug from 'debug';
import dotenv from 'dotenv';

dotenv.config();

const logSora = debug('pollinations:sora');
const logError = debug('pollinations:error');

// Azure Sora API configuration
const AZURE_SORA_ENDPOINT = "https://thotlabssorafinal.cognitiveservices.azure.com";
const API_VERSION = "preview";

// Supported resolutions for Sora
const SUPPORTED_RESOLUTIONS = [
  [480, 480], [854, 480], [720, 720], [1280, 720], [1080, 1080], [1920, 1080]
];

// Poll interval in milliseconds
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_TIME = 300000; // 5 minutes maximum wait time

/**
 * Updates progress if progress object is available
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @param {number} percentage - Progress percentage
 * @param {string} stage - Current stage of processing
 * @param {string} message - Progress message
 */
function updateProgress(progress, requestId, percentage, stage, message) {
  if (progress && typeof progress.updateProgress === 'function') {
    progress.updateProgress(requestId, percentage, stage, message);
  }
}

/**
 * Validates and adjusts resolution to nearest supported size
 * @param {number} width - Requested width
 * @param {number} height - Requested height
 * @returns {{width: number, height: number}} - Valid resolution
 */
function validateResolution(width, height) {
  // Find the closest supported resolution
  let closestResolution = SUPPORTED_RESOLUTIONS[0];
  let minDistance = Infinity;
  
  for (const [supportedWidth, supportedHeight] of SUPPORTED_RESOLUTIONS) {
    const distance = Math.abs(width - supportedWidth) + Math.abs(height - supportedHeight);
    if (distance < minDistance) {
      minDistance = distance;
      closestResolution = [supportedWidth, supportedHeight];
    }
  }
  
  logSora(`Resolution adjusted from ${width}x${height} to ${closestResolution[0]}x${closestResolution[1]}`);
  return { width: closestResolution[0], height: closestResolution[1] };
}

/**
 * Creates a video generation job on Azure Sora API
 * @param {string} prompt - Video generation prompt
 * @param {Object} params - Generation parameters
 * @returns {Promise<string>} - Job ID
 */
async function createVideoJob(prompt, params) {
  const { width, height } = validateResolution(params.width || 480, params.height || 480);
  const duration = Math.min(Math.max(params.n_seconds || 5, 1), 10); // Clamp between 1-10 seconds
  
  const requestBody = {
    model: "sora",
    prompt: prompt,
    width: width,
    height: height,
    n_seconds: duration,
    n_variants: 1
  };
  
  logSora('Creating video job with params:', requestBody);
  
  const response = await fetch(`${AZURE_SORA_ENDPOINT}/openai/v1/video/generations/jobs?api-version=${API_VERSION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-key': process.env.AZURE_SORA_API_KEY
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    logError('Failed to create video job:', response.status, errorText);
    throw new Error(`Failed to create video job: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  logSora('Video job created:', result.id);
  return result.id;
}

/**
 * Polls job status until completion
 * @param {string} jobId - Job ID to poll
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<Object>} - Job result with generation info
 */
async function pollJobStatus(jobId, progress, requestId) {
  const startTime = Date.now();
  let attempts = 0;
  
  while (Date.now() - startTime < MAX_POLL_TIME) {
    attempts++;
    logSora(`Polling job ${jobId}, attempt ${attempts}`);
    
    const response = await fetch(`${AZURE_SORA_ENDPOINT}/openai/v1/video/generations/jobs/${jobId}?api-version=${API_VERSION}`, {
      headers: {
        'Api-key': process.env.AZURE_SORA_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logError('Failed to poll job status:', response.status, errorText);
      throw new Error(`Failed to poll job status: ${response.status} - ${errorText}`);
    }
    
    const jobStatus = await response.json();
    logSora(`Job ${jobId} status: ${jobStatus.status}`);
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    updateProgress(progress, requestId, 20 + (elapsed * 2), 'Generation', 
      `Video generation in progress... (${elapsed}s, status: ${jobStatus.status})`);
    
    if (jobStatus.status === 'succeeded') {
      logSora('Video generation completed successfully');
      return jobStatus;
    } else if (jobStatus.status === 'failed' || jobStatus.status === 'cancelled') {
      const reason = jobStatus.failure_reason || 'Unknown error';
      logError(`Video generation failed: ${jobStatus.status} - ${reason}`);
      throw new Error(`Video generation failed: ${jobStatus.status} - ${reason}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
  
  throw new Error(`Video generation timed out after ${MAX_POLL_TIME / 1000} seconds`);
}

/**
 * Downloads the generated video
 * @param {string} generationId - Generation ID from job result
 * @returns {Promise<Buffer>} - Video buffer
 */
async function downloadVideo(generationId) {
  logSora(`Downloading video for generation ${generationId}`);
  
  const response = await fetch(`${AZURE_SORA_ENDPOINT}/openai/v1/video/generations/${generationId}/content/video?api-version=${API_VERSION}`, {
    headers: {
      'Api-key': process.env.AZURE_SORA_API_KEY
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    logError('Failed to download video:', response.status, errorText);
    throw new Error(`Failed to download video: ${response.status} - ${errorText}`);
  }
  
  const buffer = await response.buffer();
  logSora(`Video downloaded, size: ${buffer.length} bytes`);
  return buffer;
}

/**
 * Generates a video using Azure Sora API with polling until completion
 * @param {string} prompt - Video generation prompt
 * @param {Object} safeParams - Parameters for video generation
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<{buffer: Buffer, contentType: string, metadata: Object}>}
 */
export async function generateSoraVideo(prompt, safeParams, progress, requestId) {
  try {
    if (!process.env.AZURE_SORA_API_KEY) {
      throw new Error('AZURE_SORA_API_KEY environment variable is required for Sora video generation');
    }
    
    logSora('Starting Sora video generation:', { prompt, params: safeParams });
    updateProgress(progress, requestId, 10, 'Initialize', 'Starting video generation...');
    
    // Create video generation job
    updateProgress(progress, requestId, 15, 'Initialize', 'Creating video job...');
    const jobId = await createVideoJob(prompt, safeParams);
    
    // Poll until completion
    updateProgress(progress, requestId, 20, 'Generation', 'Video generation started...');
    const jobResult = await pollJobStatus(jobId, progress, requestId);
    
    // Extract generation info
    const generations = jobResult.generations || [];
    if (generations.length === 0) {
      throw new Error('No video generations found in job result');
    }
    
    const generation = generations[0];
    const generationId = generation.id;
    
    // Download the video
    updateProgress(progress, requestId, 80, 'Download', 'Downloading video...');
    const videoBuffer = await downloadVideo(generationId);
    
    updateProgress(progress, requestId, 90, 'Complete', 'Video generation complete');
    
    // Prepare metadata
    const metadata = {
      prompt: prompt,
      model: 'sora',
      width: generation.width,
      height: generation.height,
      duration: generation.n_seconds,
      generationId: generationId,
      jobId: jobId,
      createdAt: new Date().toISOString()
    };
    
    logSora('Video generation completed successfully', {
      size: videoBuffer.length,
      duration: generation.n_seconds,
      resolution: `${generation.width}x${generation.height}`
    });
    
    return {
      buffer: videoBuffer,
      contentType: 'video/mp4',
      metadata: metadata,
      isMature: false, // Sora content filtering is handled by Azure
      isChild: false
    };
    
  } catch (error) {
    logError('Error in generateSoraVideo:', error);
    throw error;
  }
}

/**
 * Checks if the request should use Sora video generation
 * @param {Object} safeParams - Request parameters
 * @returns {boolean} - True if should use Sora
 */
export function shouldUseSora(safeParams) {
  return safeParams.model === 'sora' || safeParams.model === 'video';
}
