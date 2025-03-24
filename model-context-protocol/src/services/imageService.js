/**
 * Pollinations Image Service
 * 
 * Functions for interacting with the Pollinations Image API
 */

/**
 * Generates an image URL from a text prompt using the Pollinations Image API
 * 
 * @param {string} prompt - The text description of the image to generate
 * @param {Object} options - Additional options for image generation
 * @param {string} [options.model] - Model name to use for generation
 * @param {number} [options.seed] - Seed for reproducible results
 * @param {number} [options.width=1024] - Width of the generated image
 * @param {number} [options.height=1024] - Height of the generated image
 * @returns {Object} - Object containing the image URL and metadata
 */
export async function generateImageUrl(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  const { 
    model, 
    seed, 
    width = 1024, 
    height = 1024,
  } = options;
  
  // Build the query parameters
  const queryParams = new URLSearchParams();
  if (model) queryParams.append('model', model);
  if (seed !== undefined) queryParams.append('seed', seed);
  if (width) queryParams.append('width', width);
  if (height) queryParams.append('height', height);
  
  // Construct the URL
  const encodedPrompt = encodeURIComponent(prompt);
  const baseUrl = 'https://image.pollinations.ai';
  let url = `${baseUrl}/prompt/${encodedPrompt}`;
  
  // Add query parameters if they exist
  const queryString = queryParams.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  // Return the URL directly, keeping it simple
  return {
    imageUrl: url,
    prompt,
    width,
    height,
    model,
    seed
  };
}

/**
 * Generates an image from a text prompt and returns the image data as base64
 * 
 * @param {string} prompt - The text description of the image to generate
 * @param {Object} options - Additional options for image generation
 * @param {string} [options.model] - Model name to use for generation
 * @param {number} [options.seed] - Seed for reproducible results
 * @param {number} [options.width=1024] - Width of the generated image
 * @param {number} [options.height=1024] - Height of the generated image
 * @returns {Promise<Object>} - Object containing the base64 image data, mime type, and metadata
 */
export async function generateImage(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  // First, generate the image URL
  const urlResult = await generateImageUrl(prompt, options);
  
  try {
    // Fetch the image from the URL
    const response = await fetch(urlResult.imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to generate image: ${response.statusText}`);
    }
    
    // Get the image data as an ArrayBuffer
    const imageBuffer = await response.arrayBuffer();
    
    // Convert the ArrayBuffer to a base64 string
    const base64Data = Buffer.from(imageBuffer).toString('base64');
    
    // Determine the mime type from the response headers or default to image/jpeg
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    return {
      data: base64Data,
      mimeType: contentType,
      metadata: {
        prompt: urlResult.prompt,
        width: urlResult.width,
        height: urlResult.height,
        model: urlResult.model,
        seed: urlResult.seed
      }
    };
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

/**
 * List available image generation models from Pollinations API
 * 
 * @returns {Promise<Object>} - Object containing the list of available image models
 */
export async function listImageModels() {
  try {
    const response = await fetch('https://image.pollinations.ai/models');
    
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error listing image models:', error);
    throw error;
  }
}
