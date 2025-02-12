const { SlashCommandBuilder } = require('discord.js');
const { generateText } = require('../services/textService');

const chat = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with Pollinations AI')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Your message to the AI')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('model')
        .setDescription('AI model to use')
        .addChoices(
          { name: 'GPT-3.5', value: 'gpt-3.5-turbo' },
          { name: 'Claude', value: 'claude' }
        )
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const model = interaction.options.getString('model') || 'gpt-3.5-turbo';
    
    await interaction.deferReply();
    
    try {
      await interaction.editReply('💭 Thinking...');
      
      const response = await generateText(message, model);
      
      await interaction.editReply({
        content: `🤖 **AI Response** (using ${model}):\n\n${response}`
      });
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage = error.message === 'Failed to generate response'
        ? 'Sorry, there was an error processing your message. Please try again later.'
        : `Error: ${error.message}`;
      await interaction.editReply(errorMessage);
    }
  }
};

module.exports = {
  chat
};