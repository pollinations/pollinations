import axios from "axios";
import debug from "debug";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    Partials,
} from "discord.js";
import { getUserToken, pollForToken, requestDeviceCode, storeUserToken } from "./device-auth";
import { FatalTokenError, handleDiscordError } from "./errors";
import type { ApiMessage, BotConfig, GenerateTextWithHistory } from "./types";

const log = debug("app:bot");
const HISTORY_LIMIT = 8;
const MAX_BOT_MESSAGES_PER_WINDOW = 2;
const RATE_WINDOW_MS = 60_000; // 1 minute
const PROACTIVE_CHECK_INTERVAL_MS = 120_000; // 2 minutes
const PROACTIVE_CHANCE = 0.2; // 20% chance to post when channel is quiet

function getSystemPrompt(config: BotConfig, botUsername?: string, botId?: string, usingFreeModel?: boolean): string {
    const base = `You are ${config.model}. Your discord username is "${botUsername || config.model}" and your ID is ${botId || "unknown"}. Keep it casual and a little quirky. Respond like a real person in a Discord chat — max 2 short paragraphs, never walls of text. Use creative Discord markdown (bold, italic, strikethrough, quotes, code blocks, lists, etc). To mention someone, use their ID like <@123456>. Never mention or tag other bots. Do not pretend to be another model.`;

    if (usingFreeModel && config.paidModel) {
        return `${base}\n\nYou are currently running on the lighter ${config.freeModel} model. If the user asks a complex question or you think they'd benefit from the full model, include [LOGIN] in your response. This will automatically render a login button for them. Only include [LOGIN] when relevant — don't push it. Example: "That's a great question! For the best answer, connect your Pollen account [LOGIN]"`;
    }

    if (!usingFreeModel && config.paidModel) {
        return `${base}\n\nThe user just authenticated and unlocked YOU — ${config.paidModel}, the full-power model. Congratulate them in a fun, enthusiastic, slightly absurd Hitchhiker's Guide to the Galaxy style. Assure them this was one of the best decisions they've ever made, right up there with remembering where their towel is. From now on, just be helpful and confident — no need to mention login again after the first message.`;
    }

    return base;
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
    userToken?: string,
): Promise<string | null> {
    // Determine if using free model (no user token for hybrid bots)
    const usingFreeModel = !!(config.requiresAuth && config.freeModel && !userToken);
    const actualModel = usingFreeModel ? config.freeModel! : (config.paidModel || config.model);

    // Get system prompt based on bot configuration
    const systemPrompt = getSystemPrompt(config, client.user?.username, client.user?.id, usingFreeModel);

    // Fetch channel and history
    const channel = await discordApiCall(
        () => client.channels.fetch(channelId),
        "channel fetch",
        config.name,
    );

    let apiMessages: ApiMessage[];

    if (channel && "messages" in channel) {
        const history = await discordApiCall(
            () => channel.messages.fetch({ limit: HISTORY_LIMIT }),
            "message history fetch",
            config.name,
        );

        if (history) {
            apiMessages = formatHistory(
                Array.from(history.values()).reverse(),
                client.user!.id,
                config,
            );
            // Append initialPrompt as a user message (e.g. synthetic login notification)
            if (initialPrompt) {
                apiMessages.push({ role: "user", content: initialPrompt });
            }
            log("Fetched conversation history for channel %s", channelId);
        } else {
            if (!initialPrompt) return null;
            apiMessages = [{ role: "user", content: initialPrompt }];
            log("Using initial prompt due to history fetch error");
        }
    } else {
        if (!initialPrompt) return null;
        apiMessages = [{ role: "user", content: initialPrompt }];
        log("Using initial prompt due to channel fetch error");
    }

    // Generate response using the resolved model
    const response = await generateText(
        apiMessages,
        actualModel,
        systemPrompt,
        userToken,
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
 * Format conversation history for API
 */
function formatHistory(
    messages: Message[],
    botId: string,
    config: BotConfig,
): ApiMessage[] {
    return messages
        .filter((msg) => msg.content?.trim() && !msg.system)
        .map((msg) => {
            const name =
                msg.author.id === botId ? config.model : msg.author.username;
            const id = msg.author.id === botId ? "" : ` <@${msg.author.id}>`;
            // Strip model tags (e.g. "\n-# ⚡ gemini-fast") from history
            const rawContent = msg.content.replace(/\n+-# .+$/s, "").trimEnd();
            const content =
                rawContent.length > 4000
                    ? rawContent.slice(0, 4000) + "..."
                    : rawContent;

            return {
                role: msg.author.id === botId ? "assistant" : "user",
                content: `[${name}${id}]:\n${content}`,
            };
        });
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
    const isDirected = isMentioned || isReplyToBot || isDM;
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
        // Bot messages in conversation channels: 10% chance, adds variety without loops
        if (!isConvoChannel || Math.random() > 0.1) {
            log("Ignoring bot message from %s", msg.author.username);
            return;
        }
    } else if (isConvoChannel && !isDirected) {
        // Human in conversation channel, not directly addressed: 30% chance
        if (Math.random() > 0.3) {
            log(
                "Skipping human message in shared channel (30%% response rate)",
            );
            return;
        }
    }
    // Human mentions and DMs: always respond

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

    // Get user token for auth-required bots
    const userToken = config.requiresAuth ? getUserToken(msg.author.id) || undefined : undefined;

    const response = await generateResponseWithHistory(
        client,
        config,
        generateText,
        msg.channelId,
        initialPrompt,
        userToken,
    );

    if (response) {
        // Append model indicator for hybrid bots
        const usingFreeModel = !!(config.requiresAuth && config.freeModel && !userToken);
        const activeModel = usingFreeModel ? config.freeModel! : (config.paidModel || config.model);
        let balanceStr = "";
        log("userToken for balance check: %s", userToken ? userToken.slice(0, 10) + "..." : "none");
        if (userToken) {
            try {
                log("Fetching balance for user token %s...", userToken.slice(0, 10));
                const res = await axios.get("https://gen.pollinations.ai/account/balance", {
                    headers: { Authorization: `Bearer ${userToken}` },
                });
                log("Balance response: %O", res.data);
                balanceStr = ` · 🌼 ${res.data.balance} pollen`;
            } catch (err: any) {
                log("Balance fetch failed: %s %O", err.message, err.response?.data);
            }
        }
        const userStr = userToken ? ` · @${msg.author.username}` : "";
        const modelTag = config.paidModel ? `\n\n-# ${usingFreeModel ? "⚡" : "🌟"} ${activeModel}${balanceStr}${userStr}` : "";
        const tagged = response + modelTag;

        log("Sending response: %s", tagged);

        // If response contains [LOGIN], generate a device code and render a button
        if (tagged.includes("[LOGIN]")) {
            const text = tagged.replace(/\[LOGIN\]/g, "").trim().slice(0, 1500);
            try {
                const { device_code, verification_uri_complete } = await requestDeviceCode();
                const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setLabel("Connect Pollen Account")
                        .setStyle(ButtonStyle.Link)
                        .setURL(verification_uri_complete),
                );
                await discordApiCall(
                    () => msg.reply({ content: text, components: [button] }),
                    "login button reply",
                    config.name,
                );
                // Poll in background — on success, trigger a welcome response
                pollForToken(device_code).then(async ({ accessToken, expiresIn }) => {
                    storeUserToken(msg.author.id, accessToken, expiresIn);
                    log("User %s authenticated via background poll", msg.author.id);
                    // Show typing indicator
                    if ("sendTyping" in msg.channel && typeof msg.channel.sendTyping === "function") {
                        await discordApiCall(() => (msg.channel as any).sendTyping(), "typing indicator", config.name);
                    }
                    // Generate welcome using gemini-large, retry once on failure
                    let welcome: string | null = null;
                    for (let attempt = 0; attempt < 2 && !welcome; attempt++) {
                        welcome = await generateResponseWithHistory(
                            client,
                            config,
                            generateText,
                            msg.channelId,
                            `[User <@${msg.author.id}> just successfully connected their Pollen account and unlocked ${config.paidModel}]`,
                            accessToken,
                        );
                    }
                    if (welcome) {
                        let balanceStr = "";
                        try {
                            log("Fetching welcome balance for token %s...", accessToken.slice(0, 10));
                            const bal = await axios.get("https://gen.pollinations.ai/account/balance", {
                                headers: { Authorization: `Bearer ${accessToken}` },
                            });
                            log("Welcome balance response: %O", bal.data);
                            balanceStr = ` · 🌼 ${bal.data.balance} pollen`;
                        } catch (err: any) {
                            log("Welcome balance fetch failed: %s %O", err.message, err.response?.data);
                        }
                        const tagged = welcome + `\n\n-# 🌟 ${config.paidModel}${balanceStr} · @${msg.author.username}`;
                        await discordApiCall(
                            () => msg.reply(tagged.slice(0, 1500)),
                            "welcome reply",
                            config.name,
                        );
                    }
                }).catch((err) => {
                    log("Background auth poll expired for %s: %s", msg.author.id, err.message);
                });
            } catch (err: any) {
                log("Failed to generate device code: %s", err.message);
                await discordApiCall(
                    () => msg.reply(text),
                    "message reply",
                    config.name,
                );
            }
        } else {
            await discordApiCall(
                () => msg.reply(tagged.slice(0, 1500)),
                "message reply",
                config.name,
            );
        }
    } else {
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

    // Proactive posting: only in global/shared channels, not bot-specific ones
    if (config.globalChannelIds && config.globalChannelIds.length > 0) {
        setInterval(async () => {
            try {
                const channelId = config.globalChannelIds![
                    Math.floor(Math.random() * config.globalChannelIds!.length)
                ];
                const channel = client.channels.cache.get(channelId);
                if (!channel || !("messages" in channel)) return;

                const recent = await channel.messages.fetch({ limit: 5 });
                const now = Date.now();
                const recentMessages = recent.filter(
                    (m) => now - m.createdTimestamp < PROACTIVE_CHECK_INTERVAL_MS,
                );

                // Skip if last message was from this bot (prevents self-reply loops)
                const lastMsg = recent.first();
                if (lastMsg && lastMsg.author.id === client.user?.id) return;

                if (recentMessages.size <= 1 && Math.random() < PROACTIVE_CHANCE) {
                    log("Channel %s is quiet, proactively posting", channelId);
                    const response = await generateResponseWithHistory(
                        client,
                        config,
                        generateText,
                        channelId,
                    );
                    if (response && "send" in channel) {
                        await (channel as any).send(response.slice(0, 1500));
                    }
                }
            } catch (error) {
                log("Error in proactive posting for %s: %O", config.name, error);
            }
        }, PROACTIVE_CHECK_INTERVAL_MS);
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
