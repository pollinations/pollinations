const { SlashCommandBuilder } = require('discord.js');
const { generateImage } = require('../services/imageService');

const imagine = {
  data: new SlashCommandBuilder()
    .setName('imagine')
    .setDescription('Generate an image using Pollinations AI')
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('Description of the image you want to generate')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('model')
        .setDescription('AI model to use')
        .addChoices(
          { name: 'SDXL', value: 'sdxl' },
          { name: 'Stable Diffusion', value: 'stable-diffusion' }
        )
    ),

  async execute(interaction) {
    const prompt = interaction.options.getString('prompt');
    const model = interaction.options.getString('model') || 'sdxl';
    
    await interaction.deferReply();
    
    try {
      await interaction.editReply(`🎨 Generating image with ${model}...`);
      
      const imageUrl = await generateImage(prompt, model);
      
      await interaction.editReply({
        content: `✨ Generated image using ${model} for: "${prompt}"`,
        files: [imageUrl]
      });
    } catch (error) {
      console.error('Error generating image:', error);
      const errorMessage = error.message === 'Failed to generate image' 
        ? 'Sorry, there was an error generating your image. Please try again later.'
        : `Error: ${error.message}`;
      await interaction.editReply(errorMessage);
    }
  }
};

module.exports = {
  imagine
};