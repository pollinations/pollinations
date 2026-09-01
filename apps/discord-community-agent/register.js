/**
 * Register slash commands with Discord. Run once per deployment:
 *
 *   DISCORD_TOKEN=... CLIENT_ID=... node register.js
 *
 * Set GUILD_ID during development for instant propagation; omit it to
 * register global commands (can take up to an hour to appear).
 */

import { REST, Routes } from "discord.js";

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error("DISCORD_TOKEN and CLIENT_ID are required");
    process.exit(1);
}

export const commands = [
    {
        name: "connect",
        description:
            "Connect your Pollinations account (device authorization — no API key)",
    },
    {
        name: "chat",
        description: "Chat with the Pollinations Community Agent",
        options: [
            {
                name: "prompt",
                description: "Your message to the agent",
                type: 3, // STRING
                required: true,
            },
        ],
    },
    {
        name: "disconnect",
        description: "Remove your stored Pollinations authorization",
    },
];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
await rest.put(route, { body: commands });
console.log(
    `Registered ${commands.length} commands${GUILD_ID ? ` in guild ${GUILD_ID}` : " globally"}.`,
);
