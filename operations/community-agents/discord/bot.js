#!/usr/bin/env node
import "dotenv/config";
import { pathToFileURL } from "node:url";
import {
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    SlashCommandBuilder,
} from "discord.js";
import { loadConfig } from "./config.js";
import {
    askAgent,
    getUserInfo,
    isAuthorizationError,
    isBudgetError,
    startDeviceAuthorization,
} from "./pollinations.js";
import { TokenStore } from "./store.js";

const CONTEXT_MARKER = "pollinations-community-agent:v1";
const MAX_CONTEXT_TURNS = 5;
const activeAuthorizations = new Map();

export function commands(agentName) {
    return [
        new SlashCommandBuilder()
            .setName("connect")
            .setDescription("Connect your Pollinations account"),
        new SlashCommandBuilder()
            .setName("ask")
            .setDescription(`Ask ${agentName}`.slice(0, 100))
            .addStringOption((option) =>
                option
                    .setName("prompt")
                    .setDescription("Question or task")
                    .setRequired(true)
                    .setMaxLength(1000),
            ),
        new SlashCommandBuilder()
            .setName("status")
            .setDescription("Show your Pollinations connection status"),
        new SlashCommandBuilder()
            .setName("disconnect")
            .setDescription("Forget your Pollinations authorization"),
    ].map((command) => command.toJSON());
}

function displayName(user) {
    return (
        user?.preferred_username ||
        user?.githubUsername ||
        user?.name ||
        "Pollinations user"
    );
}

export function safeErrorLabel(error) {
    return (
        String(error?.code || "REQUEST_FAILED")
            .replace(/[^A-Z0-9_-]/gi, "")
            .slice(0, 48) || "REQUEST_FAILED"
    );
}

export function answerEmbeds(config, prompt, answer, discordUserId) {
    const text = answer || "The agent returned an empty response.";
    const footer = `${CONTEXT_MARKER} · agent=${config.agentId} · user=${discordUserId}`;
    const embeds = [
        new EmbedBuilder()
            .setTitle(config.agentName.slice(0, 256))
            .setDescription(text.slice(0, 3900))
            .addFields({ name: "Question", value: prompt.slice(0, 1024) })
            .setFooter({ text: footer }),
    ];
    if (text.length > 3900) {
        embeds.push(
            new EmbedBuilder()
                .setDescription(
                    `${text.slice(3900, 5800)}${text.length > 5800 ? "\n\n…response truncated for Discord" : ""}`,
                )
                .setFooter({ text: `${CONTEXT_MARKER}:continuation` }),
        );
    }
    return embeds;
}

export function messagesFromDiscordHistory(
    messages,
    botUserId,
    discordUserId,
    agentId,
) {
    const turns = [];
    const ordered = [...messages].sort(
        (a, b) =>
            Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0),
    );
    for (const message of ordered) {
        if (message.author?.id !== botUserId) continue;
        const embed = message.embeds?.[0];
        const footer = embed?.footer?.text || "";
        if (
            !footer.startsWith(CONTEXT_MARKER) ||
            footer.includes(":continuation") ||
            !footer.includes(`agent=${agentId}`) ||
            !footer.includes(`user=${discordUserId}`)
        )
            continue;
        const question = embed.fields?.find(
            (field) => field.name === "Question",
        )?.value;
        if (!question || !embed.description) continue;
        turns.push(
            { role: "user", content: question },
            { role: "assistant", content: embed.description },
        );
    }
    return turns.slice(-MAX_CONTEXT_TURNS * 2);
}

async function discordContext(interaction, agentId) {
    if (!interaction.channel?.messages || !interaction.client.user) return [];
    const recent = await interaction.channel.messages.fetch({ limit: 30 });
    return messagesFromDiscordHistory(
        recent.values(),
        interaction.client.user.id,
        interaction.user.id,
        agentId,
    );
}

async function connectedUser(store, discordUserId, userInfo) {
    const record = await store.get(discordUserId);
    if (!record?.token) return null;
    try {
        return { record, user: await userInfo(record.token) };
    } catch (error) {
        if (!isAuthorizationError(error)) throw error;
        await store.delete(discordUserId);
        return null;
    }
}

export function createInteractionHandler({
    config,
    store,
    authorize = startDeviceAuthorization,
    userInfo = getUserInfo,
    agent = askAgent,
}) {
    return async function handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return;
        const userId = interaction.user.id;

        if (interaction.commandName === "connect") {
            const connected = await connectedUser(store, userId, userInfo);
            if (connected) {
                await interaction.reply({
                    content: `Already connected as **@${displayName(connected.user)}**.`,
                    ephemeral: true,
                });
                return;
            }
            if (activeAuthorizations.has(userId)) {
                await interaction.reply({
                    content:
                        "A device authorization is already waiting for you.",
                    ephemeral: true,
                });
                return;
            }

            const auth = await authorize(config);
            await interaction.reply({
                content: `Open ${auth.verificationUri}\nCode: **${auth.userCode}**\n\nThis message is private to you.`,
                ephemeral: true,
            });
            const pending = (async () => {
                try {
                    const token = await auth.poll();
                    const user = await userInfo(token);
                    await store.set(userId, {
                        token,
                        username: displayName(user),
                        connectedAt: new Date().toISOString(),
                    });
                    await interaction
                        .editReply(
                            `Connected as **@${displayName(user)}**. Your authorization stays private.`,
                        )
                        .catch(() => {});
                } catch (error) {
                    await interaction
                        .editReply(
                            `Connection did not complete (${safeErrorLabel(error)}). Run \`/connect\` to try again.`,
                        )
                        .catch(() => {});
                } finally {
                    activeAuthorizations.delete(userId);
                }
            })();
            activeAuthorizations.set(userId, pending);
            return;
        }

        if (interaction.commandName === "disconnect") {
            await store.delete(userId);
            await interaction.reply({
                content:
                    "Disconnected. This bot forgot your Pollinations authorization.",
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName === "status") {
            const connected = await connectedUser(store, userId, userInfo);
            await interaction.reply({
                content: connected
                    ? `Connected as **@${displayName(connected.user)}** to **${config.agentName}**.`
                    : "Not connected. Run `/connect` first.",
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName !== "ask") return;
        const record = await store.get(userId);
        if (!record?.token) {
            await interaction.reply({
                content:
                    "Run `/connect` first. Never paste an API key into Discord.",
                ephemeral: true,
            });
            return;
        }

        const prompt = interaction.options.getString("prompt", true);
        await interaction.deferReply();
        try {
            const context = await discordContext(interaction, config.agentId);
            const answer = await agent(
                record.token,
                [...context, { role: "user", content: prompt }],
                config.agentId,
            );
            await interaction.editReply({
                embeds: answerEmbeds(config, prompt, answer, userId),
            });
        } catch (error) {
            if (isAuthorizationError(error)) {
                await store.delete(userId);
                await interaction.editReply(
                    "Your Pollinations authorization expired or was revoked. Run `/connect` again.",
                );
                return;
            }
            if (isBudgetError(error)) {
                await interaction.editReply(
                    "Not enough Pollen. Earn some at https://enter.pollinations.ai/quests or add more at https://enter.pollinations.ai/account",
                );
                return;
            }
            console.error("[ask failed]", safeErrorLabel(error));
            await interaction.editReply(
                `The agent request failed (${safeErrorLabel(error)}). Try again in a moment.`,
            );
        }
    };
}

export async function startBot(config = loadConfig()) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const handler = createInteractionHandler({
        config,
        store: new TokenStore(
            process.env.TOKEN_STORE_PATH ||
                `./data/${config.discordClientId}.json`,
        ),
    });
    client.once(Events.ClientReady, (ready) => {
        console.log(`[ready] ${ready.user.tag} · agent=${config.agentId}`);
    });
    client.on(Events.InteractionCreate, (interaction) => {
        handler(interaction).catch(async (error) => {
            console.error("[interaction failed]", safeErrorLabel(error));
            if (!interaction.isRepliable()) return;
            const message = "That command failed. Please try again.";
            if (interaction.deferred || interaction.replied)
                await interaction.editReply(message).catch(() => {});
            else
                await interaction
                    .reply({ content: message, ephemeral: true })
                    .catch(() => {});
        });
    });
    await client.login(config.discordToken);
    return client;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    startBot().catch((error) => {
        console.error("[startup failed]", safeErrorLabel(error));
        process.exit(1);
    });
}
