import { useEffect, useRef, useState } from 'react';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TabServerTransport } from '@mcp-b/transports';
import { z } from 'zod';

/**
 * MCP Server component that exposes Pollinations API functionality as MCP tools
 * This allows AI agents to interact with Pollinations through structured APIs
 */
export const McpServerComponent = () => {
  const serverRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeMcpServer = async () => {
      try {
        // Create MCP server instance
        const server = new McpServer({
          name: 'pollinations-web',
          version: '1.0.0',
          description: 'Pollinations AI platform MCP server for image generation, text processing, and AI tools'
        });

        // Image generation tool
        server.tool(
          'generateImage',
          'Generate an image using Pollinations AI',
          {
            prompt: z.string().describe('The text prompt describing the image to generate'),
            model: z.string().optional().describe('AI model to use (flux, midjourney, playground, etc.)'),
            width: z.number().optional().default(1024).describe('Image width in pixels'),
            height: z.number().optional().default(1024).describe('Image height in pixels'),
            seed: z.number().optional().describe('Random seed for reproducible results'),
            enhance: z.boolean().optional().default(false).describe('Whether to enhance the prompt'),
            nologo: z.boolean().optional().default(true).describe('Whether to remove Pollinations logo')
          },
          async ({ prompt, model = 'flux', width = 1024, height = 1024, seed, enhance = false, nologo = true }) => {
            console.log('🎨 MCP generateImage called with:', { prompt, model, width, height, seed, enhance, nologo });
            
            try {
              // Build image URL with parameters
              const params = new URLSearchParams();
              params.set('width', width.toString());
              params.set('height', height.toString());
              if (seed) params.set('seed', seed.toString());
              if (enhance) params.set('enhance', 'true');
              if (nologo) params.set('nologo', 'true');
              if (model !== 'flux') params.set('model', model);

              const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
              
              console.log('🎨 Generated image URL:', imageUrl);
              
              const result = {
                content: [
                  {
                    type: 'text',
                    text: `Image generated successfully! URL: ${imageUrl}\n\nPrompt: ${prompt}\nModel: ${model}\nDimensions: ${width}x${height}`
                  },
                  {
                    type: 'image',
                    data: imageUrl,
                    mimeType: 'image/jpeg'
                  }
                ]
              };
              
              console.log('🎨 Returning result:', result);
              return result;
              
            } catch (error) {
              console.error('🎨 Error in generateImage:', error);
              const errorResult = {
                content: [{
                  type: 'text',
                  text: `Error generating image: ${error.message}`
                }]
              };
              console.log('🎨 Returning error result:', errorResult);
              return errorResult;
            }
          }
        );

        // Text generation tool
        server.tool(
          'generateText',
          'Generate text using Pollinations AI text models',
          {
            messages: z.array(z.object({
              role: z.enum(['system', 'user', 'assistant']),
              content: z.string()
            })).describe('Array of conversation messages'),
            model: z.string().optional().default('openai').describe('AI model to use (openai, mistral, claude, etc.)'),
            temperature: z.number().optional().default(0.7).describe('Sampling temperature (0-2)'),
            max_tokens: z.number().optional().describe('Maximum tokens to generate'),
            stream: z.boolean().optional().default(false).describe('Whether to stream the response')
          },
          async ({ messages, model = 'openai', temperature = 0.7, max_tokens, stream = false }) => {
            try {
              const response = await fetch('https://text.pollinations.ai/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model,
                  messages,
                  temperature,
                  max_tokens,
                  stream
                })
              });

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              const result = await response.json();
              
              return {
                content: [{
                  type: 'text',
                  text: result.choices?.[0]?.message?.content || 'No response generated'
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: 'text',
                  text: `Error generating text: ${error.message}`
                }]
              };
            }
          }
        );

        // Audio generation tool
        server.tool(
          'generateAudio',
          'Generate audio/music using Pollinations AI',
          {
            prompt: z.string().describe('Text description of the audio/music to generate'),
            duration: z.number().optional().default(30).describe('Duration in seconds'),
            model: z.string().optional().default('music').describe('Audio model to use')
          },
          async ({ prompt, duration = 30, model = 'music' }) => {
            try {
              const params = new URLSearchParams({
                duration: duration.toString(),
                model
              });
              
              const audioUrl = `https://audio.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
              
              return {
                content: [
                  {
                    type: 'text',
                    text: `Audio generated successfully! URL: ${audioUrl}`
                  },
                  {
                    type: 'resource',
                    resource: {
                      uri: audioUrl,
                      mimeType: 'audio/mpeg',
                      name: `${prompt.slice(0, 50)}...`
                    }
                  }
                ]
              };
            } catch (error) {
              return {
                content: [{
                  type: 'text',
                  text: `Error generating audio: ${error.message}`
                }]
              };
            }
          }
        );

        // Get available models tool
        server.tool(
          'getAvailableModels',
          'Get list of available AI models across different modalities',
          {},
          async () => {
            try {
              // This would typically fetch from an API, for now return static list
              const models = {
                image: ['flux', 'midjourney', 'playground', 'dalle'],
                text: ['openai', 'mistral', 'claude', 'llama', 'gemini'],
                audio: ['music', 'voice', 'effects']
              };
              
              return {
                content: [{
                  type: 'text',
                  text: `Available models:\n\nImage: ${models.image.join(', ')}\nText: ${models.text.join(', ')}\nAudio: ${models.audio.join(', ')}`
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: 'text',
                  text: `Error fetching models: ${error.message}`
                }]
              };
            }
          }
        );

        // Create transport with CORS configuration
        const transport = new TabServerTransport({
          allowedOrigins: ['*'] // Configure based on security needs
        });

        // Connect server to transport
        await server.connect(transport);
        serverRef.current = server;
        setIsConnected(true);
        
        console.log('Pollinations MCP Server initialized successfully');
        
        // Announce MCP server availability
        if (window.postMessage) {
          window.postMessage({
            type: 'MCP_SERVER_READY',
            server: 'pollinations-web',
            version: '1.0.0',
            tools: ['generateImage', 'generateText', 'generateAudio', 'getAvailableModels']
          }, window.location.origin);
        }

      } catch (err) {
        console.error('Failed to initialize MCP server:', err);
        setError(err.message);
      }
    };

    initializeMcpServer();

    // Cleanup on unmount
    return () => {
      if (serverRef.current) {
        serverRef.current.close();
        serverRef.current = null;
        setIsConnected(false);
      }
    };
  }, []);

  // Return null - this is a headless component
  return null;
};

export default McpServerComponent;
