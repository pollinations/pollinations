const { REST, Routes } = require('discord.js');
const { imagine } = require('./commands/imagine');
const { chat } = require('./commands/chat');

async function setupSlashCommands(client) {
  const commands = [
    imagine.data.toJSON(),
    chat.data.toJSON()
  ];

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error setting up slash commands:', error);
  }
}

module.exports = {
  setupSlashCommands
};