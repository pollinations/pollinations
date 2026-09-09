/**
 * Bot configuration type
 */
export type BotConfig = {
    name: string;
    token: string;
    model: string;
    personality: string;
    conversationChannelIds?: string[];
    globalChannelIds?: string[];
};

/**
 * API Message format for the Pollinations API
 */
export type ApiMessage = {
    role: string;
    content: string;
    name?: string;
};

/**
 * Generate text function signature
 */
export type GenerateTextWithHistory = (
    messages: ApiMessage[],
    model: string,
) => Promise<string>;
