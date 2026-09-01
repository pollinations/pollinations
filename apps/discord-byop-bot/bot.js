/**
 * Discord BYOP bot — demonstrates Pollinations device authorization flow.
 *
 * Users connect their Pollinations wallet via `/connect` (device flow — no API
 * key pasting). Once connected, `/ask` and `/imagine` spend from their own
 * Pollen balance. `/disconnect` removes the stored credential.
 *
 * Token persistence: data/tokens.json (gitignored). The file maps Discord user
 * IDs to { token, connectedAt } so connections survive restarts.
 *
 * Required env vars:
 *   DISCORD_TOKEN   — bot token from the Discord developer portal
 *   CLIENT_ID       — Discord application (client) ID
 *   APP_KEY         — Pollinations publishable key (pk_…) for attribution
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits, MessageFlags } from "discord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENTER_URL = process.env.ENTER_URL ?? "https://enter.pollinations.ai";
const GEN_URL = process.env.GEN_URL ?? "https://gen.pollinations.ai";
const APP_KEY = process.env.APP_KEY ?? "";
const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? "";
const TOKEN_FILE = join(__dirname, "data", "tokens.json");

// ── Token store ──────────────────────────────────────────────────────────────

function loadTokens() {
    if (!existsSync(TOKEN_FILE)) return {};
    try {
        return JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    } catch {
        return {};
    }
}

function saveTokens(map) {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true });
    writeFileSync(TOKEN_FILE, JSON.stringify(map, null, 2));
}

const tokenStore = loadTokens();

function storeToken(userId, token) {
    tokenStore[userId] = { token, connectedAt: new Date().toISOString() };
    saveTokens(tokenStore);
}

function removeToken(userId) {
    delete tokenStore[userId];
    saveTokens(tokenStore);
}

// ── Pollinations device flow ─────────────────────────────────────────────────

async function startDeviceFlow() {
    const res = await fetch(`${ENTER_URL}/api/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: APP_KEY }).toString(),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Device flow start failed (${res.status}): ${text}`);
    }
    return res.json();
}

async function pollForToken(deviceCode, signal) {
    let intervalMs = 5000;
    while (true) {
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise((r) => setTimeout(r, intervalMs));
        if (signal?.aborted) throw new Error("Cancelled");

        const res = await fetch(`${ENTER_URL}/api/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: deviceCode,
                client_id: APP_KEY,
            }).toString(),
            signal,
        });

        const body = await res.json().catch(() => ({}));

        if (res.ok && body.access_token) return body.access_token;
        if (body.error === "authorization_pending") continue;
        if (body.error === "slow_down") {
            intervalMs += 5000;
            continue;
        }
        if (body.error === "expired_token")
            throw new Error("Code expired — run /connect again.");
        if (body.error === "access_denied")
            throw new Error("Authorization denied.");
        throw new Error(
            body.error_description || body.error || "Unknown error",
        );
    }
}

async function getUserInfo(token) {
    const res = await fetch(`${ENTER_URL}/api/device/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
}

// ── Pollinations generation ──────────────────────────────────────────────────

async function generateText(token, prompt) {
    const res = await fetch(`${GEN_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: prompt }],
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401)
            throw new Error("Token expired — run /connect again.");
        throw new Error(
            data.error?.message || `Generation failed (${res.status})`,
        );
    }
    return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
}

async function generateImage(token, prompt) {
    const encoded = encodeURIComponent(prompt);
    const url = `${GEN_URL}/image/${encoded}?model=flux&nologo=true`;
    const res = await fetch(url, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        if (res.status === 401)
            throw new Error("Token expired — run /connect again.");
        throw new Error(`Image generation failed (${res.status})`);
    }
    // Return the final URL after redirects (which is the image URL)
    return res.url || url;
}

// ── Command handlers ─────────────────────────────────────────────────────────

async function handleConnect(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (tokenStore[interaction.user.id]) {
        await interaction.editReply(
            "Already connected. Use `/disconnect` first if you want to re-authorize.",
        );
        return;
    }

    let code;
    try {
        code = await startDeviceFlow();
    } catch (err) {
        await interaction.editReply(
            `Failed to start authorization: ${err.message}`,
        );
        return;
    }

    const expireMin = Math.round((code.expires_in ?? 300) / 60);
    const authMessage =
        `**Connect your Pollinations account**\n\n` +
        `1. Visit: ${code.verification_uri_complete ?? `${ENTER_URL}/device`}\n` +
        `2. Enter code: \`${code.user_code}\`\n\n` +
        `This code expires in ${expireMin} minutes. Waiting…`;

    // Try to DM the code so it stays private
    let dmSent = false;
    try {
        const dm = await interaction.user.createDM();
        await dm.send(authMessage);
        dmSent = true;
    } catch {
        // DMs disabled — fall through to ephemeral reply
    }

    await interaction.editReply(
        dmSent
            ? "Check your DMs for the authorization link. Waiting for approval… ⏳"
            : authMessage,
    );

    // Abort polling when the interaction webhook expires (~14 min)
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 14 * 60 * 1000);

    try {
        const token = await pollForToken(code.device_code, abort.signal);
        clearTimeout(timeout);

        storeToken(interaction.user.id, token);

        const info = await getUserInfo(token).catch(() => null);
        const username =
            info?.preferred_username ?? info?.name ?? "your account";
        await interaction.editReply(
            `✅ Connected as **${username}**! Your Pollen will be used for \`/ask\` and \`/imagine\`.`,
        );
    } catch (err) {
        clearTimeout(timeout);
        await interaction.editReply(`❌ ${err.message}`).catch(() => {});
    }
}

async function handleDisconnect(interaction) {
    if (!tokenStore[interaction.user.id]) {
        await interaction.reply({
            content:
                "No Pollinations account connected. Use `/connect` to link one.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    removeToken(interaction.user.id);
    await interaction.reply({
        content: "✅ Disconnected. Your Pollinations token has been removed.",
        flags: MessageFlags.Ephemeral,
    });
}

async function handleAsk(interaction) {
    const entry = tokenStore[interaction.user.id];
    if (!entry) {
        await interaction.reply({
            content: "Connect first with `/connect`.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const prompt = interaction.options.getString("prompt", true);
    await interaction.deferReply();

    try {
        const text = await generateText(entry.token, prompt);
        const truncated = text.length > 1900 ? `${text.slice(0, 1900)}…` : text;
        await interaction.editReply(truncated);
    } catch (err) {
        if (err.message.includes("expired")) removeToken(interaction.user.id);
        await interaction.editReply(`❌ ${err.message}`);
    }
}

async function handleImagine(interaction) {
    const entry = tokenStore[interaction.user.id];
    if (!entry) {
        await interaction.reply({
            content: "Connect first with `/connect`.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const prompt = interaction.options.getString("prompt", true);
    await interaction.deferReply();

    try {
        const imageUrl = await generateImage(entry.token, prompt);
        await interaction.editReply({ content: imageUrl });
    } catch (err) {
        if (err.message.includes("expired")) removeToken(interaction.user.id);
        await interaction.editReply(`❌ ${err.message}`);
    }
}

// ── Discord client ───────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", (c) => {
    console.log(`Logged in as ${c.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
        case "connect":
            await handleConnect(interaction).catch(console.error);
            break;
        case "disconnect":
            await handleDisconnect(interaction).catch(console.error);
            break;
        case "ask":
            await handleAsk(interaction).catch(console.error);
            break;
        case "imagine":
            await handleImagine(interaction).catch(console.error);
            break;
        default:
            break;
    }
});

if (!DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN is required");
    process.exit(1);
}

client.login(DISCORD_TOKEN);
