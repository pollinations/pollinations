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
    authorizeUrl,
    chat,
    chatStream,
    configure,
    conversation,
    generateAudio,
    generateImage,
    generateText,
    generateTextStream,
    generateVideo,
    getBalance,
    getDailyUsage,
    getImageModels,
    getModels,
    getProfile,
    getTextModels,
    getUsage,
    imageUrl,
    resetClient,
    transcribe,
    upload,
    validateKey,
    videoUrl,
} from "./helpers.js";

// Export all types
export type {
    AccountBalance,
    AccountPermission,
    AccountProfile,
    AudioContentPart,
    AudioFormat,
    AudioGenerateOptions,
    AudioResponse,
    // Audio
    AudioVoice,
    AuthorizeOptions,
    BuiltInToolType,
    ChatChoice,
    ChatOptions,
    ChatResponse,
    ChatStreamChunk,
    CompletionUsage,
    DailyUsageRecord,
    DailyUsageResponse,
    FileContentPart,
    FunctionDefinition,
    ImageContentPart,
    ImageGenerateOptions,
    // Image
    ImageModel,
    ImageQuality,
    ImageResponse,
    JsonSchema,
    KeyInfo,
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
    TranscribeOptions,
    TranscriptionModel,
    TranscriptionResponse,
    TranscriptionResponseFormat,
    TranscriptionVerboseResponse,
    UploadOptions,
    UploadResponse,
    UsageOptions,
    UsageRecord,
    UsageResponse,
    VideoContentPart,
    VideoGenerateOptions,
    // Video
    VideoModel,
    VideoResponse,
} from "./types.js";

// Export the error class
export { PollinationsError } from "./types.js";

// React hooks coming soon - see https://github.com/pollinations/pollinations for updates
