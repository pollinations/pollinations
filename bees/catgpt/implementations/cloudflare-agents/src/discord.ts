import "dotenv/config";
import {
    AttachmentBuilder,
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    Partials,
} from "discord.js";

const TOKEN = process.env.BOT_TOKEN_CATGPT;
const AGENT_BASE = process.env.AGENT_BASE ?? "http://localhost:8787";
const CHANNEL_ID = process.env.CATGPT_CHANNEL_ID;
const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN;

async function askAgent(userId: string, question: string) {
    const res = await fetch(
        `${AGENT_BASE}/agents/catgpt/${encodeURIComponent(userId)}/chat`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: question }],
            }),
        },
    );
    if (!res.ok) throw new Error(`agent ${res.status}`);
    return (await res.json()) as {
        content: string;
        data: { comicUrl: string };
    };
}

async function fetchImage(url: string): Promise<Buffer> {
    const res = await fetch(url, {
        headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
    });
    if (!res.ok) throw new Error(`image ${res.status}`);
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

    const turn = await askAgent(`discord:${msg.author.id}`, question);
    const buf = await fetchImage(turn.data.comicUrl);
    await msg.reply({
        files: [new AttachmentBuilder(buf, { name: "catgpt.png" })],
    });
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
client.once(Events.ClientReady, (c) =>
    console.log(`[cf-agents] CatGPT online as ${c.user.tag}`),
);
client.on(Events.MessageCreate, (msg) =>
    handle(msg, client).catch(console.error),
);
client.login(TOKEN);
