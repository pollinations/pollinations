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
    choice,
    configure,
    conversation,
    createKey,
    decision,
    decisions,
    editImage,
    embeddings,
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
    noul,
    resetClient,
    revokeKey,
    score,
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
} from "./models.js";

// Export all types
export type {
    AccountBalance,
    AccountKey,
    AccountPermission,
    AccountProfile,
    AccountQuest,
    AccountQuestReward,
    AccountQuestsResponse,
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
    ChatRouting,
    ChatRoutingCapability,
    ChatStreamChunk,
    ChoiceAnswer,
    ChoiceQuestion,
    CompletionUsage,
    CreatedKey,
    CreateKeyOptions,
    DailyUsageRecord,
    DailyUsageResponse,
    DecisionAnswer,
    DecisionContent,
    DecisionModel,
    DecisionOptions,
    DecisionQuestion,
    DecisionRequest,
    DecisionResponse,
    DecisionUsage,
    DeveloperEarningsResponse,
    DeveloperEarningsRow,
    DeviceAuthorization,
    DeviceCodeResponse,
    DeviceTokenResponse,
    EarningsOptions,
    Embedding,
    EmbeddingContentPart,
    EmbeddingInput,
    EmbeddingModel,
    EmbeddingsOptions,
    EmbeddingsResponse,
    EmbeddingTaskType,
    EmbeddingUsage,
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
    ModelInputModality,
    ModelOutputModality,
    NoulAnswer,
    NoulQuestion,
    // Config
    PollinationsConfig,
    // Errors
    PollinationsErrorDetails,
    RequestOptions,
    ResponseFormat,
    ScoreAnswer,
    ScoreQuestion,
    TextContentPart,
    TextGenerateOptions,
    // Text
    TextModel,
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
    VideoCapability,
    VideoContentPart,
    VideoGenerateOptions,
    // Video
    VideoModel,
    VideoResponse,
} from "./types.js";

// Export runtime constants and the error class
export { CHAT_ROUTING_CAPABILITIES, PollinationsError } from "./types.js";
