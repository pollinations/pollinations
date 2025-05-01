/**
 * Pollinations Audio Service
 *
 * Functions and schemas for interacting with the Pollinations Audio API
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createMCPResponse, createTextContent, buildUrl } from '../utils/coreUtils.js';
import { z } from 'zod';

// Constants
const AUDIO_API_BASE_URL = 'https://text.pollinations.ai';

/**
 * Generates an audio response to a text prompt using the Pollinations Text API
 *
 * @param {Object} params - The parameters for audio generation
 * @param {string} params.prompt - The text prompt to respond to with audio
 * @param {string} [params.voice="alloy"] - Voice to use for audio generation
 * @param {string} [params.format="mp3"] - Format of the audio (mp3, wav, etc.)
 * @param {string} [params.voiceInstructions] - Additional instructions for voice character/style
 * @param {Object} [params.audioPlayer] - Optional audio player for terminal playback
 * @param {string} [params.tempDir] - Optional temporary directory for audio playback
 * @returns {Promise<Object>} - MCP response object with the audio data
 */
async function respondAudio(params) {
  const { prompt, voice = "alloy", format = "mp3", voiceInstructions, audioPlayer, tempDir } = params;

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required and must be a string');
  }

  // Prepare the query parameters
  const queryParams = {
    model: 'openai-audio',
    voice,
    format
  };

  // Prepare the prompt
  let finalPrompt = prompt;

  // Add voice instructions if provided
  if (voiceInstructions) {
    finalPrompt = `${voiceInstructions}\n\n${prompt}`;
  }

  // Build the URL using the utility function
  const url = buildUrl(AUDIO_API_BASE_URL, encodeURIComponent(finalPrompt), queryParams);

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

    // Determine the mime type from the format
    const mimeType = `audio/${format === 'mp3' ? 'mpeg' : format}`;

    // Play the audio if an audio player is provided
    if (audioPlayer) {
      const tempDirPath = tempDir || os.tmpdir();
      await playAudio(base64Data, mimeType, 'respond_audio', audioPlayer, tempDirPath);
    }

    // Return the response in MCP format
    return createMCPResponse([
      {
        type: 'audio',
        data: base64Data,
        mimeType
      },
      createTextContent(`Generated audio response for prompt: "${prompt}"\n\nVoice: ${voice}\nFormat: ${format}`)
    ]);
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

/**
 * Generates speech from text with a verbatim instruction
 *
 * @param {Object} params - The parameters for speech generation
 * @param {string} params.text - The text to speak verbatim
 * @param {string} [params.voice="alloy"] - Voice to use for audio generation
 * @param {string} [params.format="mp3"] - Format of the audio (mp3, wav, etc.)
 * @param {string} [params.voiceInstructions] - Additional instructions for voice character/style
 * @param {Object} [params.audioPlayer] - Optional audio player for terminal playback
 * @param {string} [params.tempDir] - Optional temporary directory for audio playback
 * @returns {Promise<Object>} - MCP response object with the audio data
 */
async function sayText(params) {
  const { text, voice = "alloy", format = "mp3", voiceInstructions, audioPlayer, tempDir } = params;

  if (!text || typeof text !== 'string') {
    throw new Error('Text is required and must be a string');
  }

  // Prepare the query parameters
  const queryParams = {
    model: 'openai-audio',
    voice,
    format
  };

  // Prepare the prompt with the verbatim instruction
  let finalPrompt = `Say verbatim: ${text}`;

  // Add voice instructions if provided
  if (voiceInstructions) {
    finalPrompt = `${voiceInstructions}\n\n${finalPrompt}`;
  }

  // Build the URL using the utility function
  const url = buildUrl(AUDIO_API_BASE_URL, encodeURIComponent(finalPrompt), queryParams);

  try {
    // Fetch the audio from the URL
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to generate speech: ${response.statusText}`);
    }

    // Get the audio data as an ArrayBuffer
    const audioBuffer = await response.arrayBuffer();

    // Convert the ArrayBuffer to a base64 string
    const base64Data = Buffer.from(audioBuffer).toString('base64');

    // Determine the mime type from the format
    const mimeType = `audio/${format === 'mp3' ? 'mpeg' : format}`;

    // Play the audio if an audio player is provided
    if (audioPlayer) {
      const tempDirPath = tempDir || os.tmpdir();
      await playAudio(base64Data, mimeType, 'say_text', audioPlayer, tempDirPath);
    }

    // Return the response in MCP format
    return createMCPResponse([
      {
        type: 'audio',
        data: base64Data,
        mimeType
      },
      createTextContent(`Generated audio for text: "${text}"\n\nVoice: ${voice}\nFormat: ${format}`)
    ]);
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

/**
 * List available audio voices from Pollinations API
 *
 * @param {Object} params - The parameters for listing audio voices
 * @returns {Promise<Object>} - MCP response object with the list of available voice options
 */
async function listAudioVoices(params) {
  try {
    const url = buildUrl(AUDIO_API_BASE_URL, 'models');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }

    const models = await response.json();

    // Find the openai-audio model and extract its voices
    const audioModel = models.find(model => model.name === 'openai-audio');

    let voices;
    if (audioModel && Array.isArray(audioModel.voices)) {
      voices = audioModel.voices;
    } else {
      // Default voices if we can't find the list
      voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    }

    // Return the response in MCP format using utility functions
    return createMCPResponse([
      createTextContent(voices, true)
    ]);
  } catch (error) {
    console.error('Error listing audio voices:', error);
    // Return default voices if there's an error
    const defaultVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

    // Return the response in MCP format using utility functions
    return createMCPResponse([
      createTextContent(defaultVoices, true)
    ]);
  }
}

/**
 * Plays audio data using the provided audio player
 *
 * @param {string} audioData - Base64 encoded audio data
 * @param {string} mimeType - MIME type of the audio data
 * @param {string} prefix - Filename prefix for the temporary file
 * @param {Object} audioPlayer - Audio player instance
 * @param {string} tempDir - Temporary directory path
 * @returns {Promise<void>}
 */
function playAudio(audioData, mimeType, prefix, audioPlayer, tempDir) {
  if (!audioPlayer || !tempDir) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    try {
      const format = getFormatFromMimeType(mimeType);
      const tempFile = path.join(tempDir, `${prefix}_${Date.now()}.${format}`);
      fs.writeFileSync(tempFile, Buffer.from(audioData, 'base64'));

      audioPlayer.play(tempFile, (err) => {
        if (err) {
          console.error('Error playing audio:', err);
        }

        // Clean up temp file after playing
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          console.error('Error removing temp file:', e);
        }

        resolve();
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      reject(error);
    }
  });
}

/**
 * Gets the format from the given MIME type
 *
 * @param {string} mimeType - MIME type
 * @returns {string} - Format
 */
function getFormatFromMimeType(mimeType) {
  switch (mimeType) {
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
      return 'wav';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/aac':
      return 'aac';
    default:
      return 'mp3'; // Default to MP3
  }
}

/**
 * Export tools as complete arrays ready to be passed to server.tool()
 */
export const audioTools = [
  [
    'respondAudio',
    'Generate an audio response to a text prompt',
    {
      prompt: z.string().describe('The text prompt to respond to with audio'),
      voice: z.string().optional().describe('Voice to use for audio generation (default: "alloy")'),
      format: z.string().optional().describe('Format of the audio (mp3, wav, etc.)'),
      voiceInstructions: z.string().optional().describe('Additional instructions for voice character/style (e.g., "Speak with enthusiasm" or "Use a calm tone")')
    },
    respondAudio
  ],
  
  [
    'sayText',
    'Generate speech that says the provided text verbatim',
    {
      text: z.string().describe('The text to speak verbatim'),
      voice: z.string().optional().describe('Voice to use for audio generation (default: "alloy")'),
      format: z.string().optional().describe('Format of the audio (mp3, wav, etc.)'),
      voiceInstructions: z.string().optional().describe('Additional instructions for voice character/style (e.g., "Speak with enthusiasm" or "Use a calm tone")')
    },
    sayText
  ],
  
  [
    'listAudioVoices',
    'List available audio voices',
    {},
    listAudioVoices
  ]
];
