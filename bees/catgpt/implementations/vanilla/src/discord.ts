import "dotenv/config";
import {
    AttachmentBuilder,
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    Partials,
} from "discord.js";
import { runCatGPT } from "./agent";

const TOKEN = process.env.BOT_TOKEN_CATGPT;
const CHANNEL_ID = process.env.CATGPT_CHANNEL_ID;
const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN;

async function fetchImage(url: string): Promise<Buffer> {
    const res = await fetch(url, {
        headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
    });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

async function handle(msg: Message, client: Client) {
    if (msg.author.bot) return;
    const mentioned = client.user && msg.mentions.users?.has(client.user.id);
    if (CHANNEL_ID && msg.channelId !== CHANNEL_ID && !mentioned) return;

    const question = msg.content.replace(/<@!?\d+>/g, "").trim();
    if (!question || question.startsWith("!")) return;

    try {
        if ("sendTyping" in msg.channel)
            await (msg.channel as any).sendTyping();
    } catch {}

    const avatarUrl = msg.author.displayAvatarURL({
        size: 1024,
        extension: "png",
    });
    const turn = await runCatGPT({
        question,
        imageUrl: avatarUrl,
        apiKey: API_KEY,
    });

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const buf = await fetchImage(turn.comicUrl);
            await msg.reply({
                files: [new AttachmentBuilder(buf, { name: "catgpt.png" })],
            });
            return;
        } catch (err) {
            if (attempt === 2) {
                await msg
                    .reply("😾 CatGPT couldn't be bothered. Try again.")
                    .catch(() => {});
                return;
            }
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
    }
}

if (!TOKEN) {
    console.error("Missing BOT_TOKEN_CATGPT");
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

client.once(Events.ClientReady, (c) => {
    c.user.setPresence({
        status: "online",
        activities: [{ name: "Ask me anything 😾" }],
    });
    console.log(`[vanilla] CatGPT online as ${c.user.tag}`);
});
client.on(Events.MessageCreate, (msg) =>
    handle(msg, client).catch(console.error),
);
client.login(TOKEN).catch((err) => {
    console.error("login failed:", err);
    process.exit(1);
});
