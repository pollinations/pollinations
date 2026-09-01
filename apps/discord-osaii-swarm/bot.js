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
import {
    AGENT_MODEL,
    askAgent,
    getUserInfo,
    isAuthorizationError,
    isBudgetError,
    startDeviceAuthorization,
} from "./pollinations.js";
import { TokenStore } from "./store.js";

const CONTEXT_MARKER = "pollinations-osaii-swarm:v1";
const MAX_CONTEXT_TURNS = 5;
const activeAuthorizations = new Map();

export const commandData = [
    new SlashCommandBuilder()
        .setName("connect")
        .setDescription(
            "Connect your Pollinations account with device authorization",
        ),
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask the Pollinations OSAII Swarm Community Agent")
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription("Coding question or task")
                .setRequired(true)
                .setMaxLength(1000),
        ),
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Show your Pollinations connection status"),
    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription("Forget your Pollinations authorization on this bot"),
].map((command) => command.toJSON());

function displayName(userInfo) {
    return (
        userInfo?.preferred_username ||
        userInfo?.githubUsername ||
        userInfo?.name ||
        "Pollinations user"
    );
}

export function safeErrorLabel(error) {
    const code = String(error?.code || "REQUEST_FAILED").replace(
        /[^A-Z0-9_-]/gi,
        "",
    );
    return code.slice(0, 48) || "REQUEST_FAILED";
}

export function answerEmbeds(
    prompt,
    answer,
    username,
    discordUserId = "unknown",
) {
    const clean = answer || "The agent returned an empty response.";
    const first = clean.slice(0, 3900);
    const second = clean.slice(3900, 5800);
    const embeds = [
        new EmbedBuilder()
            .setTitle("Pollinations OSAII Swarm")
            .setDescription(first)
            .addFields({ name: "Question", value: prompt.slice(0, 1024) })
            .setFooter({
                text: `${CONTEXT_MARKER} · user=${discordUserId} · ${username}`,
            }),
    ];
    if (second) {
        embeds.push(
            new EmbedBuilder()
                .setDescription(
                    `${second}${clean.length > 5800 ? "\n\n…response truncated for Discord" : ""}`,
                )
                .setFooter({ text: `${CONTEXT_MARKER}:continuation` }),
        );
    }
    return embeds;
}

export function messagesFromDiscordHistory(
    messages,
    botUserId,
    discordUserId = "unknown",
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
            !footer.includes(`user=${discordUserId}`)
        )
            continue;
        const question = embed.fields?.find(
            (field) => field.name === "Question",
        )?.value;
        const answer = embed.description;
        if (!question || !answer) continue;
        turns.push(
            { role: "user", content: question },
            { role: "assistant", content: answer },
        );
    }
    return turns.slice(-MAX_CONTEXT_TURNS * 2);
}

async function discordContext(interaction) {
    const channel = interaction.channel;
    if (!channel?.messages || !interaction.client.user) return [];
    const recent = await channel.messages.fetch({ limit: 30 });
    return messagesFromDiscordHistory(
        recent.values(),
        interaction.client.user.id,
        interaction.user.id,
    );
}

async function connectedRecord(store, discordUserId, userInfo) {
    const record = await store.get(discordUserId);
    if (!record?.token) return null;
    try {
        const user = await userInfo(record.token);
        return { record, user };
    } catch (error) {
        if (isAuthorizationError(error)) {
            await store.delete(discordUserId);
            return null;
        }
        throw error;
    }
}

export function createInteractionHandler({
    store,
    appKey,
    authorize = startDeviceAuthorization,
    userInfo = getUserInfo,
    agent = askAgent,
}) {
    return async function handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return;
        const userId = interaction.user.id;

        if (interaction.commandName === "connect") {
            const existing = await connectedRecord(store, userId, userInfo);
            if (existing) {
                await interaction.reply({
                    content: `Already connected as **@${displayName(existing.user)}**.`,
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

            const auth = await authorize(appKey);
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
                    "Disconnected. This bot no longer stores your Pollinations authorization.",
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName === "status") {
            const connected = await connectedRecord(store, userId, userInfo);
            await interaction.reply({
                content: connected
                    ? `Connected as **@${displayName(connected.user)}** to **${AGENT_MODEL}** (0-Pollen consent budget).`
                    : "Not connected. Run `/connect` first.",
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName === "ask") {
            const record = await store.get(userId);
            if (!record?.token) {
                await interaction.reply({
                    content:
                        "Run `/connect` first. You never need to paste an API key into Discord.",
                    ephemeral: true,
                });
                return;
            }

            const prompt = interaction.options.getString("prompt", true);
            await interaction.deferReply();
            try {
                const context = await discordContext(interaction);
                const answer = await agent(record.token, [
                    ...context,
                    { role: "user", content: prompt },
                ]);
                await interaction.editReply({
                    embeds: answerEmbeds(
                        prompt,
                        answer,
                        interaction.user.username,
                        userId,
                    ),
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
                        "This demo authorization has a 0-Pollen budget. The selected Community Agent is no longer free under the current pricing, so nothing was charged.",
                    );
                    return;
                }
                console.error("[ask failed]", safeErrorLabel(error));
                await interaction.editReply(
                    `The agent request failed (${safeErrorLabel(error)}). Try again in a moment.`,
                );
            }
        }
    };
}

export async function startBot() {
    const token = process.env.DISCORD_TOKEN;
    const appKey = process.env.POLLINATIONS_APP_KEY;
    if (!token || !appKey) {
        throw new Error("DISCORD_TOKEN and POLLINATIONS_APP_KEY are required");
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const store = new TokenStore();
    const handler = createInteractionHandler({ store, appKey });

    client.once(Events.ClientReady, (ready) => {
        console.log(`[ready] ${ready.user.tag} · agent=${AGENT_MODEL}`);
    });
    client.on(Events.InteractionCreate, (interaction) => {
        handler(interaction).catch(async (error) => {
            console.error("[interaction failed]", safeErrorLabel(error));
            if (interaction.isRepliable()) {
                const message = "That command failed. Please try again.";
                if (interaction.deferred || interaction.replied)
                    await interaction.editReply(message).catch(() => {});
                else
                    await interaction
                        .reply({ content: message, ephemeral: true })
                        .catch(() => {});
            }
        });
    });
    await client.login(token);
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
