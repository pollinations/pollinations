/**
 * Pollinations Image Service
 * 
 * Functions for interacting with the Pollinations Image API
 */

/**
 * Generates an image URL from a text prompt using the Pollinations Image API
 * 
 * @param {Object} params - The parameters for image URL generation
 * @param {string} params.prompt - The text description of the image to generate
 * @param {Object} [params.options={}] - Additional options for image generation
 * @param {string} [params.options.model] - Model name to use for generation
 * @param {number} [params.options.seed] - Seed for reproducible results
 * @param {number} [params.options.width=1024] - Width of the generated image
 * @param {number} [params.options.height=1024] - Height of the generated image
 * @returns {Object} - MCP response object with the image URL
 */
export async function generateImageUrl(params) {
  const { prompt, options = {} } = params;
  
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
  
  // Return the response in MCP format
  const result = {
    imageUrl: url,
    prompt,
    width,
    height,
    model,
    seed
  };
  
  return {
    content: [
      { type: 'text', text: JSON.stringify(result, null, 2) }
    ]
  };
}

/**
 * Generates an image from a text prompt and returns the image data as base64
 * 
 * @param {Object} params - The parameters for image generation
 * @param {string} params.prompt - The text description of the image to generate
 * @param {Object} [params.options={}] - Additional options for image generation
 * @param {string} [params.options.model] - Model name to use for generation
 * @param {number} [params.options.seed] - Seed for reproducible results
 * @param {number} [params.options.width=1024] - Width of the generated image
 * @param {number} [params.options.height=1024] - Height of the generated image
 * @returns {Promise<Object>} - MCP response object with the image data
 */
export async function generateImage(params) {
  const { prompt, options = {} } = params;
  
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  // First, generate the image URL (but don't use the MCP response format)
  const urlResult = await _generateImageUrlInternal(prompt, options);
  
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
    
    const metadata = {
      prompt: urlResult.prompt,
      width: urlResult.width,
      height: urlResult.height,
      model: urlResult.model,
      seed: urlResult.seed
    };
    
    // Return the response in MCP format
    return {
      content: [
        {
          type: 'image',
          data: base64Data,
          mimeType: contentType
        },
        {
          type: 'text',
          text: `Generated image from prompt: "${prompt}"\n\nImage metadata: ${JSON.stringify(metadata, null, 2)}`
        }
      ]
    };
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

/**
 * List available image generation models from Pollinations API
 * 
 * @param {Object} params - The parameters for listing image models
 * @returns {Promise<Object>} - MCP response object with the list of available image models
 */
export async function listImageModels(params) {
  try {
    const response = await fetch('https://image.pollinations.ai/models');
    
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    
    const models = await response.json();
    
    // Return the response in MCP format
    return {
      content: [
        { type: 'text', text: JSON.stringify(models, null, 2) }
      ]
    };
  } catch (error) {
    console.error('Error listing image models:', error);
    throw error;
  }
}

/**
 * Internal function to generate an image URL without MCP formatting
 * 
 * @param {string} prompt - The text description of the image to generate
 * @param {Object} options - Additional options for image generation
 * @returns {Object} - Object containing the image URL and metadata
 */
async function _generateImageUrlInternal(prompt, options = {}) {
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
