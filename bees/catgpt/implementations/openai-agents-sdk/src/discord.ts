import "dotenv/config";
import {
  AttachmentBuilder,
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  Partials,
} from "discord.js";
import { ask } from "./agent";

const TOKEN = process.env.BOT_TOKEN_CATGPT;
const CHANNEL_ID = process.env.CATGPT_CHANNEL_ID;
const API_KEY = process.env.TEXT_POLLINATIONS_TOKEN;

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

  try { if ("sendTyping" in msg.channel) await (msg.channel as any).sendTyping(); } catch {}

  const avatarUrl = msg.author.displayAvatarURL({ size: 1024, extension: "png" });

  // The OpenAI Agents SDK runs the loop, calls cat_reply + comic_url as tools,
  // and returns a final string. For Discord we want both the text and the image,
  // so we also extract the comic URL from the run output if the model returned it.
  const out = (await ask(question, avatarUrl, API_KEY)) ?? "";
  const urlMatch = String(out).match(/https?:\/\/\S+/);

  if (urlMatch) {
    try {
      const buf = await fetchImage(urlMatch[0]);
      await msg.reply({ files: [new AttachmentBuilder(buf, { name: "catgpt.png" })] });
      return;
    } catch {}
  }
  await msg.reply(String(out) || "😾 ...");
}

if (!TOKEN) { console.error("Missing BOT_TOKEN_CATGPT"); process.exit(1); }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message],
});
client.once(Events.ClientReady, (c) => console.log(`[openai-agents-sdk] CatGPT online as ${c.user.tag}`));
client.on(Events.MessageCreate, (msg) => handle(msg, client).catch(console.error));
client.login(TOKEN);
