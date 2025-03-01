const { imagine } = require('./imagine');
const { chat } = require('./chat');
const { RateLimiter } = require('../utils/rateLimiter');

// Create rate limiters for each command
const imagineLimiter = new RateLimiter(5, 300000); // 5 requests per 5 minutes
const chatLimiter = new RateLimiter(10, 300000); // 10 requests per 5 minutes

const commands = {
  imagine,
  chat
};

const commandLimiters = {
  imagine: imagineLimiter,
  chat: chatLimiter
};

async function handleCommands(interaction) {
  const command = commands[interaction.commandName];
  
  if (!command) {
    await interaction.reply({ content: 'Unknown command', ephemeral: true });
    return;
  }

  const limiter = commandLimiters[interaction.commandName];
  const userId = interaction.user.id;

  try {
    // Check rate limit
    if (limiter && !limiter.tryRequest(userId)) {
      const timeLeft = limiter.getTimeUntilReset(userId);
      await interaction.reply({
        content: `You're sending commands too quickly! Please wait ${Math.ceil(timeLeft / 1000)} seconds.`,
        ephemeral: true
      });
      return;
    }

    // Execute the command
    await command.execute(interaction);
  } catch (error) {
    console.error('Error handling command:', error);
    const errorMessage = 'There was an error processing your command. Please try again later.';
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

module.exports = {
  handleCommands
};