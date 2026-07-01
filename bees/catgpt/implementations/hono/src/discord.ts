import "dotenv/config";
import {
    AttachmentBuilder,
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    Partials,
} from "discord.js";

// Hono variant uses the OpenAI-compat surface as its agent backend — Discord
// just calls /v1/chat/completions on the hono server. Demonstrates that a
// bee's surfaces compose: the Discord adapter doesn't import core/ directly,
// it talks to the hono app over HTTP like any other client.

const TOKEN = process.env.BOT_TOKEN_CATGPT;
const CHANNEL_ID = process.env.CATGPT_CHANNEL_ID;
const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN;
const HONO_BASE = process.env.HONO_BASE ?? "http://localhost:8787";

async function askHono(question: string, imageUrl?: string) {
    const res = await fetch(`${HONO_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({
            model: "catgpt",
            messages: [
                {
                    role: "user",
                    content: imageUrl
                        ? [
                              { type: "text", text: question },
                              {
                                  type: "image_url",
                                  image_url: { url: imageUrl },
                              },
                          ]
                        : question,
                },
            ],
        }),
    });
    if (!res.ok) throw new Error(`hono ${res.status}`);
    const body = (await res.json()) as {
        choices: Array<{
            message: { content: string; metadata?: { comic_url?: string } };
        }>;
    };
    return {
        reply: body.choices[0].message.content,
        comicUrl: body.choices[0].message.metadata?.comic_url ?? "",
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

    const avatarUrl = msg.author.displayAvatarURL({
        size: 1024,
        extension: "png",
    });
    const turn = await askHono(question, avatarUrl);
    if (turn.comicUrl) {
        const buf = await fetchImage(turn.comicUrl);
        await msg.reply({
            files: [new AttachmentBuilder(buf, { name: "catgpt.png" })],
        });
    } else {
        await msg.reply(turn.reply);
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
client.once(Events.ClientReady, (c) =>
    console.log(`[hono] CatGPT online as ${c.user.tag}`),
);
client.on(Events.MessageCreate, (msg) =>
    handle(msg, client).catch(console.error),
);
client.login(TOKEN);
