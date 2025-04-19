/**
 * Pollinations Resource Service
 * 
 * Functions for handling resources and prompts
 */

/**
 * Lists available resources
 * 
 * @returns {Promise<Object>} - Object containing the list of available resources
 */
export async function listResources() {
  // Return resources in the format specified by the MCP specification
  return {
    resources: [
      {
        uri: "pollinations:image-models",
        name: "Image Generation Models",
        description: "Models available for generating images from text prompts",
        mimeType: "application/json"
      },
      {
        uri: "pollinations:text-models",
        name: "Text Generation Models",
        description: "Models available for generating text responses",
        mimeType: "application/json"
      },
      {
        uri: "pollinations:audio-voices",
        name: "Audio Voices",
        description: "Voices available for text-to-speech conversion",
        mimeType: "application/json"
      }
    ],
    templates: [
      {
        uriTemplate: "pollinations:image/{prompt}",
        name: "Generate Image",
        description: "Generate an image from a text prompt",
        mimeType: "image/jpeg"
      },
      {
        uriTemplate: "pollinations:text/{prompt}",
        name: "Generate Text",
        description: "Generate text from a prompt",
        mimeType: "text/plain"
      },
      {
        uriTemplate: "pollinations:audio/{text}",
        name: "Generate Audio",
        description: "Convert text to speech",
        mimeType: "audio/mpeg"
      }
    ]
  };
}

/**
 * Lists available prompts
 * 
 * @returns {Promise<Object>} - Object containing the list of available prompts
 */
export async function listPrompts() {
  // For now, return a basic list of example prompts
  // This can be expanded later to fetch from an actual API endpoint
  return {
    prompts: [
      {
        id: "image-generation",
        category: "Image",
        examples: [
          "A beautiful sunset over the ocean",
          "A futuristic city with flying cars",
          "A serene forest landscape with a waterfall"
        ]
      },
      {
        id: "text-generation",
        category: "Text",
        examples: [
          "Write a short story about a robot",
          "Explain quantum computing in simple terms",
          "Create a recipe for chocolate chip cookies"
        ]
      },
      {
        id: "audio-generation",
        category: "Audio",
        examples: [
          "Welcome to Pollinations, where creativity blooms!",
          "The quick brown fox jumps over the lazy dog",
          "In a world where AI powers creativity..."
        ]
      }
    ]
  };
}
