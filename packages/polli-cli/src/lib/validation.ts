import { z } from "zod";

// API response schemas
export const ProfileResponseSchema = z.object({
    githubUsername: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
});

export const BalanceResponseSchema = z.object({
    balance: z.number().optional(),
});

export const DeviceCodeResponseSchema = z.object({
    device_code: z.string(),
    user_code: z.string(),
    verification_uri_complete: z.string(),
    expires_in: z.number(),
    interval: z.number(),
});

export const DeviceTokenResponseSchema = z.object({
    access_token: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
});

export const ModelEntrySchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    output_modalities: z.array(z.string()).optional(),
    input_modalities: z.array(z.string()).optional(),
    pricing: z.record(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    context_length: z.number().optional(),
    paid_only: z.boolean().optional(),
    voices: z.array(z.string()).optional(),
    video_capabilities: z.array(z.string()).optional(),
    reasoning: z.boolean().optional(),
});

export const ModelsResponseSchema = z.array(ModelEntrySchema);

export const KeyInfoSchema = z.object({
    id: z.string(),
    name: z.string(),
    start: z.string(),
    prefix: z.string(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    lastRequest: z.string().nullable(),
    permissions: z
        .object({
            tier: z.array(z.string()).optional(),
            models: z.array(z.string()).optional(),
            account: z.array(z.string()).optional(),
        })
        .nullable(),
    metadata: z.record(z.unknown()).nullable(),
    pollenBalance: z.number().nullable(),
    enabled: z.boolean(),
});

export const KeysListResponseSchema = z.object({
    data: z.array(KeyInfoSchema),
});

export const CreateKeyResponseSchema = z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    type: z.string(),
    prefix: z.string(),
    expiresAt: z.string().nullable(),
    permissions: z
        .object({
            models: z.array(z.string()).optional(),
            account: z.array(z.string()).optional(),
        })
        .nullable(),
    pollenBudget: z.number().nullable(),
    metadata: z.record(z.unknown()).nullable(),
});

export const SingleKeyInfoSchema = z.object({
    valid: z.boolean(),
    type: z.string(),
    name: z.string().nullable(),
    expiresAt: z.string().nullable(),
    permissions: z
        .object({
            models: z.array(z.string()).optional(),
            account: z.array(z.string()).optional(),
        })
        .nullable(),
    pollenBudget: z.number().nullable(),
    rateLimitEnabled: z.boolean(),
});

export const UsageRecordSchema = z.object({
    timestamp: z.string(),
    type: z.string(),
    model: z.string(),
    cost_usd: z.number(),
    meter_source: z.string(),
});

export const UsageResponseSchema = z.object({
    usage: z.array(UsageRecordSchema),
    count: z.number(),
});

export const DailyUsageRecordSchema = z.object({
    date: z.string(),
    model: z.string(),
    meter_source: z.string(),
    requests: z.number(),
    cost_usd: z.number(),
});

export const DailyUsageResponseSchema = z.object({
    usage: z.array(DailyUsageRecordSchema),
    count: z.number(),
});

export const UploadResponseSchema = z.object({
    id: z.string(),
    url: z.string(),
    contentType: z.string(),
    size: z.number(),
    duplicate: z.boolean(),
});

// Command option validation schemas
export const ImageGenOptionsSchema = z.object({
    model: z.string().default("zimage"),
    width: z.coerce.number().int().positive().max(4096).default(1024),
    height: z.coerce.number().int().positive().max(4096).default(1024),
    seed: z.coerce.number().int().optional(),
    safe: z.boolean().default(false),
    transparent: z.boolean().default(false),
    image: z.array(z.string().url()).optional(),
    output: z.string().default("image.png"),
});

export const AudioGenOptionsSchema = z.object({
    voice: z.string().default("sage"),
    format: z.enum(["mp3", "opus", "aac", "flac", "wav"]).default("mp3"),
    model: z.string().optional(),
    speed: z.coerce.number().min(0.25).max(4).optional(),
    duration: z.coerce.number().positive().optional(),
    instrumental: z.boolean().default(false),
    seed: z.coerce.number().int().optional(),
    output: z.string().default("speech.mp3"),
    play: z.boolean().default(false),
});

export const VideoGenOptionsSchema = z.object({
    model: z.string().optional(),
    width: z.coerce.number().int().positive().max(4096).default(1024),
    height: z.coerce.number().int().positive().max(4096).default(1024),
    duration: z.coerce.number().positive().max(30).optional(),
    aspectRatio: z.enum(["16:9", "9:16"]).optional(),
    audio: z.boolean().default(false),
    seed: z.coerce.number().int().optional(),
    image: z.string().url().optional(),
    output: z.string().default("video.mp4"),
});

export const TextGenOptionsSchema = z.object({
    model: z.string().optional(),
    system: z.string().optional(),
    temperature: z.coerce.number().min(0).max(2).optional(),
    maxTokens: z.coerce.number().int().positive().optional(),
    topP: z.coerce.number().min(0).max(1).optional(),
    frequencyPenalty: z.coerce.number().min(-2).max(2).optional(),
    presencePenalty: z.coerce.number().min(-2).max(2).optional(),
    seed: z.coerce.number().int().optional(),
    jsonResponse: z.boolean().default(false),
    reasoning: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
    image: z.array(z.string().url()).optional(),
    output: z.string().optional(),
    stream: z.boolean().optional(),
});

export const TranscribeOptionsSchema = z.object({
    model: z.enum(["whisper", "scribe", "universal-2", "universal-3-pro"]).default("whisper"),
    language: z.string().length(2).optional(),
});

// Helper to validate and parse
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}

export function validateSafe<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: z.ZodError } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}