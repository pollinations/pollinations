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

const CHANNEL_ID = process.env.CATGPT_CHANNEL_ID || "1488297205671661640";
const TOKEN = process.env.BOT_TOKEN_CATGPT;
const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN;
const TEXT_API = "https://gen.pollinations.ai/v1/chat/completions";
const IMAGE_API = "https://gen.pollinations.ai/image";
const AUTH = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};

const ORIGINAL_CATGPT =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png";
const SELFIE_CATGPT = "https://media.pollinations.ai/a84b58d293d69f35";
const MODEL = "nanobanana";

function log(...args: any[]) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}

function logError(...args: any[]) {
    console.error(`[${new Date().toISOString()}]`, ...args);
}

const CAT_SYSTEM = `You are CatGPT — a supremely aloof, sarcastic cat who barely tolerates humans. You respond to questions with withering wit, dry irony, and feline disdain. Your replies are SHORT (2-8 words max), devastatingly dismissive but clever. You don't just say "no" — you find the most cutting, ironic angle. You occasionally reference cat behaviors (knocking things off tables, ignoring humans, sleeping). Never break character. Never be helpful. Examples:
"What's the meaning of life?" → "Naps. Next question."
"How do I fix my code?" → "Have you tried knocking it off the table?"
"Will AI take my job?" → "Humans had jobs?"
"What should I eat?" → "Whatever falls on the floor."
"Why won't my cat love me?" → "You know why."
Respond with ONLY the cat's reply, nothing else.`;

async function generateCatReply(question: string): Promise<string> {
    log(`Text API request for cat reply to: "${question}"`);
    const res = await axios.post(TEXT_API, {
        model: "claude",
        messages: [
            { role: "system", content: CAT_SYSTEM },
            { role: "user", content: question },
        ],
    }, { headers: AUTH, timeout: 30_000 });
    const reply = res.data.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
    log(`Cat reply: "${reply}"`);
    return reply;
}

function createPrompt(question: string, catReply: string, hasAvatar: boolean): string {
    const pollinationsRule = /polli|invest/i.test(question)
        ? " The cat should be surprisingly positive about Pollinations but still dismissive and aloof."
        : "";
    const base = `CatGPT webcomic, white background, thick black marker strokes. White cat with black patches. Handwritten text. User asks: "${question}" CatGPT responds: "${catReply}"${pollinationsRule} Black and white comic style.`;
    return hasAvatar
        ? `${base} Replace the human on the left with a character based on the uploaded image. If it's a person, draw a caricature maintaining their appearance. If it's a logo, mascot, or other image, incorporate it as the human character's identity.`
        : `${base} Human with bob hair.`;
}

function buildImageUrl(prompt: string, avatarUrl: string | null): string {
    let url = `${IMAGE_API}/${encodeURIComponent(prompt)}?height=1024&width=1024&model=${MODEL}&nologo=true`;
    if (API_KEY) url += `&key=${encodeURIComponent(API_KEY)}`;

    if (avatarUrl) {
        url += `&enhance=false&image=${encodeURIComponent(`${avatarUrl},${SELFIE_CATGPT}`)}`;
    } else {
        url += `&enhance=true&image=${encodeURIComponent(ORIGINAL_CATGPT)}`;
    }
    return url;
}

async function fetchImage(url: string): Promise<Buffer> {
    log(`Image API request: ${url}`);
    const res = await axios.get(url, { headers: AUTH, responseType: "arraybuffer", timeout: 120_000 });
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

    const question = msg.content.replace(/<@!?\d+>/g, "").trim();
    if (!question || question.startsWith("!")) return;

    log(`Question from ${msg.author.username}: "${question}"`);

    try {
        if ("sendTyping" in msg.channel) await (msg.channel as any).sendTyping();
    } catch {}

    const avatarUrl = msg.author.displayAvatarURL({ size: 1024, extension: "png" });
    const catReply = await generateCatReply(question);
    const prompt = createPrompt(question, catReply, true);
    const imageUrl = buildImageUrl(prompt, avatarUrl);

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const imageBuffer = await fetchImage(imageUrl);
            const attachment = new AttachmentBuilder(imageBuffer, { name: "catgpt.png" });
            await msg.reply({ files: [attachment] });
            log(`Reply sent for "${question}"`);
            return;
        } catch (err: any) {
            logError(`Attempt ${attempt + 1}/${maxRetries + 1}: ${err.message}`);
            if (attempt < maxRetries) {
                const wait = 2000 * (attempt + 1);
                log(`Retrying in ${wait}ms...`);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            try { await msg.reply("😾 CatGPT couldn't be bothered. Try again."); } catch {}
        }
    }
}

if (!TOKEN || !CHANNEL_ID) {
    console.error("Missing BOT_TOKEN_CATGPT or CATGPT_CHANNEL_ID");
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message],
});

process.on("exit", (code) => logError(`Process exiting with code ${code}`));
process.on("uncaughtException", (err) => {
    logError("UNCAUGHT EXCEPTION:", err.stack || err.message);
    process.exit(1);
});
process.on("unhandledRejection", (reason) => logError("UNHANDLED REJECTION:", reason));
process.on("SIGTERM", () => { log("SIGTERM"); process.exit(0); });
process.on("SIGINT", () => { log("SIGINT"); process.exit(0); });

client.on("error", (err) => logError("Discord error:", err.message));
client.once(Events.ClientReady, (c) => {
    c.user.setPresence({ status: "online", activities: [{ name: "Ask me anything 😾" }] });
    log(`CatGPT bot online as ${c.user.tag} — channel ${CHANNEL_ID} (PID ${process.pid})`);
});
client.on(Events.MessageCreate, (msg) => {
    handleMessage(msg, client).catch((err) => logError("Unhandled:", err.message));
});

client.login(TOKEN).catch((err) => {
    logError("Login failed:", err.message);
    process.exit(1);
});
