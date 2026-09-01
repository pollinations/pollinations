#!/usr/bin/env node
/**
 * Pollinations Discord Bot with BYOP (Bring Your Own Pollen).
 *
 * Uses a Pollinations Community Agent as the AI backend. Each Discord user
 * authorizes their own Pollinations account via device flow — the bot never
 * stores or sees API keys.
 *
 * Setup:
 *   1. Create a Discord bot at https://discord.com/developers/applications
 *   2. Copy .env.example to .env and fill in credentials
 *   3. npm install && npm start
 *
 * Slash commands:
 *   /connect   — Connect your Pollinations account via device flow
 *   /disconnect — Disconnect your account
 *   /ask <question> — Ask the community agent a question
 *   /status    — Check your connection status
 */

import {
    Client,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    type Message,
    Partials,
} from "discord.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ENTER_BASE = "https://enter.pollinations.ai";
const GEN_BASE = "https://gen.pollinations.ai";
const APP_KEY = process.env.POLLINATIONS_APP_KEY || "pk_discord_pollinations_001";
const AGENT_MODEL = process.env.AGENT_MODEL || "pollinations/research-assistant";
const DATA_DIR = join(homedir(), ".config", "pollinations-discord-bot");
const USERS_FILE = join(DATA_DIR, "users.json");

interface StoredUser {
    access_token: string;
    username: string;
    connected_at: string;
}

// ---------------------------------------------------------------------------
// User token storage (per-user, on disk)
// ---------------------------------------------------------------------------

async function loadUsers(): Promise<Record<string, StoredUser>> {
    if (!existsSync(USERS_FILE)) return {};
    try {
        return JSON.parse(await readFile(USERS_FILE, "utf-8"));
    } catch {
        return {};
    }
}

async function saveUsers(users: Record<string, StoredUser>): Promise<void> {
    if (!existsSync(DATA_DIR)) {
        await mkdir(DATA_DIR, { recursive: true });
    }
    await writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function getUserToken(discordId: string): Promise<string | null> {
    const users = await loadUsers();
    return users[discordId]?.access_token ?? null;
}

async function setUserToken(
    discordId: string,
    username: string,
    token: string,
): Promise<void> {
    const users = await loadUsers();
    users[discordId] = {
        access_token: token,
        username,
        connected_at: new Date().toISOString(),
    };
    await saveUsers(users);
}

async function removeUser(discordId: string): Promise<boolean> {
    const users = await loadUsers();
    if (!(discordId in users)) return false;
    delete users[discordId];
    await saveUsers(users);
    return true;
}

// ---------------------------------------------------------------------------
// Pollinations API
// ---------------------------------------------------------------------------

async function generateText(
    prompt: string,
    token: string,
    history: Array<{ role: string; content: string }> = [],
): Promise<string> {
    const messages = [
        { role: "system", content: `You are a helpful assistant called ${AGENT_MODEL}. Reply concisely in Discord markdown.` },
        ...history,
        { role: "user", content: prompt },
    ];

    const response = await fetch(`${GEN_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            model: AGENT_MODEL,
            messages,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "(no response)";
}

// ---------------------------------------------------------------------------
// Device flow authentication
// ---------------------------------------------------------------------------

async function startDeviceFlow(): Promise<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
} | null> {
    try {
        const resp = await fetch(`${ENTER_BASE}/api/device/code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: APP_KEY }),
        });
        if (!resp.ok) return null;
        const data = (await resp.json()) as {
            device_code: string;
            user_code: string;
            verification_uri_complete?: string;
            verification_uri?: string;
        };
        return {
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri:
                data.verification_uri_complete ||
                `${ENTER_BASE}/device?user_code=${data.user_code}`,
        };
    } catch {
        return null;
    }
}

async function pollForToken(
    deviceCode: string,
): Promise<string | null> {
    const deadline = Date.now() + 600_000; // 10 minutes
    let interval = 5;

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, interval * 1000));
        try {
            const resp = await fetch(`${ENTER_BASE}/api/device/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_code: deviceCode }),
            });
            if (!resp.ok) continue;
            const data = (await resp.json()) as {
                access_token?: string;
                error?: string;
            };
            if (data.access_token) return data.access_token;
            if (data.error === "slow_down") interval += 5;
            if (data.error === "expired_token" || data.error === "access_denied")
                return null;
        } catch {
            continue;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Discord bot
// ---------------------------------------------------------------------------

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID in environment.");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
});

// Track per-user conversation history (in-memory, per session)
const userHistory = new Map<string, Array<{ role: string; content: string }>>();
const HISTORY_LIMIT = 10;

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

const commands = [
    new SlashCommandBuilder()
        .setName("connect")
        .setDescription("Connect your Pollinations account via device flow"),
    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription("Disconnect your Pollinations account"),
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask the community agent a question")
        .addStringOption((opt) =>
            opt.setName("question").setDescription("Your question").setRequired(true),
        ),
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Check your connection status"),
].map((cmd) => cmd.toJSON());

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);
    await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: commands });
    console.log("Slash commands registered.");
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleConnect(interaction: ChatInputCommandInteraction) {
    const flow = await startDeviceFlow();
    if (!flow) {
        await interaction.reply({
            content: "Failed to start device flow. Try again later.",
            ephemeral: true,
        });
        return;
    }

    await interaction.reply({
        content: [
            "**Connect your Pollinations account:**",
            "",
            `1. Go to: ${flow.verificationUri}`,
            `2. Enter code: **${flow.userCode}**`,
            "3. Approve the connection",
            "",
            "_Waiting for authorization... (polls every 5s, expires in 10 min)_",
        ].join("\n"),
        ephemeral: true,
    });

    // Poll in background
    const token = await pollForToken(flow.deviceCode);
    if (token) {
        await setUserToken(interaction.user.id, interaction.user.username, token);
        await interaction.followUp({
            content: "Connected! Use `/ask <question>` to talk to the agent.",
            ephemeral: true,
        });
    } else {
        await interaction.followUp({
            content: "Authorization timed out or was denied. Try `/connect` again.",
            ephemeral: true,
        });
    }
}

async function handleDisconnect(interaction: ChatInputCommandInteraction) {
    const removed = await removeUser(interaction.user.id);
    userHistory.delete(interaction.user.id);
    await interaction.reply({
        content: removed
            ? "Disconnected. Your token has been removed."
            : "No connection found.",
        ephemeral: true,
    });
}

async function handleAsk(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("question", true);
    const token = await getUserToken(interaction.user.id);

    if (!token) {
        await interaction.reply({
            content: "Not connected. Use `/connect` first.",
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply();

    try {
        const history = userHistory.get(interaction.user.id) ?? [];
        const response = await generateText(question, token, history);

        // Update history
        history.push({ role: "user", content: question });
        history.push({ role: "assistant", content: response });
        if (history.length > HISTORY_LIMIT * 2) {
            history.splice(0, history.length - HISTORY_LIMIT * 2);
        }
        userHistory.set(interaction.user.id, history);

        // Discord has a 2000 char limit
        const truncated =
            response.length > 1900
                ? response.slice(0, 1900) + "\n\n_(truncated)_"
                : response;

        await interaction.editReply(truncated);
    } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("401") || msg.includes("403")) {
            await interaction.editReply(
                "Authorization expired. Use `/connect` to reconnect.",
            );
        } else {
            await interaction.editReply(`Error: ${msg.slice(0, 500)}`);
        }
    }
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
    const token = await getUserToken(interaction.user.id);
    await interaction.reply({
        content: token
            ? "Connected to Pollinations. Use `/ask` to talk to the agent."
            : "Not connected. Use `/connect` to authenticate.",
        ephemeral: true,
    });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
        case "connect":
            return handleConnect(interaction);
        case "disconnect":
            return handleDisconnect(interaction);
        case "ask":
            return handleAsk(interaction);
        case "status":
            return handleStatus(interaction);
    }
});

// Also handle plain messages (non-slash) for simplicity
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith("!ask ")) return;

    const question = message.content.slice(5).trim();
    if (!question) return;

    const token = await getUserToken(message.author.id);
    if (!token) {
        await message.reply(
            "Not connected. Use `/connect` to authenticate first.",
        );
        return;
    }

    try {
        const history = userHistory.get(message.author.id) ?? [];
        const response = await generateText(question, token, history);

        history.push({ role: "user", content: question });
        history.push({ role: "assistant", content: response });
        if (history.length > HISTORY_LIMIT * 2) {
            history.splice(0, history.length - HISTORY_LIMIT * 2);
        }
        userHistory.set(message.author.id, history);

        const truncated =
            response.length > 1900
                ? response.slice(0, 1900) + "\n\n_(truncated)_"
                : response;
        await message.reply(truncated);
    } catch (err: any) {
        await message.reply(`Error: ${(err?.message || String(err)).slice(0, 500)}`);
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

client.login(DISCORD_TOKEN);
