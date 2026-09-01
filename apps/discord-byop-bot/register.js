/**
 * Register slash commands with Discord.
 * Run once (or whenever commands change):
 *
 *   CLIENT_ID=... DISCORD_TOKEN=... node register.js
 *
 * To register to a single guild only (instant propagation):
 *
 *   GUILD_ID=... CLIENT_ID=... DISCORD_TOKEN=... node register.js
 */

import { REST, Routes, SlashCommandBuilder } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? "";
const CLIENT_ID = process.env.CLIENT_ID ?? "";
const GUILD_ID = process.env.GUILD_ID ?? "";

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error("DISCORD_TOKEN and CLIENT_ID are required");
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName("connect")
        .setDescription(
            "Link your Pollinations account via device authorization",
        ),
    new SlashCommandBuilder()
        .setName("disconnect")
        .setDescription("Remove your stored Pollinations authorization"),
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask a question using your Pollinations Pollen")
        .addStringOption((opt) =>
            opt
                .setName("prompt")
                .setDescription("Your question or prompt")
                .setRequired(true),
        ),
    new SlashCommandBuilder()
        .setName("imagine")
        .setDescription("Generate an image using your Pollinations Pollen")
        .addStringOption((opt) =>
            opt
                .setName("prompt")
                .setDescription("Describe the image")
                .setRequired(true),
        ),
].map((c) => c.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

try {
    console.log(`Registering ${commands.length} slash commands…`);
    await rest.put(route, { body: commands });
    console.log("Done.");
} catch (err) {
    console.error(err);
    process.exit(1);
}
