/**
 * Schema definitions for the Pollinations Audio API
 */

/**
 * Schema for the respondAudio tool
 */
export const respondAudioSchema = {
  name: 'respondAudio',
  description: 'Generate an audio response to a text prompt and play it through the system',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The text prompt to respond to with audio'
      },
      voice: {
        type: 'string',
        description: 'Voice to use for audio generation (default: "alloy")'
      },
      seed: {
        type: 'number',
        description: 'Seed for reproducible results'
      },
      voiceInstructions: {
        type: 'string',
        description: 'Additional instructions for voice character/style (e.g., "Speak with enthusiasm" or "Use a calm tone")'
      }
    },
    required: ['prompt']
  }
};

/**
 * Schema for the sayText tool
 */
export const sayTextSchema = {
  name: 'sayText',
  description: 'Generate speech that says the provided text verbatim and play it through the system',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to speak verbatim'
      },
      voice: {
        type: 'string',
        description: 'Voice to use for audio generation (default: "alloy")'
      },
      seed: {
        type: 'number',
        description: 'Seed for reproducible results'
      },
      voiceInstructions: {
        type: 'string',
        description: 'Additional instructions for voice character/style (e.g., "Speak with enthusiasm" or "Use a calm tone")'
      }
    },
    required: ['text']
  }
};

/**
 * Schema for the listAudioVoices tool
 */
export const listAudioVoicesSchema = {
  name: 'listAudioVoices',
  description: 'List available audio voices',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};
