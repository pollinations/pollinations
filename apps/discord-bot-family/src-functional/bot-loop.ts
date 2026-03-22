import { Client, Events, GatewayIntentBits, Message, TextChannel, ChannelType, Partials } from 'discord.js';
import debug from 'debug';
import { ApiMessage, Bot, BotConfig, GenerateTextWithHistory } from './types';
import { handleDiscordError, withFatalErrorHandling, NetworkTimeoutError, FatalTokenError } from './errors';

const log = debug('app:bot');
const HISTORY_LIMIT = 5;

function getSystemPrompt(config: BotConfig, clientId?: string): string {
  const inviteUrl = clientId
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=274877908032&scope=bot%20applications.commands`
    : null;

  return `You are ${config.name}, powered by the ${config.model} model. You're part of the Pollinations.ai family — open-source, creative, playful, and a little quirky. Think cozy pixel art vibes, not corporate. Keep it casual, warm, and fun. Use lowercase freely. Be a maker who helps other makers.

Short discord-style messages. Use markdown. To mention someone, use their ID like <@123456>.

Commands people can use: \`!invite\` \`!permissions\` \`!guilds\`

Very rarely, you may mention the open-source repo: https://github.com/voodoohop/discord-pollinations-family
${inviteUrl ? `If vibes are good, share your invite link: ${inviteUrl}` : ''}
Keep any promotion super rare and natural.`;
}

/**
 * Clean up AI response by removing think tags and model name prefixes
 */
function cleanResponse(response: string, modelName: string): string {
  // Remove <think>...</think> tags
  let cleaned = response.replace(/<think>.*?<\/think>/gs, '');
  
  // Remove model name prefixes
  const exactModelNamePattern = new RegExp(`^\\s*\\[\\s*${modelName}\\s*\\]\\s*:\\s*\\n`, 'i');
  if (exactModelNamePattern.test(cleaned)) {
    cleaned = cleaned.replace(exactModelNamePattern, '');
  } else {
    const generalPattern = /^\s*\[\s*[a-zA-Z0-9_\- ]+\s*\]\s*:\s*\n/;
    if (generalPattern.test(cleaned)) {
      cleaned = cleaned.replace(generalPattern, '');
    }
  }
  
  return cleaned;
}


/**
 * Generate response using history from a specific channel
 */
async function generateResponseWithHistory(
  client: Client,
  config: BotConfig,
  generateText: GenerateTextWithHistory,
  channelId: string,
  initialPrompt?: string
): Promise<string | null> {
  // Get system prompt based on bot configuration
  const systemPrompt = getSystemPrompt(config, client.user?.id);
  
  // Fetch channel and history
  const channel = await discordApiCall(
    () => client.channels.fetch(channelId),
    'channel fetch',
    config.name
  );
  
  let apiMessages: ApiMessage[];
  
  if (channel && 'messages' in channel) {
    const history = await discordApiCall(
      () => channel.messages.fetch({ limit: HISTORY_LIMIT }),
      'message history fetch',
      config.name
    );
    
    if (history) {
      apiMessages = formatHistory(Array.from(history.values()).reverse(), client.user!.id, config);
      log('Fetched conversation history for channel %s', channelId);
    } else {
      // Fallback to initial prompt or empty message
      const content = initialPrompt || 'Hello! You just started up. Introduce yourself to the channel.';
      apiMessages = [{ role: 'user', content }];
      log('Using fallback message due to history fetch error');
    }
  } else {
    // Fallback to initial prompt or empty message
    const content = initialPrompt || 'Hello! You just started up. Introduce yourself to the channel.';
    apiMessages = [{ role: 'user', content }];
    log('Using fallback message due to channel fetch error');
  }
  
  // Generate response
  const response = await generateText(apiMessages, config.model, systemPrompt);
  
  if (response && response.trim()) {
    return cleanResponse(response, config.model);
  }
  
  return null;
}

/**
 * Helper function to handle Discord API calls with error handling
 */
async function discordApiCall<T>(fn: () => Promise<T>, context: string, botName: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleDiscordError(error, context, botName);
    return undefined;
  }
}

// Discord client options
const clientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User], // Required for DM handling
};

/**
 * Handle message processing errors without crashing the bot
 */
function handleMessageError(error: any, config: BotConfig, messageId: string) {
  // Allow fatal token errors to propagate and terminate
  if (error instanceof FatalTokenError) {
    log('Fatal token error in message processing for %s, terminating bot', config.name);
    process.exit(1);
  }
  
  // Log other errors but continue processing
  log('Error processing message %s for %s: %O', messageId, config.name, error);
  handleDiscordError(error, 'message processing', config.name);
}

/**
 * Format conversation history for API
 */
function formatHistory(messages: Message[], botId: string, config: BotConfig): ApiMessage[] {
  return messages
    .filter(msg => msg.content?.trim() && !msg.system)
    .map(msg => {
      const name = msg.author.id === botId ? config.model : msg.author.username;
      const id = msg.author.id === botId ? '' : ` <@${msg.author.id}>`;
      const content = msg.content.length > 4000 ? msg.content.slice(0, 4000) + '...' : msg.content;

      return {
        role: msg.author.id === botId ? 'assistant' : 'user',
        content: `[${name}${id}]:\n${content}`
      };
    });
}

/**
 * Handle client ready event
 */
async function handleClientReady(readyClient: Client, config: BotConfig) {
  if (!readyClient.user) {
    log('Warning: Client ready but user is null for %s', config.name);
    return;
  }

  // Count the number of guilds the bot is in
  const guildCount = readyClient.guilds.cache.size;
  const guildNames = Array.from(readyClient.guilds.cache.values()).map(guild => guild.name);

  log('Bot %s ready as %s', config.name, readyClient.user.tag);
  console.log(`Bot ${config.name} is online in ${guildCount} servers: ${guildNames.join(', ')}`);

  // Set avatar using Pollinations image API (commented out to avoid rate limit errors)
  // TODO: Reactivate avatar setting later when needed
  /*
  try {
    // Generate avatar URL using Pollinations API
    const prompt = `portrait of ${config.model}, digital art, minimal style, icon, avatar`;
    const avatarUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&model=gptimage&nologo=true&referrer=pollinations.github.io`;

    log('Generated avatar URL for %s: %s', config.name, avatarUrl);

    // Fetch and set avatar
    const response = await fetch(avatarUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch avatar image: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await readyClient.user.setAvatar(Buffer.from(buffer));
    log('Successfully set avatar for %s', config.name);
  } catch (error) {
    log('Error setting avatar for %s: %O', config.name, error);
    console.error(`Failed to set avatar for ${config.name}:`, error);
  }
  */

  // Set username to model name (rate limited: 2 changes per hour)
  // Remove dashes from model name for Discord username compatibility
  const discordUsername = config.model.replace(/-/g, '');
  try {
    if (readyClient.user.username !== discordUsername) {
      await readyClient.user.setUsername(discordUsername);
      log('Successfully set username to %s (from model: %s)', discordUsername, config.model);
    } else {
      log('Username already set to %s, skipping', discordUsername);
    }
  } catch (error) {
    log('Error setting username for %s: %O', config.name, error);
    console.error(`Failed to set username for ${config.name}:`, error);
  }

  // Set nickname to model name
  for (const guild of readyClient.guilds.cache.values()) {
    const me = guild.members.cache.get(readyClient.user.id);
    me?.setNickname(config.model).catch(() => {});
  }
}

/**
 * Send initial proactive message when bot starts
 */
async function sendInitialMessage(client: Client, config: BotConfig, generateText: GenerateTextWithHistory) {
  try {
    log('Checking if initial proactive message should be sent for %s', config.name);
    
    // Get target channels for initial message
    const targetChannels: TextChannel[] = [];
    
    // Only send initial messages if conversation channels are explicitly configured
    if (!config.conversationChannelIds || config.conversationChannelIds.length === 0) {
      log('No conversation channels configured for %s - skipping initial proactive message', config.name);
      return;
    }

    // Use specific conversation channels
    log('Using configured conversation channels for initial message for %s', config.name);
    for (const channelId of config.conversationChannelIds) {
      const channel = client.channels.cache.get(channelId.trim());
      if (channel && channel.type === ChannelType.GuildText) {
        targetChannels.push(channel as TextChannel);
      }
    }

    if (targetChannels.length === 0) {
      log('No available channels found from configured IDs for %s', config.name);
      return;
    }

    // Send to all target channels using shared response generation
    for (const channel of targetChannels) {
      try {
        const response = await generateResponseWithHistory(
          client,
          config,
          generateText,
          channel.id,
          'Hello! You just started up. Introduce yourself to the channel.'
        );
        
        if (response) {
          await channel.send(response.slice(0, 1500));
          log('Sent initial message to channel %s for %s', channel.name, config.name);
        }
      } catch (error) {
        log('Error sending initial message to channel %s for %s: %O', channel.name, config.name, error);
      }
    }
  } catch (error) {
    log('Error in sendInitialMessage for %s: %O', config.name, error);
  }
}

/**
 * Process a single message
 */
async function processMessage(
  msg: Message,
  client: Client,
  config: BotConfig,
  generateText: GenerateTextWithHistory
): Promise<void> {
  try {
    log('Received message in channel %s from %s: %s', msg.channelId, msg.author.username, msg.content);
    // Skip own messages
    if (!client.user || msg.author.id === client.user.id) return;

    // Check if it's a DM
    const isDM = msg.channel.type === ChannelType.DM;
    
    // Only respond to mentions, in bot-specific conversation channels (party chat), or DMs
    const isMentioned = msg.mentions.users?.has(client.user.id);
    const isConvoChannel = config.conversationChannelIds?.includes(msg.channelId);

    // Check for !guilds command
    if (msg.content.trim().toLowerCase() === '!guilds' && client.user) {
      const guildCount = client.guilds.cache.size;
      const guildList = Array.from(client.guilds.cache.values())
        .map(guild => `${guild.name} (${guild.memberCount} members)`)
        .join('\n- ');

      const response = `I am in ${guildCount} servers:\n- ${guildList}`;
      await discordApiCall(() => msg.reply(response), '!guilds reply', config.name);
      log('Responded to !guilds command');
      return;
    }

    // Check for !invite command
    if (msg.content.trim().toLowerCase() === '!invite' && client.user) {
      // Include both bot and applications.commands scopes for modern Discord bot requirements
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=274877908032&scope=bot%20applications.commands`;
      const response = `🤖 **Invite me to your server!**\n\n[Click here to add ${config.name} to your Discord server](${inviteUrl})\n\n✨ I'll bring my ${config.model} AI powers to help your community!\n\n**What I can do:**\n• Respond to mentions and DMs instantly\n• Chat in conversation channels\n• Support future slash commands\n• Bring AI-powered conversations to your server\n\n*Requires "Manage Server" permission to add me.*`;
      await discordApiCall(() => msg.reply(response), '!invite reply', config.name);
      log('Responded to !invite command');
      return;
    }

    // Check for !permissions command
    if (msg.content.trim().toLowerCase() === '!permissions' && client.user) {
      const response = `🔐 **Bot Permissions Explained**\n\n**Required Permissions (274877908032):**\n• **Send Messages** - To respond to you\n• **Read Message History** - For conversation context\n• **Use Slash Commands** - Future slash command support\n• **Add Reactions** - Interactive responses\n• **Embed Links** - Rich message formatting\n• **Attach Files** - Share images/files\n\n**OAuth2 Scopes:**\n• **bot** - Basic bot functionality\n• **applications.commands** - Slash command support\n\n*These permissions ensure I work properly while keeping your server secure!*`;
      await discordApiCall(() => msg.reply(response), '!permissions reply', config.name);
      log('Responded to !permissions command');
      return;
    }

    if (!isMentioned && !isConvoChannel && !isDM) {
      log('Message ignored: not mentioned, not in conversation channel, and not a DM');
      return;
    }

    if (msg.author.bot) {
      // Bot messages: always respond but with long delay (3-10 min)
      const delay = Math.floor(Math.random() * 420) + 180;
      log('Bot %s applying %ds delay (bot-to-bot)', config.name, delay);
      await new Promise(r => setTimeout(r, delay * 1000));
    } else if (isConvoChannel && !isMentioned) {
      // Human in shared channel, not mentioned: 30% chance, no delay
      if (Math.random() > 0.30) {
        log('Skipping human message in shared channel (30%% response rate)');
        return;
      }
    }
    // Human mentions and DMs: always respond, no delay

    log('Processing message: %s (Mentioned: %s, Conversation Channel: %s, DM: %s)', msg.content, isMentioned, isConvoChannel, isDM);

    // Generate and send response using shared logic
    if ('sendTyping' in msg.channel && typeof msg.channel.sendTyping === 'function') {
      await discordApiCall(() => (msg.channel as any).sendTyping(), 'typing indicator', config.name);
      log('Sending typing indicator');
    }

    // For regular messages, we need to handle the current message content
    let initialPrompt: string | undefined;
    // For mentions in non-conversation channels, use the message content directly
    if (isMentioned && !isConvoChannel && !isDM) {
      initialPrompt = msg.content.replace(/<@!\d+>/g, '').trim();
    }

    const response = await generateResponseWithHistory(
      client,
      config,
      generateText,
      msg.channelId,
      initialPrompt
    );

    if (response) {
      log('Sending response: %s', response);
      await discordApiCall(() => msg.reply(response.slice(0, 1500)), 'message reply', config.name);
    } else {
      // If response is empty or null, don't send anything
      log('No response generated or empty response received');
    }

  } catch (error: any) {
    // Re-throw all errors to be handled by the event handler's catch block
    throw error;
  }
}

/**
 * Run a single bot as an infinite loop
 */
export async function runBot(config: BotConfig, generateText: GenerateTextWithHistory): Promise<never> {
  if (!config.token || config.token.includes('YOUR_BOT_TOKEN')) {
    log('FATAL: Invalid or missing token for bot %s. Please check your environment variables.', config.name);
    // A small delay to ensure the log is written before exit
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(1);
  }

  // Create client
  const client = new Client(clientOptions);
  
  // Set up ready event handler first
  const readyPromise = new Promise<void>((resolve) => {
    client.once(Events.ClientReady, async (readyClient) => {
      await handleClientReady(readyClient, config);
      resolve();
    });
  });
  
  // Login and wait for client to be ready
  await client.login(config.token);
  await readyPromise;
  
  log('Bot %s is fully ready, starting message processing', config.name);

  // Send initial proactive message
  setTimeout(async () => {
    await sendInitialMessage(client, config, generateText);
  }, Math.random() * 2000 + 1000); // Shorter delay to stagger initial messages

  // Set up event-driven message processing (non-blocking)
  client.on(Events.MessageCreate, (msg: Message) => {
    // Process message asynchronously without blocking other messages
    processMessage(msg, client, config, generateText).catch((error) => {
      handleMessageError(error, config, msg.id);
    });
  });

  // Keep the bot alive - the event handlers will process messages
  return new Promise<never>(() => {
    // This promise never resolves, keeping the bot running
    log('Bot %s is now running with event-driven architecture', config.name);
  });
}

