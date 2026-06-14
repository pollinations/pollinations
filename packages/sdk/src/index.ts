/**
 * Pollinations SDK
 *
 * The easiest way to add AI to your app.
 * Images, text, audio, video - all in one package.
 *
 * @example
 * ```ts
 * import { generateImage, generateText } from '@pollinations/sdk';
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
    type AudioResponseExt,
    type ChatResponseExt,
    // Conversation class
    Conversation,
    // Extended response types with helpers
    type ImageResponseExt,
    type VideoResponseExt,
    wrapAudioResponse,
    wrapChatResponse,
    // Response wrappers (for advanced use)
    wrapImageResponse,
    wrapVideoResponse,
} from "./extras.js";
// Helper functions
export {
    authorizeDevice,
    authorizeUrl,
    chat,
    chatStream,
    configure,
    conversation,
    createKey,
    editImage,
    generateAudio,
    generateImage,
    generateText,
    generateTextStream,
    generateVideo,
    getBalance,
    getDailyUsage,
    getImageModels,
    getKeyUsage,
    getModels,
    getProfile,
    getTextModels,
    getUsage,
    imageGenerate,
    imageUrl,
    listKeys,
    resetClient,
    revokeKey,
    transcribe,
    upload,
    userInfo,
    validateKey,
    videoUrl,
} from "./helpers.js";
export {
    type FetchModelCatalogOptions,
    fetchModelCatalog,
    type ModelCatalog,
    type ModelCatalogItem,
    pricingEntries,
} from "./models.js";

// Export all types
export type {
    AccountBalance,
    AccountKey,
    AccountPermission,
    AccountProfile,
    AudioBinaryResponse,
    AudioContentPart,
    AudioFormat,
    AudioGenerateOptions,
    // Audio
    AudioModel,
    AudioResponse,
    AudioVoice,
    AuthorizeDeviceOptions,
    AuthorizeOptions,
    BuiltInToolType,
    ChatChoice,
    ChatOptions,
    ChatResponse,
    ChatStreamChunk,
    CompletionUsage,
    CreatedKey,
    CreateKeyOptions,
    DailyUsageRecord,
    DailyUsageResponse,
    DeviceAuthorization,
    DeviceCodeResponse,
    DeviceTokenResponse,
    FileContentPart,
    FunctionDefinition,
    ImageContentPart,
    ImageEditOptions,
    ImageGenerateOptions,
    ImageGenerateV1Options,
    // Image
    ImageModel,
    ImageQuality,
    ImageResponse,
    JsonSchema,
    KeyAccountPermission,
    KeyInfo,
    KeyUsageOptions,
    Message,
    MessageContent,
    MessageContentPart,
    MessageRole,
    // Models
    ModelCategory,
    ModelInfo,
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
    UserInfo,
    VideoContentPart,
    VideoGenerateOptions,
    // Video
    VideoModel,
    VideoResponse,
} from "./types.js";

// Export the error class
export { PollinationsError } from "./types.js";
