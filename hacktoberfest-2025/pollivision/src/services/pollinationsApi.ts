/**
 * PolliVision - Pollinations API Integration
 * 
 * This service handles all communication with the Pollinations.ai API
 * for video and image generation.
 * 
 * API Documentation: https://pollinations.ai/
 * 
 * @author Fábio Arieira
 * @website https://fabioarieira.com
 */

const VIDEO_API_URL = 'https://video.pollinations.ai';
const IMAGE_API_URL = 'https://image.pollinations.ai';
const TEXT_API_URL = 'https://text.pollinations.ai';

export interface VideoGenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  seed?: number;
  model?: string;
  apiKey?: string;
}

export interface ImageGenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  model?: 'flux' | 'turbo' | 'flux-realism' | 'flux-anime' | 'flux-3d';
  seed?: number;
  nologo?: boolean;
}

export interface TextGenerationParams {
  prompt: string;
  model?: string;
  system?: string;
  apiKey?: string;
}

/**
 * Generate a video using Pollinations Video API
 */
export async function generateVideo(params: VideoGenerationParams): Promise<string> {
  const {
    prompt,
    width = 1280,
    height = 720,
    seed = Math.floor(Math.random() * 999999),
    apiKey,
  } = params;

  const encodedPrompt = encodeURIComponent(prompt);
  
  // Build URL with parameters
  const queryParams = new URLSearchParams({
    width: width.toString(),
    height: height.toString(),
    seed: seed.toString(),
    nologo: 'true',
  });

  if (apiKey) {
    queryParams.append('token', apiKey);
  }

  const videoUrl = `${VIDEO_API_URL}/prompt/${encodedPrompt}?${queryParams.toString()}`;
  
  return videoUrl;
}

/**
 * Generate an image using Pollinations Image API
 */
export function generateImageUrl(params: ImageGenerationParams): string {
  const {
    prompt,
    width = 1280,
    height = 720,
    model = 'flux',
    seed = Math.floor(Math.random() * 999999),
    nologo = true,
  } = params;

  const encodedPrompt = encodeURIComponent(prompt);
  
  const queryParams = new URLSearchParams({
    width: width.toString(),
    height: height.toString(),
    model,
    seed: seed.toString(),
    nologo: nologo.toString(),
  });

  return `${IMAGE_API_URL}/prompt/${encodedPrompt}?${queryParams.toString()}`;
}

/**
 * Generate text/chat response using Pollinations Text API
 */
export async function generateText(params: TextGenerationParams): Promise<string> {
  const { prompt, model = 'openai', system, apiKey } = params;

  const encodedPrompt = encodeURIComponent(prompt);
  const encodedSystem = system ? encodeURIComponent(system) : '';
  
  const queryParams = new URLSearchParams({
    model,
  });

  if (encodedSystem) {
    queryParams.append('system', encodedSystem);
  }

  if (apiKey) {
    queryParams.append('token', apiKey);
  }

  const response = await fetch(
    `${TEXT_API_URL}/${encodedPrompt}?${queryParams.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Text generation failed: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Enhance a video prompt using AI
 */
export async function enhanceVideoPrompt(
  userPrompt: string,
  apiKey?: string
): Promise<string> {
  const systemPrompt = `You are a professional video prompt engineer for AI video generation. 
Your task is to enhance user prompts to create more cinematic, detailed, and visually stunning video descriptions.

Rules:
- Keep the enhanced prompt concise but descriptive (max 200 words)
- Add cinematic elements: camera movements, lighting, mood
- Include technical details: 4K, cinematic, smooth motion, professional
- Maintain the user's original intent
- Output ONLY the enhanced prompt, no explanations`;

  const enhanced = await generateText({
    prompt: `Enhance this video prompt: "${userPrompt}"`,
    system: systemPrompt,
    apiKey,
  });

  return enhanced.trim();
}

/**
 * Get estimated pollen cost for video generation
 */
export function getPollenCost(
  duration: number = 5,
  quality: 'standard' | 'high' | 'ultra' = 'high'
): number {
  const baseCost = 10; // Base cost per video
  const durationMultiplier = Math.ceil(duration / 5); // 5 seconds = 1 unit
  
  const qualityMultipliers = {
    standard: 1,
    high: 1.5,
    ultra: 2.5,
  };

  return Math.ceil(baseCost * durationMultiplier * qualityMultipliers[quality]);
}

/**
 * Validate API key by making a test request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${TEXT_API_URL}/test?token=${apiKey}&model=openai`
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get user's pollen balance (requires API key)
 */
export async function getPollenBalance(_apiKey: string): Promise<number | null> {
  try {
    // This would typically call the Pollinations balance API
    // For now, we return null to indicate balance check is not available
    // The actual endpoint would be something like:
    // const response = await fetch(`https://api.pollinations.ai/balance?token=${_apiKey}`);
    return null;
  } catch {
    return null;
  }
}

/**
 * Pre-generate thumbnail for video
 */
export function generateThumbnail(prompt: string): string {
  return generateImageUrl({
    prompt: `Cinematic still frame from video: ${prompt}`,
    width: 640,
    height: 360,
    model: 'flux',
  });
}



