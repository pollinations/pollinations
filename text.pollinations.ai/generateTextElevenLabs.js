import dotenv from 'dotenv';
import debug from 'debug';
import fetch from 'node-fetch';

dotenv.config();

const log = debug('pollinations:elevenlabs');
const errorLog = debug('pollinations:elevenlabs:error');

const ELEVEN_LABS_API_URL = 'https://api.elevenlabs.io/v1';

// List of default Eleven Labs voices
const DEFAULT_VOICES = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' }
];

// Cache for storing voice data to reduce API calls
let voiceCache = null;
let voiceCacheTimestamp = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Get available voices from Eleven Labs API
 * @returns {Promise<Array>} Array of voice objects
 */
async function getVoices() {
  // Check if we have a valid cache
  const now = Date.now();
  if (voiceCache && (now - voiceCacheTimestamp < CACHE_DURATION)) {
    return voiceCache;
  }

  try {
    // Fetch voices from Eleven Labs API
    const response = await fetch(`${ELEVEN_LABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': process.env.ELEVEN_LABS_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get voices: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Update the cache
    voiceCache = data.voices;
    voiceCacheTimestamp = now;
    
    return data.voices;
  } catch (error) {
    errorLog('Error getting voices:', error);
    // Fall back to default voices if API call fails
    return DEFAULT_VOICES;
  }
}

/**
 * Get voice ID from voice name
 * @param {string} voiceName - Name of the voice
 * @returns {Promise<string>} - Voice ID
 */
async function getVoiceId(voiceName) {
  // Handle cases where a voice ID is directly provided
  if (voiceName && voiceName.length > 20) {
    return voiceName;
  }

  // Get available voices
  const voices = await getVoices();
  
  // Try to find the voice by name (case-insensitive)
  const voice = voices.find(v => 
    v.name.toLowerCase() === voiceName.toLowerCase()
  );
  
  if (voice) {
    return voice.voice_id;
  }
  
  // If not found, return the first voice as default
  return voices[0].voice_id;
}

/**
 * Generate speech from text using Eleven Labs API
 * @param {string} text - Text to convert to speech
 * @param {Object} options - Options for speech generation
 * @returns {Promise<Object>} - Response object with audio data
 */
async function generateSpeech(text, options = {}) {
  const {
    voice = 'Rachel',
    model = 'eleven_multilingual_v2',
    stability = 0.5,
    similarity_boost = 0.75,
    style = 0.0,
    use_speaker_boost = true,
    format = 'mp3'
  } = options;
  
  try {
    // Get voice ID from voice name
    const voiceId = await getVoiceId(voice);
    
    // Prepare request body
    const payload = {
      text,
      model_id: model,
      voice_settings: {
        stability,
        similarity_boost,
        style,
        use_speaker_boost
      }
    };
    
    log('Generating speech with Eleven Labs:', {
      voice: voiceId,
      model,
      textLength: text.length
    });
    
    // Make API request
    const response = await fetch(`${ELEVEN_LABS_API_URL}/text-to-speech/${voiceId}?output_format=${format}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate speech: ${response.statusText} - ${errorText}`);
    }
    
    // Get audio data as ArrayBuffer
    const audioBuffer = await response.arrayBuffer();
    // Convert to base64
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
    // Determine content type based on format
    let contentType = 'audio/mpeg';
    if (format === 'mp3') {
      contentType = 'audio/mpeg';
    } else if (format === 'pcm') {
      contentType = 'audio/pcm';
    } else if (format === 'ulaw') {
      contentType = 'audio/basic';
    }
    
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: text,
          audio: {
            data: audioBase64,
            content_type: contentType
          }
        }
      }],
      model: 'elevenlabs',
      provider: 'ElevenLabs',
      usage: {
        prompt_tokens: text.length / 4, // Approximate token count
        completion_tokens: 0,
        total_tokens: text.length / 4
      }
    };
  } catch (error) {
    errorLog('Error generating speech:', error);
    throw error;
  }
}

/**
 * Generate text response from Eleven Labs
 * @param {Array} messages - Array of messages
 * @param {Object} options - Options for generating text
 * @returns {Promise<Object>} - Response object
 */
export async function generateTextElevenLabs(messages, options = {}) {
  try {
    // Extract the text from the last user message
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }
    
    const text = typeof lastUserMessage.content === 'string' 
      ? lastUserMessage.content 
      : 'No valid text content provided';
    
    // Get voice from options
    const voice = options.voice || options.audio?.voice || 'Rachel';
    
    // Get format from options
    const format = options.audio?.format || 'mp3';
    
    // Generate speech
    return generateSpeech(text, {
      voice,
      format,
      model: options.elevenlabs_model || 'eleven_multilingual_v2'
    });
  } catch (error) {
    errorLog('Error in generateTextElevenLabs:', error);
    return {
      error: error.message,
      status: 500
    };
  }
}

/**
 * Direct text-to-speech conversion (for /audio/speech endpoint)
 * @param {string} input - Text to convert to speech
 * @param {Object} options - Options for speech generation
 * @returns {Promise<Buffer>} - Audio buffer
 */
export async function textToSpeech(input, options = {}) {
  try {
    const {
      voice = 'Rachel',
      model = 'eleven_multilingual_v2',
      response_format = 'mp3'
    } = options;
    
    // Get voice ID from voice name
    const voiceId = await getVoiceId(voice);
    
    // Prepare request body
    const payload = {
      text: input,
      model_id: model,
      voice_settings: {
        stability: options.stability || 0.5,
        similarity_boost: options.similarity_boost || 0.75,
        style: options.style || 0.0,
        use_speaker_boost: options.use_speaker_boost !== false
      }
    };
    
    log('Converting text to speech with Eleven Labs:', {
      voice: voiceId,
      model,
      textLength: input.length,
      response_format
    });
    
    // Make API request
    const response = await fetch(`${ELEVEN_LABS_API_URL}/text-to-speech/${voiceId}?output_format=${response_format}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate speech: ${response.statusText} - ${errorText}`);
    }
    
    // Get audio data as ArrayBuffer
    const audioBuffer = await response.arrayBuffer();
    // Convert to Buffer
    return Buffer.from(audioBuffer);
    
  } catch (error) {
    errorLog('Error in textToSpeech:', error);
    throw error;
  }
}

/**
 * List available Eleven Labs voices
 * @returns {Promise<Array>} - Array of voice objects
 */
export async function listVoices() {
  try {
    const voices = await getVoices();
    return voices.map(voice => ({
      voice_id: voice.voice_id,
      name: voice.name,
      description: voice.description || '',
      gender: voice.labels?.gender || 'unknown',
      accent: voice.labels?.accent || 'neutral',
      age: voice.labels?.age || 'adult',
      is_cloned: voice.category === 'cloned'
    }));
  } catch (error) {
    errorLog('Error listing voices:', error);
    throw error;
  }
}
