#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  generateImageUrl, 
  generateImage, 
  respondAudio, 
  sayText,
  listModels,
  listImageModels,
  listTextModels,
  listAudioVoices,
  generateText,
  listResources,
  listPrompts
} from './src/index.js';
import { getAllToolSchemas } from './src/schemas.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import player from 'play-sound';

// Create audio player instance
const audioPlayer = player({});

// Create the server instance
const server = new Server(
  {
    name: 'pollinations-multimodal-api',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Set up error handling
server.onerror = (error) => console.error('[MCP Error]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Set up tool handlers
// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllToolSchemas()
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'generateImageUrl') {
    try {
      const { prompt, options = {} } = args;
      const result = await generateImageUrl(prompt, options);
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error generating image URL: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'generateImage') {
    try {
      const { prompt, options = {} } = args;
      const result = await generateImage(prompt, options);
      return {
        content: [
          { 
            type: 'image', 
            data: result.data,
            mimeType: result.mimeType
          },
          { 
            type: 'text', 
            text: `Generated image from prompt: "${prompt}"\n\nImage metadata: ${JSON.stringify(result.metadata, null, 2)}` 
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error generating image: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'respondAudio') {
    try {
      const { prompt, voice, seed, voiceInstructions } = args;
      const result = await respondAudio(prompt, voice, seed, voiceInstructions);
      
      // Save audio to a temporary file
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `pollinations-audio-${Date.now()}.mp3`);
      
      // Decode base64 and write to file
      fs.writeFileSync(tempFilePath, Buffer.from(result.data, 'base64'));
      
      // Play the audio file
      audioPlayer.play(tempFilePath, (err) => {
        if (err) console.error('Error playing audio:', err);
        
        // Clean up the temporary file after playing
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupErr) {
          console.error('Error cleaning up temp file:', cleanupErr);
        }
      });
      
      return {
        content: [
          { 
            type: 'text', 
            text: `Audio has been played.\n\nAudio metadata: ${JSON.stringify(result.metadata, null, 2)}` 
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error generating audio: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'sayText') {
    try {
      const { text, voice, seed, voiceInstructions } = args;
      const result = await sayText(text, voice, seed, voiceInstructions);
      
      // Save audio to a temporary file
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `pollinations-audio-${Date.now()}.mp3`);
      
      // Decode base64 and write to file
      fs.writeFileSync(tempFilePath, Buffer.from(result.data, 'base64'));
      
      // Play the audio file
      audioPlayer.play(tempFilePath, (err) => {
        if (err) console.error('Error playing audio:', err);
        
        // Clean up the temporary file after playing
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupErr) {
          console.error('Error cleaning up temp file:', cleanupErr);
        }
      });
      
      return {
        content: [
          { 
            type: 'text', 
            text: `Text has been spoken.\n\nAudio metadata: ${JSON.stringify(result.metadata, null, 2)}` 
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error speaking text: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'listModels') {
    try {
      const { type = 'image' } = args;
      const result = await listModels(type);
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error listing models: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'listImageModels') {
    try {
      const result = await listImageModels();
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error listing image models: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'listTextModels') {
    try {
      const result = await listTextModels();
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error listing text models: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'listAudioVoices') {
    try {
      const result = await listAudioVoices();
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error listing audio voices: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'generateText') {
    try {
      const { prompt, model = "openai", seed, systemPrompt, json, private: isPrivate } = args;
      const result = await generateText(prompt, model, seed, systemPrompt, json, isPrivate);
      return {
        content: [
          { type: 'text', text: result }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error generating text: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'listResources') {
    try {
      const result = await listResources();
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error listing resources: ${error.message}` }
        ],
        isError: true
      };
    }
  } else if (name === 'listPrompts') {
    try {
      const result = await listPrompts();
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error listing prompts: ${error.message}` }
        ],
        isError: true
      };
    }
  } else {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}`
    );
  }
});

// Run the server
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Pollinations Multimodal MCP server running on stdio');
}

run().catch(console.error);