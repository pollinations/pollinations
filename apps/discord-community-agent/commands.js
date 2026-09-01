/**
 * Slash-command handlers: /connect, /chat, /disconnect.
 *
 * Kept free of discord.js specifics: each handler receives a small
 * interaction-shaped object plus injectable services, so the whole
 * connect → use → disconnect flow is testable with plain mocks.
 */

import {
    askAgent,
    getUserInfo,
    PublicError,
    pollForToken,
    startDeviceFlow,
} from "./pollinations.js";

/** Discord messages cap at 2000 characters. */
const MAX_REPLY = 1990;

/**
 * Hard cap on user prompt length. Unbounded prompts would let a single
 * message burn arbitrary amounts of the user's Pollen (or stall the agent),
 * so over-long prompts are refused before any network call.
 */
export const MAX_PROMPT_LENGTH = 4000;

/** Build the conversation sent to the hosted agent from Discord context. */
export function buildMessages({ username, prompt, history = [] }) {
    return [...history, { role: "user", content: `${username}: ${prompt}` }];
}

async function safeEdit(interaction, content) {
    await interaction.editReply(content.slice(0, MAX_REPLY)).catch(() => {});
}

/** /connect — start device auth, DM the verification link, poll, store. */
export async function handleConnect(
    interaction,
    { appKey, store, fetchImpl = fetch },
) {
    await interaction.deferReply({ ephemeral: true });
    if (store.get(interaction.user.id)) {
        return safeEdit(
            interaction,
            "Already connected. Use `/disconnect` first to re-authorize.",
        );
    }
    try {
        const code = await startDeviceFlow(appKey, fetchImpl);
        const link = `${interaction.client?.enterUrl ?? "https://enter.pollinations.ai"}/device`;
        const dmText =
            "**Connect Pollinations**\n" +
            `1. Open ${code.verification_uri_complete ?? link}\n` +
            `2. Approve code: \`${code.user_code}\`\n` +
            "The code expires in " +
            `${Math.round((code.expires_in ?? 600) / 60)} minutes.`;
        // Prefer a DM so the link/code stays private; fall back to the
        // ephemeral reply (visible only to this user) if DMs are closed.
        const dmSent = await interaction.user
            .send(dmText)
            .then(() => true)
            .catch(() => false);
        await safeEdit(
            interaction,
            dmSent
                ? "Check your DMs to approve the connection. Waiting… ⏳"
                : dmText,
        );
        const token = await pollForToken(appKey, code.device_code, {
            interval: code.interval,
            expiresIn: code.expires_in,
            fetchImpl,
        });
        store.set(interaction.user.id, token);
        const info = await getUserInfo(token, fetchImpl).catch(() => null);
        const name = info?.preferred_username ?? "your Pollinations account";
        await safeEdit(
            interaction,
            `✅ Connected as **${name}**. Use \`/chat\` to talk to the agent — it spends your Pollen.`,
        );
    } catch (err) {
        await safeEdit(
            interaction,
            err instanceof PublicError
                ? `❌ ${err.message}`
                : "❌ Sign-in failed. Run `/connect` to try again.",
        );
    }
}

/** /chat — forward the prompt (plus recent channel context) to the agent. */
export async function handleChat(
    interaction,
    { store, fetchImpl = fetch, history = [] },
) {
    const token = store.get(interaction.user.id);
    if (!token) {
        return interaction.reply({
            content: "Connect your Pollinations account first with `/connect`.",
            ephemeral: true,
        });
    }
    const prompt = interaction.options.getString("prompt", true);
    if (prompt.length > MAX_PROMPT_LENGTH) {
        return interaction.reply({
            content:
                `❌ Prompts are limited to ${MAX_PROMPT_LENGTH} characters ` +
                `(yours has ${prompt.length}). Please shorten it.`,
            ephemeral: true,
        });
    }
    await interaction.deferReply();
    try {
        const answer = await askAgent(
            token,
            buildMessages({
                username: interaction.user.username,
                prompt,
                history,
            }),
            fetchImpl,
        );
        await safeEdit(interaction, answer);
    } catch (err) {
        // Expired/revoked key: drop it locally and offer a clear reconnect.
        if (
            err instanceof PublicError &&
            err.message.startsWith("expired-token")
        ) {
            store.delete(interaction.user.id);
            return safeEdit(
                interaction,
                `❌ ${err.message.replace("expired-token: ", "")}`,
            );
        }
        await safeEdit(
            interaction,
            err instanceof PublicError
                ? `❌ ${err.message}`
                : "❌ Something went wrong. Please try again.",
        );
    }
}

/** /disconnect — remove the stored key. */
export async function handleDisconnect(interaction, { store }) {
    const had = store.get(interaction.user.id);
    store.delete(interaction.user.id);
    await interaction.reply({
        content: had
            ? "✅ Disconnected — your key was removed from this bot. " +
              "You can also revoke it anytime at https://enter.pollinations.ai/keys"
            : "No Pollinations account was connected.",
        ephemeral: true,
    });
}

/** Route a chat-input command to its handler. */
export async function handleCommand(interaction, services) {
    if (!interaction.isChatInputCommand()) return;
    const handlers = {
        connect: handleConnect,
        chat: handleChat,
        disconnect: handleDisconnect,
    };
    const handler = handlers[interaction.commandName];
    if (!handler) return;
    await handler(interaction, services).catch(() =>
        interaction
            .reply({ content: "Something went wrong.", ephemeral: true })
            .catch(() => {}),
    );
}
