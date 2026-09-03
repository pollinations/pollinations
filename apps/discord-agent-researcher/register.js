import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REST, Routes } from "discord.js";

export const commands = [
    {
        name: "connect",
        description: "Connect your Pollinations wallet privately",
    },
    {
        name: "ask",
        description: "Ask the managed Researcher agent",
        options: [
            {
                name: "question",
                description: "Your question",
                type: 3,
                required: true,
                max_length: 2000,
            },
        ],
    },
    { name: "disconnect", description: "Remove your local Discord connection" },
];

if (
    process.argv[1] &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!token || !clientId)
        throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required");
    const rest = new REST({ version: "10" }).setToken(token);
    const guildId = process.env.DISCORD_GUILD_ID;
    const route = guildId
        ? Routes.applicationGuildCommands(clientId, guildId)
        : Routes.applicationCommands(clientId);
    await rest.put(route, { body: commands });
    console.log(
        guildId
            ? `Registered commands in guild ${guildId}`
            : "Registered global commands",
    );
}
