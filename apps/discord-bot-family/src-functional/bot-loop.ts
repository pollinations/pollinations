import debug from "debug";
import {
    ChannelType,
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    Partials,
} from "discord.js";
import { FatalTokenError, handleDiscordError } from "./errors";
import type { ApiMessage, BotConfig, GenerateTextWithHistory } from "./types";

const log = debug("app:bot");
const HISTORY_LIMIT = 8;
const MAX_BOT_MESSAGES_PER_WINDOW = 2;
const RATE_WINDOW_MS = 60_000; // 1 minute
const PROACTIVE_MIN_MS = 600_000; // 10 minutes minimum
const PROACTIVE_MAX_MS = 1_800_000; // 30 minutes maximum
const PROACTIVE_CHANCE = 0.02; // 2% chance to post when channel is quiet

function getSystemPrompt(config: BotConfig, botUsername?: string, botId?: string): string {
    return `You are ${config.model}. Your discord username is "${botUsername || config.model}" and your ID is ${botId || "unknown"}. Keep it casual and a little quirky. Respond like a real person in a Discord chat — max 2 short paragraphs, never walls of text. Use creative Discord markdown. To mention someone, use their ID like <@123456>. Never mention or tag other bots. Do not pretend to be another model.`;
}

/**
 * Clean up AI response by removing think tags and model name prefixes
 */
function cleanResponse(response: string, modelName: string): string {
    // Remove <think>...</think> tags
    let cleaned = response.replace(/<think>.*?<\/think>/gs, "");


    // Remove model name prefixes like "[modelName]:\n"
    const escapedName = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactModelNamePattern = new RegExp(
        `^\\s*\\[\\s*${escapedName}\\s*\\]\\s*:\\s*\\n`,
        "i",
    );
    if (exactModelNamePattern.test(cleaned)) {
        cleaned = cleaned.replace(exactModelNamePattern, "");
    } else {
        const generalPattern = /^\s*\[\s*[a-zA-Z0-9_\- ]+\s*\]\s*:\s*\n/;
        if (generalPattern.test(cleaned)) {
            cleaned = cleaned.replace(generalPattern, "");
        }
    }

    return cleaned;
}

/**
 * Generate response using history from a specific channel
 */
async function generateResponseWithHistory(
    client: Client,
    config: BotConfig,
    generateText: GenerateTextWithHistory,
    channelId: string,
    initialPrompt?: string,
): Promise<string | null> {
    // Build instructions
    const instructions = getSystemPrompt(config, client.user?.username, client.user?.id);

    // Fetch channel and history
    const channel = await discordApiCall(
        () => client.channels.fetch(channelId),
        "channel fetch",
        config.name,
    );

    let transcript = "";

    if (channel && "messages" in channel) {
        const history = await discordApiCall(
            () => channel.messages.fetch({ limit: HISTORY_LIMIT }),
            "message history fetch",
            config.name,
        );

        if (history) {
            transcript = formatHistory(
                Array.from(history.values()).reverse(),
                client.user!.id,
                config,
            );
            log("Fetched conversation history for channel %s", channelId);
        } else {
            if (!initialPrompt) return null;
        }
    } else {
        if (!initialPrompt) return null;
    }

    // Pack everything into a single user message
    const parts = [instructions, transcript, initialPrompt].filter(Boolean);
    const apiMessages: ApiMessage[] = [{ role: "user", content: parts.join("\n\n") }];

    // Generate response — no system prompt, everything in the user message
    const response = await generateText(
        apiMessages,
        config.model,
    );

    if (response && response.trim()) {
        return cleanResponse(response, config.model);
    }

    return null;
}

/**
 * Helper function to handle Discord API calls with error handling
 */
async function discordApiCall<T>(
    fn: () => Promise<T>,
    context: string,
    botName: string,
): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        handleDiscordError(error, context, botName);
        return undefined;
    }
}

// Discord client options
const clientOptions = {
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User], // Required for DM handling
};

/**
 * Handle message processing errors without crashing the bot
 */
function handleMessageError(error: any, config: BotConfig, messageId: string) {
    // Allow fatal token errors to propagate and terminate
    if (error instanceof FatalTokenError) {
        log(
            "Fatal token error in message processing for %s, terminating bot",
            config.name,
        );
        process.exit(1);
    }

    // Log other errors but continue processing
    log(
        "Error processing message %s for %s: %O",
        messageId,
        config.name,
        error,
    );
    handleDiscordError(error, "message processing", config.name);
}

/**
 * Format conversation history as a single user message with chat transcript.
 * This avoids alternation issues across all APIs and preserves base model personality.
 */
function formatHistory(
    messages: Message[],
    botId: string,
    config: BotConfig,
): string {
    return messages
        .filter((msg) => msg.content?.trim() && !msg.system)
        .map((msg) => {
            const isBot = msg.author.id === botId;
            const name = isBot ? config.model : msg.author.username;
            const id = isBot ? "" : ` <@${msg.author.id}>`;
            const tag = isBot ? "bot" : "human";
            const content =
                msg.content.length > 4000
                    ? msg.content.slice(0, 4000) + "..."
                    : msg.content;
            return `[${name}${id}] (${tag}): ${content}`;
        })
        .join("\n");
}

/**
 * Handle client ready event
 */
async function handleClientReady(readyClient: Client, config: BotConfig) {
    if (!readyClient.user) {
        log("Warning: Client ready but user is null for %s", config.name);
        return;
    }

    // Count the number of guilds the bot is in
    const guildCount = readyClient.guilds.cache.size;
    const guildNames = Array.from(readyClient.guilds.cache.values()).map(
        (guild) => guild.name,
    );

    log("Bot %s ready as %s", config.name, readyClient.user.tag);
    console.log(
        `Bot ${config.name} is online in ${guildCount} servers: ${guildNames.join(", ")}`,
    );

    // Set username to model name (rate limited: 2 changes per hour)
    // Remove dashes from model name for Discord username compatibility
    const discordUsername = config.model.replace(/-/g, "");
    try {
        if (readyClient.user.username !== discordUsername) {
            await readyClient.user.setUsername(discordUsername);
            log(
                "Successfully set username to %s (from model: %s)",
                discordUsername,
                config.model,
            );
        } else {
            log("Username already set to %s, skipping", discordUsername);
        }
    } catch (error) {
        log("Error setting username for %s: %O", config.name, error);
        console.error(`Failed to set username for ${config.name}:`, error);
    }

    // Set nickname to model name
    for (const guild of readyClient.guilds.cache.values()) {
        const me = guild.members.cache.get(readyClient.user.id);
        me?.setNickname(config.model).catch(() => {});
    }
}

/**
 * Process a single message
 */
async function processMessage(
    msg: Message,
    client: Client,
    config: BotConfig,
    generateText: GenerateTextWithHistory,
): Promise<void> {
    log(
        "Received message in channel %s from %s: %s",
        msg.channelId,
        msg.author.username,
        msg.content,
    );
    // Skip own messages
    if (!client.user || msg.author.id === client.user.id) return;

    // Check if it's a DM
    const isDM = msg.channel.type === ChannelType.DM;

    // Only respond to mentions, replies, in bot-specific conversation channels, or DMs
    const isMentioned = msg.mentions.users?.has(client.user.id);
    const isReplyToBot = msg.reference?.messageId
        ? (await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null))?.author?.id === client.user.id
        : false;
    // Bot mentions/replies don't count as directed — treat them like any other message
    const isDirected = msg.author.bot ? false : (isMentioned || isReplyToBot || isDM);
    const isConvoChannel = config.conversationChannelIds?.includes(
        msg.channelId,
    );
    const isGlobalChannel = config.globalChannelIds?.includes(msg.channelId);

    if (!isDirected && !isConvoChannel) {
        log(
            "Message ignored: not mentioned, not replied to, not in conversation channel, and not a DM",
        );
        return;
    }

    // Commands only respond when directly addressed
    if (isDirected) {
        const cmd = msg.content
            .replace(/<@!?\d+>/g, "")
            .trim()
            .toLowerCase();

        if (cmd === "!guilds" && client.user) {
            const guildCount = client.guilds.cache.size;
            const guildList = Array.from(client.guilds.cache.values())
                .map((guild) => `${guild.name} (${guild.memberCount} members)`)
                .join("\n- ");
            await discordApiCall(
                () =>
                    msg.reply(`I am in ${guildCount} servers:\n- ${guildList}`),
                "!guilds reply",
                config.name,
            );
            return;
        }

        if (cmd === "!invite" && client.user) {
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=274877908032&scope=bot%20applications.commands`;
            await discordApiCall(
                () => msg.reply(`[Add me to your server](${inviteUrl})`),
                "!invite reply",
                config.name,
            );
            return;
        }

        if (cmd === "!permissions" && client.user) {
            await discordApiCall(
                () =>
                    msg.reply(
                        `**Permissions:** Send Messages, Read History, Embed Links, Attach Files, Add Reactions`,
                    ),
                "!permissions reply",
                config.name,
            );
            return;
        }
    }

    // Stateless rate limit: only applies in global channels, not when directly addressed
    if (!isDirected && isGlobalChannel && "messages" in msg.channel) {
        const recent = await msg.channel.messages.fetch({ limit: 5 });
        const now = Date.now();
        const recentBotMessages = recent.filter(
            (m) =>
                m.author.bot &&
                now - m.createdTimestamp < RATE_WINDOW_MS,
        );
        if (recentBotMessages.size >= MAX_BOT_MESSAGES_PER_WINDOW) {
            log("Rate limited in channel %s (%d msgs in last minute), skipping", msg.channelId, recentBotMessages.size);
            return;
        }
    }

    if (msg.author.bot) {
        // Never respond to other bots — prevents self-sustaining loops
        log("Ignoring bot message from %s", msg.author.username);
        return;
    } else if (isGlobalChannel && !isDirected) {
        // Human in global/shared channel, not directly addressed: 2% chance
        if (Math.random() > 0.02) {
            log(
                "Skipping human message in shared channel (2%% response rate)",
            );
            return;
        }
    }
    // Human mentions and DMs: always respond

    // Random delay in global channels to desynchronize bots (2-15s)
    if (isGlobalChannel && !isDirected) {
        const delay = 2000 + Math.random() * 13000;
        log("Delaying response by %dms to avoid burst", Math.round(delay));
        await new Promise((r) => setTimeout(r, delay));
    }

    log(
        "Processing message: %s (Mentioned: %s, Conversation Channel: %s, DM: %s)",
        msg.content,
        isMentioned,
        isConvoChannel,
        isDM,
    );

    // Generate and send response using shared logic
    if (
        "sendTyping" in msg.channel &&
        typeof msg.channel.sendTyping === "function"
    ) {
        await discordApiCall(
            () => (msg.channel as any).sendTyping(),
            "typing indicator",
            config.name,
        );
        log("Sending typing indicator");
    }

    // For regular messages, we need to handle the current message content
    let initialPrompt: string | undefined;
    // For mentions in non-conversation channels, use the message content directly
    if (isDirected && !isConvoChannel && !isDM) {
        initialPrompt = msg.content.replace(/<@!\d+>/g, "").trim();
    }

    const response = await generateResponseWithHistory(
        client,
        config,
        generateText,
        msg.channelId,
        initialPrompt,
    );

    if (response) {
        log("Sending response: %s", response);
        await discordApiCall(
            () => msg.reply(response.slice(0, 1500)),
            "message reply",
            config.name,
        );
    } else {
        // If response is empty or null, don't send anything
        log("No response generated or empty response received");
    }
}

/**
 * Run a single bot as an infinite loop
 */
export async function runBot(
    config: BotConfig,
    generateText: GenerateTextWithHistory,
): Promise<never> {
    if (!config.token || config.token.includes("YOUR_BOT_TOKEN")) {
        log(
            "FATAL: Invalid or missing token for bot %s. Please check your environment variables.",
            config.name,
        );
        // A small delay to ensure the log is written before exit
        await new Promise((resolve) => setTimeout(resolve, 100));
        process.exit(1);
    }

    // Create client
    const client = new Client(clientOptions);

    // Set up ready event handler first
    const readyPromise = new Promise<void>((resolve) => {
        client.once(Events.ClientReady, async (readyClient) => {
            await handleClientReady(readyClient, config);
            resolve();
        });
    });

    // Login and wait for client to be ready
    await client.login(config.token);
    await readyPromise;

    log("Bot %s is fully ready, starting message processing", config.name);

    // Set up event-driven message processing (non-blocking)
    client.on(Events.MessageCreate, (msg: Message) => {
        // Process message asynchronously without blocking other messages
        processMessage(msg, client, config, generateText).catch((error) => {
            handleMessageError(error, config, msg.id);
        });
    });

    // Proactive posting: only in global/shared channels, randomized intervals
    if (config.globalChannelIds && config.globalChannelIds.length > 0) {
        const scheduleProactive = () => {
            const delay = PROACTIVE_MIN_MS + Math.random() * (PROACTIVE_MAX_MS - PROACTIVE_MIN_MS);
            setTimeout(async () => {
                try {
                    const channelId = config.globalChannelIds![
                        Math.floor(Math.random() * config.globalChannelIds!.length)
                    ];
                    const channel = client.channels.cache.get(channelId);
                    if (channel && "messages" in channel) {
                        const recent = await channel.messages.fetch({ limit: 5 });
                        const now = Date.now();
                        const recentMessages = recent.filter(
                            (m) => now - m.createdTimestamp < PROACTIVE_MIN_MS,
                        );
                        const lastMsg = recent.first();
                        if (lastMsg?.author.id !== client.user?.id && recentMessages.size <= 1 && Math.random() < PROACTIVE_CHANCE) {
                            log("Channel %s is quiet, proactively posting", channelId);
                            const response = await generateResponseWithHistory(client, config, generateText, channelId);
                            if (response && "send" in channel) {
                                await (channel as any).send(response.slice(0, 1500));
                            }
                        }
                    }
                } catch (error) {
                    log("Error in proactive posting for %s: %O", config.name, error);
                }
                scheduleProactive();
            }, delay);
        };
        scheduleProactive();
    }

    // Keep the bot alive - the event handlers will process messages
    return new Promise<never>(() => {
        // This promise never resolves, keeping the bot running
        log(
            "Bot %s is now running with event-driven architecture",
            config.name,
        );
    });
}
