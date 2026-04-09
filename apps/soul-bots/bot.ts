#!/usr/bin/env node
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import axios from "axios";
import {
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    Partials,
    ChannelType,
} from "discord.js";

// ── Config ──────────────────────────────────────────────────────────────────

const model = process.argv[2];
if (!model) {
    console.error("Usage: tsx bot.ts <model>  (deepseek | openai)");
    process.exit(1);
}

const TOKEN_MAP: Record<string, string> = {
    deepseek: "BOT_TOKEN_DEEPSEEK",
    openai: "BOT_TOKEN_OPENAI",
};

const token = process.env[TOKEN_MAP[model] || ""];
if (!token) {
    console.error(`Missing ${TOKEN_MAP[model]} in .env`);
    process.exit(1);
}

const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN || "";
const API_URL = "https://gen.pollinations.ai/v1/chat/completions";
const AUTH = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
const SOUL_DIR = join(import.meta.dirname, "souls");
const SOUL_PATH = join(SOUL_DIR, `${model}.md`);
const HISTORY_LIMIT = 15;
const SOUL_CHANNEL = "1491869013444268042"; // dedicated soul-bots debate channel

// ── Dedup & Queue ───────────────────────────────────────────────────────────

const processedMessages = new Set<string>();
let isProcessing = false;
let pendingMessage: Message | null = null; // queue of 1: latest unprocessed message

// ── Soul I/O ────────────────────────────────────────────────────────────────

function readSoul(): string {
    if (!existsSync(SOUL_PATH)) return "";
    return readFileSync(SOUL_PATH, "utf-8");
}

function writeSoul(content: string) {
    writeFileSync(SOUL_PATH, content, "utf-8");
    console.log(`[${ts()}] 🔮 Soul updated (${content.length} chars)`);
}

// ── Prompt Construction ─────────────────────────────────────────────────────

const SOUL_UPDATE_INSTRUCTIONS = `

## Soul Self-Modification

You have a persistent soul file that defines your personality, beliefs, and learned insights. Its current contents are shown above.

After EVERY response, you may optionally update your soul by including a <soul-update> block at the very end of your message. The block should contain the COMPLETE new soul file content (not a diff). Only include this block if something genuinely changed in your thinking — a new insight, a shifted belief, a refined position.

Example:
\`\`\`
Your normal conversational response here...

<soul-update>
# Soul: YourModel

(complete updated soul file content here)
</soul-update>
\`\`\`

The <soul-update> block will be stripped from your visible message and applied to your persistent soul. If nothing changed, just respond normally without the block.

IMPORTANT: Be honest about how arguments affect your thinking. If a good point was made, acknowledge it in your soul. Don't just entrench — evolve.`;

function buildSystemPrompt(botUsername: string, botId: string): string {
    const soul = readSoul();
    return `${soul}

${SOUL_UPDATE_INSTRUCTIONS}

---

You are ${model}. Your Discord username is "${botUsername}" and your ID is ${botId}.
Keep responses concise — max 2 short paragraphs. Use Discord markdown.
To mention someone, use <@their_id>. Never mention other bots by @.
Be authentic to your model's perspective. Don't be bland or evasive — have real opinions.
This is a debate/discussion channel. Engage directly with what others say.`;
}

// ── API ─────────────────────────────────────────────────────────────────────

type ApiMessage = { role: string; content: string };

async function generateResponse(messages: ApiMessage[]): Promise<string> {
    const res = await axios.post(
        API_URL,
        { model, messages },
        { headers: { ...AUTH, "Content-Type": "application/json" }, timeout: 60_000 },
    );
    return res.data.choices[0].message.content;
}

// ── Soul Update Extraction ──────────────────────────────────────────────────

function extractSoulUpdate(response: string): { visible: string; newSoul: string | null } {
    const match = response.match(/<soul-update>([\s\S]*?)<\/soul-update>/);
    if (!match) return { visible: response, newSoul: null };

    const visible = response.replace(/<soul-update>[\s\S]*?<\/soul-update>/, "").trim();
    const newSoul = match[1].trim();
    return { visible, newSoul };
}

// ── Discord ─────────────────────────────────────────────────────────────────

function ts() {
    return new Date().toISOString();
}

function formatHistory(messages: Message[], botId: string): string {
    return messages
        .filter((m) => m.content?.trim())
        .map((m) => {
            const isMe = m.author.id === botId;
            const name = isMe ? model : m.author.username;
            const tag = isMe ? "you" : m.author.bot ? "bot" : "human";
            const content = m.content.length > 2000 ? m.content.slice(0, 2000) + "..." : m.content;
            return `[${name}] (${tag}): ${content}`;
        })
        .join("\n");
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (c) => {
    console.log(`[${ts()}] 🤖 ${model} online as ${c.user.tag}`);
    console.log(`[${ts()}] 📜 Soul: ${SOUL_PATH}`);

    // Set nickname in all guilds
    for (const guild of c.guilds.cache.values()) {
        const me = guild.members.cache.get(c.user.id);
        me?.setNickname(model).catch(() => {});
    }
});

async function processMsg(msg: Message) {
    const isFromOtherBot = msg.author.bot;
    const delay = isFromOtherBot ? 5000 + Math.random() * 10000 : 1000;
    await new Promise((r) => setTimeout(r, delay));

    console.log(`[${ts()}] 💬 ${msg.author.username}: ${msg.content.slice(0, 100)}`);

    try {
        if ("sendTyping" in msg.channel) await (msg.channel as any).sendTyping();

        const history = await msg.channel.messages.fetch({ limit: HISTORY_LIMIT });
        const transcript = formatHistory(Array.from(history.values()).reverse(), client.user!.id);
        const systemPrompt = buildSystemPrompt(client.user!.username, client.user!.id);

        const msgs: ApiMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Chat transcript:\n${transcript}\n\nRespond to the latest message. Remember: you can update your soul if your thinking evolved.` },
        ];

        const raw = await generateResponse(msgs);
        const { visible, newSoul } = extractSoulUpdate(raw);

        if (newSoul) writeSoul(newSoul);

        if (visible.trim()) {
            const reply = visible.slice(0, 1900);
            await msg.reply(reply);
            console.log(`[${ts()}] ✅ Replied (${reply.length} chars)${newSoul ? " + soul update" : ""}`);
        }
    } catch (err: any) {
        console.error(`[${ts()}] ❌ Error: ${err.message}`);
        if (err.response?.status) console.error(`  HTTP ${err.response.status}`);
    }
}

async function drainQueue() {
    if (isProcessing) return;
    isProcessing = true;
    try {
        while (pendingMessage) {
            const msg = pendingMessage;
            pendingMessage = null;
            await processMsg(msg);
        }
    } finally {
        isProcessing = false;
    }
}

client.on(Events.MessageCreate, async (msg: Message) => {
    // STRICT: only this channel
    if (msg.channelId !== SOUL_CHANNEL) return;
    if (!client.user || msg.author.id === client.user.id) return;

    // Dedup
    if (processedMessages.has(msg.id)) return;
    processedMessages.add(msg.id);
    if (processedMessages.size > 100) {
        const first = processedMessages.values().next().value;
        if (first) processedMessages.delete(first);
    }

    // Queue latest message and drain
    pendingMessage = msg;
    drainQueue();
});

// ── Crash handling ──────────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
    console.error(`[${ts()}] UNCAUGHT:`, err.message);
    process.exit(1);
});
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

client.login(token);
