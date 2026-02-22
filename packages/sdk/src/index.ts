/**
 * Pollinations SDK
 *
 * The easiest way to add AI to your app.
 * Images, text, audio, video - all in one package.
 *
 * @example
 * ```ts
 * import { generateImage, generateText } from '@pollinations_ai/sdk';
 *
 * const image = await generateImage('a cat in space');
 * await image.saveToFile('cat.png');
 *
 * const text = await generateText('why is the sky blue?');
 * ```
 */

// Main client class
export { Pollinations } from "./client.js";
// Extra utilities
export {
    type AwaitOptions,
    type ChatResponseExt,
    // Conversation class
    Conversation,
    displayImage,
    estimateMessageTokens,
    // Token estimation
    estimateTokens,
    // Batch generation (multiple different prompts)
    generateImages,
    // Progress tracking
    generateImageWithProgress,
    generateVideos,
    // Extended response types with helpers
    type ImageResponseExt,
    // Browser helpers
    showImage,
    type VideoResponseExt,
    wrapChatResponse,
    // Response wrappers (for advanced use)
    wrapImageResponse,
    wrapVideoResponse,
} from "./extras.js";
// Helper functions
export {
    chat,
    chatStream,
    configure,
    conversation,
    generateAudio,
    generateImage,
    generateText,
    generateTextStream,
    generateVideo,
    getImageModels,
    getModels,
    getTextModels,
    imageUrl,
    resetClient,
    videoUrl,
} from "./helpers.js";

// Export all types
export type {
    AudioContentPart,
    AudioFormat,
    AudioGenerateOptions,
    AudioResponse,
    // Audio
    AudioVoice,
    BuiltInToolType,
    ChatChoice,
    ChatOptions,
    ChatResponse,
    ChatStreamChunk,
    CompletionUsage,
    FileContentPart,
    FunctionDefinition,
    ImageContentPart,
    ImageGenerateOptions,
    // Image
    ImageModel,
    ImageQuality,
    ImageResponse,
    JsonSchema,
    Message,
    MessageContent,
    MessageContentPart,
    MessageRole,
    ModelInfo,
    // Models
    ModelTier,
    // Config
    PollinationsConfig,
    // Errors
    PollinationsErrorDetails,
    RequestOptions,
    ResponseFormat,
    TextContentPart,
    TextGenerateOptions,
    // Text
    TextModel,
    ThinkingOptions,
    Tool,
    ToolCall,
    VideoContentPart,
    VideoGenerateOptions,
    // Video
    VideoModel,
    VideoResponse,
} from "./types.js";

// Export the error class
export { PollinationsError } from "./types.js";

// React hooks coming soon - see https://github.com/pollinations/pollinations for updates
