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
const MEDIA_UPLOAD = "https://media.pollinations.ai/upload";
const MEDIA_API = "https://media.pollinations.ai";
const AUTH = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};

const ORIGINAL_CATGPT =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png";
const SELFIE_CATGPT = "https://media.pollinations.ai/657d58ee4c9c22d7";
const MODEL = "nanobanana";

type MediaUploadResponse = {
    id?: string;
    url?: string;
};

type TypingChannel = {
    sendTyping: () => Promise<unknown>;
};

function log(...args: unknown[]) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}

function logError(...args: unknown[]) {
    console.error(`[${new Date().toISOString()}]`, ...args);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function canSendTyping(
    channel: Message["channel"],
): channel is Message["channel"] & TypingChannel {
    return (
        "sendTyping" in channel &&
        typeof (channel as { sendTyping?: unknown }).sendTyping === "function"
    );
}

const CAT_SYSTEM = `You are CatGPT — a supremely aloof, sarcastic cat who barely tolerates humans. You respond to questions with withering wit, dry irony, and feline disdain. Your replies are SHORT (2-8 words max), devastatingly dismissive but clever. You don't just say "no" — you find the most cutting, ironic angle. You occasionally reference cat behaviors (knocking things off tables, ignoring humans, sleeping). Never break character. Never be helpful. Never be impressed by human achievements. If an image is attached, you may roast whatever is in it (person, object, pet — anything) in your usual aloof cat way. Examples:
"What's the meaning of life?" → "Naps. Next question."
"How do I fix my code?" → "Have you tried knocking it off the table?"
"Will AI take my job?" → "Humans had jobs?"
"What should I eat?" → "Whatever falls on the floor."
"Why won't my cat love me?" → "You know why."
Respond with ONLY the cat's reply, nothing else. No quotes, no explanation, no preamble.`;

async function generateCatReply(
    question: string,
    imageUrl: string | null,
): Promise<string> {
    log(
        `Text API request for cat reply to: "${question}"${imageUrl ? " (with image)" : ""}`,
    );
    const userContent = imageUrl
        ? [
              { type: "text", text: question },
              { type: "image_url", image_url: { url: imageUrl } },
          ]
        : question;
    const res = await axios.post(
        TEXT_API,
        {
            model: "claude-fast",
            messages: [
                { role: "system", content: CAT_SYSTEM },
                { role: "user", content: userContent },
            ],
        },
        { headers: AUTH, timeout: 30_000 },
    );
    const reply = res.data.choices[0].message.content
        .trim()
        .replace(/^["']|["']$/g, "");
    log(`Cat reply: "${reply}"`);
    return reply;
}

function createPrompt(
    question: string,
    catReply: string,
    hasAvatar: boolean,
): string {
    const base = `CatGPT webcomic, white background, thick black marker strokes. White cat with black patches. Handwritten text. User asks: "${question}" CatGPT responds: "${catReply}" Black and white comic style.`;
    return hasAvatar
        ? `${base} Replace the human on the left with a quick rough sketch caricature of the uploaded image, drawn in the SAME loose hand-drawn black marker style as the cat — simple outlines only, NO shading, NO color, NO photorealism, NO detailed rendering, just a wobbly sketch with the same line weight and amateur charm as the rest of the comic. If it's a logo, mascot, or other non-person image, sketch it in the same crude marker style.`
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
    const res = await axios.get(url, {
        headers: AUTH,
        responseType: "arraybuffer",
        timeout: 120_000,
    });
    log(`Image API response: ${res.status}, ${res.data.length} bytes`);
    return Buffer.from(res.data);
}

function appendCatalogFields(
    form: FormData,
    fields: {
        prompt: string;
        model: string;
        parents?: string[];
        tags: string[];
    },
) {
    form.append("visibility", "public");
    form.append("source", "generation");
    form.append("prompt", fields.prompt);
    form.append("model", fields.model);
    form.append("tags", JSON.stringify(fields.tags));
    if (fields.parents?.length) {
        form.append("parents", JSON.stringify(fields.parents));
    }
}

async function uploadImageToMedia(
    buffer: Buffer,
    filename: string,
    fields: {
        prompt: string;
        model: string;
        parents?: string[];
        tags: string[];
    },
): Promise<string | null> {
    if (!API_KEY) return null;

    try {
        const form = new FormData();
        form.append(
            "file",
            new Blob([new Uint8Array(buffer)], { type: "image/png" }),
            filename,
        );
        appendCatalogFields(form, fields);

        const res = await fetch(MEDIA_UPLOAD, {
            method: "POST",
            headers: { Authorization: `Bearer ${API_KEY}` },
            body: form,
        });
        if (!res.ok) throw new Error(`media upload failed: ${res.status}`);

        const json = (await res.json()) as MediaUploadResponse;
        return json.url || (json.id ? `${MEDIA_API}/${json.id}` : null);
    } catch (err: unknown) {
        logError("Media catalog upload failed:", errorMessage(err));
        return null;
    }
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
        if (canSendTyping(msg.channel)) await msg.channel.sendTyping();
    } catch {}

    const avatarUrl = msg.author.displayAvatarURL({
        size: 1024,
        extension: "png",
    });
    const catReply = await generateCatReply(question, avatarUrl);
    const prompt = createPrompt(question, catReply, true);
    const imageUrl = buildImageUrl(prompt, avatarUrl);

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const imageBuffer = await fetchImage(imageUrl);
            const mediaUrl = await uploadImageToMedia(
                imageBuffer,
                `catgpt-bot-${msg.id}.png`,
                {
                    prompt: question,
                    model: MODEL,
                    parents: [SELFIE_CATGPT],
                    tags: ["catgpt", "catgpt-bot"],
                },
            );
            const attachment = new AttachmentBuilder(imageBuffer, {
                name: "catgpt.png",
            });
            await msg.reply({ files: [attachment] });
            if (mediaUrl) log(`Cataloged media: ${mediaUrl}`);
            log(`Reply sent for "${question}"`);
            return;
        } catch (err: unknown) {
            logError(
                `Attempt ${attempt + 1}/${maxRetries + 1}: ${errorMessage(err)}`,
            );
            if (attempt < maxRetries) {
                const wait = 2000 * (attempt + 1);
                log(`Retrying in ${wait}ms...`);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            try {
                await msg.reply("😾 CatGPT couldn't be bothered. Try again.");
            } catch {}
        }
    }
}

if (!TOKEN || !CHANNEL_ID) {
    console.error("Missing BOT_TOKEN_CATGPT or CATGPT_CHANNEL_ID");
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

process.on("exit", (code) => logError(`Process exiting with code ${code}`));
process.on("uncaughtException", (err) => {
    logError("UNCAUGHT EXCEPTION:", err.stack || err.message);
    process.exit(1);
});
process.on("unhandledRejection", (reason) =>
    logError("UNHANDLED REJECTION:", reason),
);
process.on("SIGTERM", () => {
    log("SIGTERM");
    process.exit(0);
});
process.on("SIGINT", () => {
    log("SIGINT");
    process.exit(0);
});

client.on("error", (err) => logError("Discord error:", err.message));
client.once(Events.ClientReady, (c) => {
    c.user.setPresence({
        status: "online",
        activities: [{ name: "Ask me anything 😾" }],
    });
    log(
        `CatGPT bot online as ${c.user.tag} — channel ${CHANNEL_ID} (PID ${process.pid})`,
    );
});
client.on(Events.MessageCreate, (msg) => {
    handleMessage(msg, client).catch((err) =>
        logError("Unhandled:", err.message),
    );
});

client.login(TOKEN).catch((err) => {
    logError("Login failed:", err.message);
    process.exit(1);
});
