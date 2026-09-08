#!/usr/bin/env node
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandData } from "./bot.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !clientId)
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required");

const rest = new REST({ version: "10" }).setToken(token);
const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
await rest.put(route, { body: commandData });
console.log(
    `Registered ${commandData.length} commands ${guildId ? `for guild ${guildId}` : "globally"}.`,
);
