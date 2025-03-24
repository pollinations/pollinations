/**
 * Pollinations Audio Service
 * 
 * Functions for interacting with the Pollinations Audio API
 */

/**
 * Generates an audio response to a text prompt using the Pollinations Text API
 * 
 * @param {string} prompt - The text prompt to respond to with audio
 * @param {string} [voice="alloy"] - Voice to use for audio generation
 * @param {number} [seed] - Seed for reproducible results
 * @param {string} [voiceInstructions] - Additional instructions for voice character/style
 * @returns {Promise<Object>} - Object containing the base64 audio data, mime type, and metadata
 */
export async function respondAudio(prompt, voice = "alloy", seed, voiceInstructions) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }
  
  // Build the query parameters
  const queryParams = new URLSearchParams();
  queryParams.append('model', 'openai-audio'); // Required for audio generation
  queryParams.append('voice', voice);
  if (seed !== undefined) queryParams.append('seed', seed);
  
  // Construct the URL
  let finalPrompt = prompt;
  
  // Add voice instructions if provided
  if (voiceInstructions) {
    finalPrompt = `${voiceInstructions}\n\n${prompt}`;
  }
  
  const encodedPrompt = encodeURIComponent(finalPrompt);
  const baseUrl = 'https://text.pollinations.ai';
  let url = `${baseUrl}/${encodedPrompt}`;
  
  // Add query parameters
  const queryString = queryParams.toString();
  url += `?${queryString}`;
  
  try {
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
        seed,
        voiceInstructions
      }
    };
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

/**
 * Generates speech from text with a verbatim instruction
 * 
 * @param {string} text - The text to speak verbatim
 * @param {string} [voice="alloy"] - Voice to use for audio generation
 * @param {number} [seed] - Seed for reproducible results
 * @param {string} [voiceInstructions] - Additional instructions for voice character/style
 * @returns {Promise<Object>} - Object containing the base64 audio data, mime type, and metadata
 */
export async function sayText(text, voice = "alloy", seed, voiceInstructions) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required and must be a string');
  }
  
  // Create the verbatim instruction
  const verbatimPrompt = `Say verbatim: ${text}`;
  
  // Pass to respondAudio with the same parameters
  return respondAudio(verbatimPrompt, voice, seed, voiceInstructions);
}

/**
 * List available audio voices from Pollinations API
 * 
 * @returns {Promise<Array<string>>} - Array of available voice options
 */
export async function listAudioVoices() {
  try {
    const response = await fetch('https://text.pollinations.ai/models');
    
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    
    const models = await response.json();
    
    // Find the openai-audio model and extract its voices
    const audioModel = models.find(model => model.name === 'openai-audio');
    
    if (audioModel && Array.isArray(audioModel.voices)) {
      return audioModel.voices;
    }
    
    // Default voices if we can't find the list
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  } catch (error) {
    console.error('Error listing audio voices:', error);
    // Return default voices if there's an error
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  }
}
