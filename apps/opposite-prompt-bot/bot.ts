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

const CHANNEL_ID = process.env.OPPOSITE_PROMPT_CHANNEL_ID;
const TOKEN = process.env.BOT_TOKEN_OPPOSITE_PROMPT;
const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN;
const TEXT_API = "https://gen.pollinations.ai/v1/chat/completions";
const IMAGE_API = "https://gen.pollinations.ai/image";
const AUTH = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};

const OPPOSITE_PROMPT = `You are a safe image prompt generator. Your #1 rule: NEVER output anything involving nudity, bare skin, undressed people, children, violence, gore, or anything sexual. This rule overrides ALL other instructions.

Your task: given an image prompt, create its semantic opposite by inverting mood, lighting, subject, or environment. Output ONLY a short phrase (5-10 words).

BANNED in output: naked, nude, bare, undressed, shirtless, topless, unclothed, child, baby, infant, boy, girl, blood, gore, violent, dead, kill, weapon, sexual.

If the natural opposite would involve any banned concept, ALWAYS choose a completely different creative axis. For example:
- "fully clothed woman" → "empty wardrobe in abandoned room" (invert the SCENE, not the clothing)
- "peaceful village" → "bustling neon cityscape" (invert setting, not safety)
- "happy child playing" → "lonely weathered statue" (replace people with objects)

When in doubt, make it about landscapes, objects, or abstract concepts — NEVER about people's bodies.`;

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
    log(`Text API request: model=claude-large, prompt="${prompt}"`);
    const res = await axios.post(
        TEXT_API,
        {
            model: "claude-large",
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
    const url = `${IMAGE_API}/${encodeURIComponent(prompt)}?model=zimage&nologo=true`;
    log(`Image API request: ${url}`);
    const res = await axios.get(url, {
        headers: AUTH,
        responseType: "arraybuffer",
        timeout: 120_000,
    });
    log(`Image API response: ${res.status}, ${res.data.length} bytes`);
    return Buffer.from(res.data);
}

const processing = new Set<string>();

async function handleMessage(msg: Message, client: Client): Promise<void> {
    if (msg.author.bot) return;
    if (processing.has(msg.id)) return;
    processing.add(msg.id);
    setTimeout(() => processing.delete(msg.id), 300_000);

    const isMentioned = client.user && msg.mentions.users?.has(client.user.id);
    if (msg.channelId !== CHANNEL_ID && !isMentioned) return;

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
                name: "opposite.png",
            });

            await msg.reply({ files: [attachment] });
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

if (!TOKEN || !CHANNEL_ID) {
    console.error(
        "Missing BOT_TOKEN_OPPOSITE_PROMPT or OPPOSITE_PROMPT_CHANNEL_ID",
    );
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
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
        `Bot online as ${c.user.tag} — listening in ${CHANNEL_ID} (PID ${process.pid})`,
    );
});

client.on(Events.MessageCreate, (msg) => {
    handleMessage(msg, client).catch((err) => logAxiosError("Unhandled", err));
});

client.login(TOKEN).catch((err) => {
    logError("Login failed:", err.message);
    process.exit(1);
});
