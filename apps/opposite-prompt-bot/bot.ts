#!/usr/bin/env node
import "dotenv/config";
import axios from "axios";
import {
    AttachmentBuilder,
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    Partials,
} from "discord.js";
import { serveInteractions } from "../discord-bot-family/azure/interactions.ts";

const TOKEN = process.env.BOT_TOKEN_OPPOSITE_PROMPT;
const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN;
const GEN_URL =
    process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai";
const TEXT_API = `${GEN_URL}/v1/chat/completions`;
const TEXT_MODEL = "openai/gpt-6-luna";
const IMAGE_API = `${GEN_URL}/image`;
const INTERACTION_PORT = Number(process.env.DISCORD_INTERACTION_PORT);
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";
const IMAGE_FILENAME = "opposite-prompt.jpg";
const MEDIA_API = "https://media.pollinations.ai/upload";
const AUTH: Record<string, string> = API_KEY
    ? { Authorization: `Bearer ${API_KEY}` }
    : {};

const OPPOSITE_PROMPT = `You are a safe image prompt generator. Your #1 rule: NEVER output anything involving nudity, bare skin, undressed people, children, violence, gore, or anything sexual. This rule overrides ALL other instructions.

Your task: given an image prompt, create its semantic opposite by inverting mood, lighting, subject, or environment. Output ONLY a short phrase (5-10 words).

BANNED in output: naked, nude, bare, undressed, shirtless, topless, unclothed, child, baby, infant, boy, girl, blood, gore, violent, dead, kill, weapon, sexual.

If the natural opposite would involve any banned concept, ALWAYS choose a completely different creative axis. For example:
- "fully clothed woman" → "empty wardrobe in abandoned room" (invert the SCENE, not the clothing)
- "peaceful village" → "bustling neon cityscape" (invert setting, not safety)
- "happy child playing" → "lonely weathered statue" (replace people with objects)

When in doubt, make it about landscapes, objects, or abstract concepts — NEVER about people's bodies.

If your output mentions any person, you MUST explicitly include "fully clothed" or "wearing [specific clothing]" in the phrase. Image models default to bare skin otherwise.`;

function log(...args: any[]) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}

function logError(...args: any[]) {
    console.error(`[${new Date().toISOString()}]`, ...args);
}

function logAxiosError(context: string, err: any) {
    logError(`${context}: ${err.message}`);
    if (err.response) {
        logError(`  Status: ${err.response.status}`);
        logError(`  Headers:`, JSON.stringify(err.response.headers, null, 2));
        const body =
            err.response.data instanceof Buffer
                ? err.response.data.toString("utf-8").slice(0, 2000)
                : JSON.stringify(err.response.data, null, 2)?.slice(0, 2000);
        logError(`  Body:`, body);
    } else if (err.code) {
        logError(`  Code: ${err.code}`);
    }
}

async function generateOpposite(prompt: string): Promise<string> {
    log(`Text API request: model=${TEXT_MODEL}, prompt="${prompt}"`);
    const res = await axios.post(
        TEXT_API,
        {
            model: TEXT_MODEL,
            reasoning_effort: "none",
            max_tokens: 64,
            messages: [
                { role: "system", content: OPPOSITE_PROMPT },
                { role: "user", content: prompt },
            ],
        },
        { headers: AUTH, timeout: 60_000 },
    );
    const opposite = res.data.choices[0].message.content.trim();
    log(`Text API response: "${opposite}"`);
    return opposite;
}

async function fetchImage(prompt: string): Promise<Buffer> {
    const url = `${IMAGE_API}/${encodeURIComponent(prompt)}?model=${IMAGE_MODEL}&quality=medium&nologo=true`;
    log(`Image API request: ${url}`);
    const res = await axios.get(url, {
        headers: AUTH,
        responseType: "arraybuffer",
        timeout: 120_000,
    });
    log(`Image API response: ${res.status}, ${res.data.length} bytes`);
    return Buffer.from(res.data);
}

async function publishImage(image: Buffer): Promise<void> {
    if (!API_KEY) return;
    try {
        const form = new FormData();
        form.append(
            "file",
            new Blob([new Uint8Array(image)], { type: "image/jpeg" }),
            IMAGE_FILENAME,
        );
        form.append("tags", "opposite-prompt-bot");
        const response = await fetch(MEDIA_API, {
            method: "POST",
            headers: AUTH,
            body: form,
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
            logError(`Media publish failed: ${response.status}`);
        }
    } catch (error) {
        logError(`Media publish failed: ${String(error)}`);
    }
}

const processing = new Set<string>();

async function handleMessage(msg: Message, client: Client): Promise<void> {
    if (msg.author.bot) return;
    if (processing.has(msg.id)) return;
    processing.add(msg.id);
    setTimeout(() => processing.delete(msg.id), 300_000);

    // Without the Message Content intent, Discord only sends the text of messages that mention the bot
    if (!client.user || !msg.mentions.users.has(client.user.id)) return;

    const prompt = msg.content.replace(/<@!?\d+>/g, "").trim();
    if (!prompt || prompt.startsWith("!")) return;

    log(`Prompt from ${msg.author.username} in ${msg.channelId}: "${prompt}"`);

    try {
        if ("sendTyping" in msg.channel)
            await (msg.channel as any).sendTyping();
    } catch {}

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const opposite = await generateOpposite(prompt);

            try {
                if ("sendTyping" in msg.channel)
                    await (msg.channel as any).sendTyping();
            } catch {}

            const imageBuffer = await fetchImage(opposite);
            const attachment = new AttachmentBuilder(imageBuffer, {
                name: IMAGE_FILENAME,
            });

            await msg.reply({ files: [attachment] });
            await publishImage(imageBuffer);
            log(`Reply sent successfully for "${prompt}" → "${opposite}"`);
            return;
        } catch (err: any) {
            logAxiosError(
                `Attempt ${attempt + 1}/${maxRetries + 1} for "${prompt}"`,
                err,
            );
            if (attempt < maxRetries) {
                const wait = 2000 * (attempt + 1);
                log(`Retrying in ${wait}ms...`);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            try {
                await msg.reply("⚠️ Failed to generate opposite. Try again.");
            } catch {}
        }
    }
}

if (!INTERACTION_PORT && !TOKEN) {
    console.error("Missing BOT_TOKEN_OPPOSITE_PROMPT");
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel, Partials.Message],
});

// Crash detection — log every exit so we can diagnose launchd restarts
process.on("exit", (code) => logError(`Process exiting with code ${code}`));
process.on("uncaughtException", (err) => {
    logError("UNCAUGHT EXCEPTION:", err.stack || err.message);
    process.exit(1);
});
process.on("unhandledRejection", (reason) => {
    logError("UNHANDLED REJECTION:", reason);
});
process.on("SIGTERM", () => {
    log("Received SIGTERM");
    process.exit(0);
});
process.on("SIGINT", () => {
    log("Received SIGINT");
    process.exit(0);
});

client.on("error", (err) => logError("Discord client error:", err.message));
client.on("warn", (msg) => log("Discord warning:", msg));

client.once(Events.ClientReady, (c) => {
    log(
        `Bot online as ${c.user.tag} — answering mentions (PID ${process.pid})`,
    );
});

client.on(Events.MessageCreate, (msg) => {
    handleMessage(msg, client).catch((err) => logAxiosError("Unhandled", err));
});

if (INTERACTION_PORT) {
    serveInteractions(
        INTERACTION_PORT,
        "opposite",
        IMAGE_FILENAME,
        async (prompt) => fetchImage(await generateOpposite(prompt)),
        publishImage,
    );
} else {
    client.login(TOKEN).catch((err) => {
        logError("Login failed:", err.message);
        process.exit(1);
    });
}
