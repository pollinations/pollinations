require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { handleCommands } = require('./commands');
const { setupSlashCommands } = require('./setup');

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Handle ready event
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await setupSlashCommands(client);
});

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) return;
  await handleCommands(interaction);
});

// Login with token
client.login(process.env.DISCORD_TOKEN);