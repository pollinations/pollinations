#!/usr/bin/env node

import debug from 'debug';
import { pollinationsConfig } from './config';
import { createGenerateTextWithHistory } from './api';
import { runBot } from './bot-loop';
import { BotConfig } from './types';

const log = debug('app:cli');

/**
 * Parse command line arguments
 */
function parseArgs(): { model: string; token: string; name?: string; personality?: string; channels?: string[] } {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error(`
Usage: ts-node src-functional/cli.ts <model> <token> [options]

Arguments:
  model       Bot model name (e.g., 'geminisearch', 'deepseek', 'chickytutor')
  token       Discord bot token

Options:
  --name <name>              Bot display name (defaults to model name)
  --personality <text>       Bot personality description
  --channels <id1,id2,...>   Comma-separated conversation channel IDs
  
Examples:
  ts-node src-functional/cli.ts geminisearch BOT_TOKEN_HERE
  ts-node src-functional/cli.ts deepseek BOT_TOKEN_HERE --name "DeepSeek AI" --personality "A thoughtful AI researcher"
  ts-node src-functional/cli.ts chickytutor BOT_TOKEN_HERE --channels "1370368057641533440,1234567890123456789"
`);
    process.exit(1);
  }

  const model = args[0];
  const token = args[1];
  
  let name: string | undefined;
  let personality: string | undefined;
  let channels: string[] | undefined;

  // Parse optional arguments
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--name' && i + 1 < args.length) {
      name = args[i + 1];
      i++; // Skip next argument as it's the value
    } else if (arg === '--personality' && i + 1 < args.length) {
      personality = args[i + 1];
      i++; // Skip next argument as it's the value
    } else if (arg === '--channels' && i + 1 < args.length) {
      channels = args[i + 1].split(',').map(id => id.trim()).filter(Boolean);
      i++; // Skip next argument as it's the value
    }
  }

  return { model, token, name, personality, channels };
}

/**
 * Create bot configuration from CLI arguments
 */
function createBotConfig(args: ReturnType<typeof parseArgs>): BotConfig {
  // Get global conversation channels from environment as fallback
  let globalChannels: string[] | undefined;
  
  if (process.env.CONVERSATION_CHANNELS && process.env.CONVERSATION_CHANNELS.trim()) {
    globalChannels = process.env.CONVERSATION_CHANNELS.split(',').map(id => id.trim()).filter(Boolean);
    // If after filtering we have no valid IDs, treat as undefined
    if (globalChannels.length === 0) {
      globalChannels = undefined;
    }
  }
  
  return {
    name: args.name || args.model,
    token: args.token,
    model: args.model,
    personality: args.personality || 'A helpful AI assistant',
    conversationChannelIds: args.channels || globalChannels
  };
}

/**
 * Main CLI function
 */
async function main() {
  try {
    log('Starting Discord bot CLI...');
    
    // Parse command line arguments
    const args = parseArgs();
    log('Parsed arguments:', args);
    
    // Validate token
    if (!args.token || args.token.includes('YOUR_BOT_TOKEN')) {
      console.error('Error: Invalid or missing Discord bot token');
      process.exit(1);
    }
    
    // Create bot configuration
    const config = createBotConfig(args);
    log('Created bot config:', { name: config.name, model: config.model });
    
    // Create text generation function
    const generateText = createGenerateTextWithHistory(pollinationsConfig.baseUrl);
    
    // Set up shutdown handlers
    process.on('SIGINT', () => {
      log('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      log('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });
    
    console.log(`🚀 Starting bot: ${config.name} (${config.model})`);
    console.log(`📝 Personality: ${config.personality}`);
    if (config.conversationChannelIds && config.conversationChannelIds.length > 0) {
      console.log(`💬 Conversation channels: ${config.conversationChannelIds.join(', ')}`);
    } else {
      console.log(`💬 Conversation channels: DISABLED (bot will only respond to mentions and DMs)`);
    }
    console.log(`🔧 Debug logs: Set DEBUG=app:* to see detailed logs`);
    console.log('');
    
    // Run the bot (never returns)
    await runBot(config, generateText);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main as runSingleBot };
