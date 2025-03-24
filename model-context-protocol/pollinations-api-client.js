/**
 * Pollinations API Client
 * 
 * A simple client for the Pollinations APIs that doesn't require Cloudflare Workers
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
    model: model || 'flux', // Default model is flux
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
  // First, generate the image URL
  const result = await generateImageUrl(prompt, options);
  
  try {
    // Fetch the image from the URL
    const response = await fetch(result.imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    // Get the image data as an ArrayBuffer
    const imageBuffer = await response.arrayBuffer();
    
    // Convert the ArrayBuffer to a base64 string
    const base64Data = Buffer.from(imageBuffer).toString('base64');
    
    // Determine the mime type from the response headers or default to image/png
    const contentType = response.headers.get('content-type') || 'image/png';
    
    return {
      data: base64Data,
      mimeType: contentType,
      metadata: {
        prompt: result.prompt,
        width: result.width,
        height: result.height,
        model: result.model,
        seed: result.seed
      }
    };
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

/**
 * Generates audio from a text prompt using the Pollinations Text API
 * 
 * @param {string} prompt - The text to convert to speech
 * @param {Object} options - Additional options for audio generation
 * @param {string} [options.voice="alloy"] - Voice to use for audio generation
 * @param {number} [options.seed] - Seed for reproducible results
 * @returns {Promise<Object>} - Object containing the base64 audio data, mime type, and metadata
 */
export async function generateAudio(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  const { 
    voice = "alloy", 
    seed,
  } = options;
  
  // Build the query parameters
  const queryParams = new URLSearchParams();
  queryParams.append('model', 'openai-audio'); // Required for audio generation
  queryParams.append('voice', voice);
  if (seed !== undefined) queryParams.append('seed', seed);
  
  // Construct the URL
  const encodedPrompt = encodeURIComponent(prompt);
  const baseUrl = 'https://text.pollinations.ai';
  let url = `${baseUrl}/${encodedPrompt}`;
  
  // Add query parameters
  const queryString = queryParams.toString();
  url += `?${queryString}`;
  
  try {
    console.error(`Generating audio from URL: ${url}`);
    
    // Fetch the audio from the URL
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to generate audio: ${response.statusText}`);
    }
    
    // Get the audio data as an ArrayBuffer
    const audioBuffer = await response.arrayBuffer();
    
    // Convert the ArrayBuffer to a base64 string
    const base64Data = Buffer.from(audioBuffer).toString('base64');
    
    // Determine the mime type from the response headers or default to audio/mpeg
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    
    return {
      data: base64Data,
      mimeType: contentType,
      metadata: {
        prompt,
        voice,
        model: 'openai-audio',
        seed
      }
    };
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

/**
 * List available models from Pollinations APIs
 * 
 * @param {string} [type="image"] - The type of models to list ("image" or "text")
 * @returns {Promise<Object>} - Object containing the list of available models
 */
export async function listModels(type = "image") {
  try {
    const baseUrl = type === "text" ? 
      'https://text.pollinations.ai' : 
      'https://image.pollinations.ai';
    
    console.error(`Fetching ${type} models from ${baseUrl}/models`);
    
    const response = await fetch(`${baseUrl}/models`);
    
    if (!response.ok) {
      throw new Error(`Error fetching models: ${response.statusText}`);
    }
    
    const models = await response.json();
    return { models };
  } catch (error) {
    console.error(`Error in listModels for ${type}:`, error);
    throw error;
  }
}

// If this file is run directly (e.g., with Node.js)
if (typeof require !== 'undefined' && require.main === module) {
  async function run() {
    try {
      // Example: Generate an image URL
      const imageUrlResult = await generateImageUrl('A beautiful sunset over the ocean');
      console.log('Image URL Result:', imageUrlResult);
      
      // Example: List available models
      const modelsResult = await listModels();
      console.log('Available Models:', modelsResult);
      
      // Example: Generate audio
      console.log('Generating audio...');
      const audioResult = await generateAudio('Hello world, this is a test of the Pollinations API client.');
      console.log('Audio generated successfully!');
    } catch (error) {
      console.error('Error in example:', error);
    }
  }
  
  run();
}
