/**
 * Discord gateway bot wiring for the Community Agent adapter.
 *
 * Commands and Pollinations calls live in commands.js / pollinations.js;
 * this file only connects discord.js to them. The adapter is stateless by
 * design — the Discord channel itself is the visible conversation context.
 *
 * Required env vars:
 *   DISCORD_TOKEN — bot token from the Discord developer portal
 *   APP_KEY       — Pollinations publishable App Key (pk_...)
 * Optional:
 *   TOKEN_STORE_PATH — where per-user keys are kept (default ./data/tokens.json)
 */

import { join } from "node:path";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleCommand } from "./commands.js";
import { TokenStore } from "./store.js";

const { DISCORD_TOKEN, APP_KEY } = process.env;
if (!DISCORD_TOKEN || !APP_KEY) {
    console.error("DISCORD_TOKEN and APP_KEY (pk_...) are required");
    process.exit(1);
}

const store = new TokenStore(
    process.env.TOKEN_STORE_PATH ??
        join(import.meta.dirname, "data", "tokens.json"),
);
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once(Events.ClientReady, (c) =>
    console.log(`Logged in as ${c.user.tag}`),
);

client.on(Events.InteractionCreate, (interaction) =>
    handleCommand(interaction, {
        appKey: APP_KEY,
        store,
        history: [],
    }),
);

client.login(DISCORD_TOKEN);
