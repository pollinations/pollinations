/**
 * Pollinations SDK
 *
 * The easiest way to add AI to your app.
 * Images, text, audio, video - all in one package.
 *
 * @example
 * ```ts
 * import { generateImage, generateText } from 'pollinations';
 *
 * const image = await generateImage('a cat in space');
 * await image.saveToFile('cat.png');
 *
 * const text = await generateText('why is the sky blue?');
 * ```
 */

// Main client class
export { Pollinations } from './client.js';

// Helper functions
export {
  configure,
  imageUrl,
  generateImage,
  videoUrl,
  generateVideo,
  generateText,
  generateTextStream,
  chat,
  chatStream,
  generateAudio,
  getTextModels,
  getImageModels,
  getModels,
  conversation,
} from './helpers.js';

// Extra utilities
export {
  // Extended response types with helpers
  type ImageResponseExt,
  type VideoResponseExt,
  type ChatResponseExt,

  // Batch generation (multiple different prompts)
  generateImages,
  generateVideos,

  // Conversation class
  Conversation,

  // Browser helpers
  showImage,
  displayImage,

  // Token estimation
  estimateTokens,
  estimateMessageTokens,

  // Progress tracking
  generateImageWithProgress,
  type AwaitOptions,

  // Response wrappers (for advanced use)
  wrapImageResponse,
  wrapVideoResponse,
  wrapChatResponse,
} from './extras.js';

// Export all types
export type {
  // Config
  PollinationsConfig,

  // Image
  ImageModel,
  ImageQuality,
  ImageGenerateOptions,
  ImageResponse,

  // Video
  VideoModel,
  VideoGenerateOptions,
  VideoResponse,

  // Text
  TextModel,
  MessageRole,
  TextContentPart,
  ImageContentPart,
  VideoContentPart,
  AudioContentPart,
  FileContentPart,
  MessageContentPart,
  MessageContent,
  Message,
  TextGenerateOptions,
  ResponseFormat,
  JsonSchema,
  Tool,
  FunctionDefinition,
  BuiltInToolType,
  ThinkingOptions,
  ChatOptions,
  ToolCall,
  CompletionUsage,
  ChatChoice,
  ChatResponse,
  ChatStreamChunk,

  // Audio
  AudioVoice,
  AudioFormat,
  AudioGenerateOptions,
  AudioResponse,

  // Models
  ModelTier,
  ModelInfo,

  // Errors
  PollinationsErrorDetails,
} from './types.js';

// Export the error class
export { PollinationsError } from './types.js';
