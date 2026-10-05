#!/usr/bin/env node
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./bot.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const route = config.discordGuildId
    ? Routes.applicationGuildCommands(
          config.discordClientId,
          config.discordGuildId,
      )
    : Routes.applicationCommands(config.discordClientId);

await new REST({ version: "10" })
    .setToken(config.discordToken)
    .put(route, { body: commands(config.agentName) });

console.log(
    `Registered commands ${config.discordGuildId ? `for guild ${config.discordGuildId}` : "globally"}.`,
);
