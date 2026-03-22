import debug from 'debug';
import dotenv from 'dotenv';
import { BotConfig } from './types';

const log = debug('app:config');

// Load .env file
dotenv.config();

/**
 * Pollinations API configuration
 */
export const pollinationsConfig = {
  baseUrl: process.env.POLLINATIONS_API_URL || 'https://text.pollinations.ai/openai',
};

/**
 * Parse configuration for all bots from environment variables
 * @returns Array of bot configurations
 */
export const loadBotConfigs = (): BotConfig[] => {
  log('Loading bot configurations from environment variables...');

  const configs: BotConfig[] = [];
  const seenTokens = new Set<string>();

  // Get the global conversation channels (applies to all bots)
  const globalConversationChannels = process.env.CONVERSATION_CHANNELS?.split(',') || [];

  // Find all bot tokens (format: BOT_TOKEN_1, BOT_TOKEN_2, etc.)
  // Dynamically detect bots by iterating until BOT_MODEL_[n] is not defined
  for (let i = 1; ; i++) {
    const modelVar = `BOT_MODEL_${i}`;
    const botModel = process.env[modelVar];
    
    if (!botModel) {
      break; // Stop when no more bot models are defined
    }

    const tokenVar = `BOT_TOKEN_${i}`;
    const token = process.env[tokenVar];

    if (!token) {
      log(`Warning: Bot ${i} has model '${botModel}' but no token defined. Skipping.`);
      continue; // Skip if no token defined for this index
    }

    if (seenTokens.has(token)) {
      log(`Warning: Duplicate token found for Bot ${i}. Please ensure each bot has a unique token.`);
    }
    seenTokens.add(token);

    log(`Loaded token for Bot ${i}: ${token.substring(0, 5)}...`);

    // Get bot-specific configuration
    const personality = process.env[`BOT_PERSONALITY_${i}`] || 'A helpful AI assistant';
    const name = process.env[`BOT_NAME_${i}`] || botModel;

    // Validate required fields
    if (!name.trim()) {
      log(`Warning: Bot ${i} has an empty name, using default`);
    }

    if (!botModel.trim()) {
      log(`Warning: Bot ${i} has an empty model name, using default`);
    }

    // Check for bot-specific conversation channels
    let conversationChannelIds = [...globalConversationChannels];
    const botSpecificChannels = process.env[`BOT_CONVERSATION_CHANNELS_${i}`];

    if (botSpecificChannels) {
      conversationChannelIds = botSpecificChannels.split(',').map(id => id.trim()).filter(Boolean);
      log(`Using bot-specific conversation channels for Bot ${i}: ${conversationChannelIds}`);
    } else {
      log(`Using global conversation channels for Bot ${i}: ${conversationChannelIds}`);
    }

    // Create config object
    const config: BotConfig = {
      name,
      token,
      model: botModel,
      personality,
      conversationChannelIds
    };

    configs.push(config);
    log(`Loaded config for Bot ${i}: Name='${name}', Model='${botModel}'`);
  }

  log(`Found ${configs.length} bot configurations.`);

  // Validate we have at least one bot
  if (configs.length === 0) {
    log('Warning: No bot configurations found. Check your environment variables.');
  }

  return configs;
};
