require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nacl = require('tweetnacl');
const { Buffer } = require('buffer');
const { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder } = require('discord.js');
const fs = require('fs');

// Check axios with try-catch
let axios;
try {
    axios = require('axios');
} catch (error) {
    console.error('CRITICAL: axios is not installed. Run: npm install axios');
    // Don't exit, let the server run without AI features
}

// Create a stream to log to bot.log file
const logStream = fs.createWriteStream(__dirname + '/bot.log', { flags: 'a' });

// File for storing memory
const MEMORY_LOG = __dirname + '/memory.log';

// Safe logging function
function safeLog(message) {
    const logMessage = `[${new Date().toISOString()}] ${message}\n`;
    try {
        logStream.write(logMessage);
        process.stdout.write(logMessage);
    } catch (error) {
        process.stdout.write(logMessage);
    }
}

// Override console.log to write to file and terminal
console.log = function (message) {
    safeLog(message);
};

// Override console.error to write to file and terminal
console.error = function (message) {
    const logMessage = `[ERROR] [${new Date().toISOString()}] ${message}\n`;
    try {
        logStream.write(logMessage);
        process.stderr.write(logMessage);
    } catch (error) {
        process.stderr.write(logMessage);
    }
};

console.log('=== BOT STARTING ===');

const app = express();
const PORT = process.env.PORT || 8080;

// Retrieve tokens from environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const APPLICATION_ID = process.env.APPLICATION_ID;
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

// List of available models from Pollinations API
const AVAILABLE_MODELS = ["flux", "kontext", "turbo", "gptimage"];

// Function for delay (used for retries)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Validate environment variables (don't exit if PUBLIC_KEY is missing)
if (!TOKEN) {
    console.error('DISCORD_TOKEN not found in .env');
    process.exit(1);
}
if (!PUBLIC_KEY) {
    console.error('WARNING: DISCORD_PUBLIC_KEY not found in .env - slash commands will fail');
}
if (!APPLICATION_ID) {
    console.error('APPLICATION_ID not found in .env');
    process.exit(1);
}
if (!POLLINATIONS_API_KEY) {
    console.error('API_KEY for Pollinations not found in .env');
    process.exit(1);
}

console.log('Environment variables loaded successfully');
console.log(`Available models: ${AVAILABLE_MODELS.join(', ')}`);

// Initialize Discord Client with additional intents for messages
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ]
});

// Function to save memory to memory.log
function saveToMemory(userId, userDisplayName, userMessage, botResponse, type, model = null) {
    const memoryEntry = {
        userId,
        userDisplayName,
        userMessage: userMessage.substring(0, 100), // Limit length
        botResponse: type === 'image' ? `Generated image: ${botResponse}` : botResponse.substring(0, 100),
        type,
        model,
        timestamp: new Date().toISOString()
    };
    try {
        fs.appendFileSync(MEMORY_LOG, JSON.stringify(memoryEntry) + '\n');
        console.log(`Saved memory for user ${userDisplayName} (${userId})`);
    } catch (error) {
        console.error(`Failed to save memory: ${error.message}`);
    }
}

// Function to load recent memory for a user
function loadUserMemory(userId) {
    try {
        if (!fs.existsSync(MEMORY_LOG)) return [];
        const lines = fs.readFileSync(MEMORY_LOG, 'utf8').split('\n').filter(line => line.trim());
        const userMemory = lines
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(entry => entry && entry.userId === userId)
            .slice(-5); // Take the last 5 interactions
        return userMemory;
    } catch (error) {
        console.error(`Failed to load memory: ${error.message}`);
        return [];
    }
}

// Function to call Pollinations Text AI with retry
async function getTextAIResponse(userMessage, userDisplayName, userId) {
    if (!axios) {
        throw new Error('Axios is not available. Install with: npm install axios');
    }

    const attemptRequest = async (attempt = 1) => {
        try {
            // Load memory for user
            const memory = loadUserMemory(userId);
            const memoryContext = memory.length > 0
                ? memory.map(m => `[Previous: User: ${m.userMessage} | Lily: ${m.botResponse}]`).join('\n')
                : 'No previous conversation.';

            const seed = Math.floor(Math.random() * 90000000) + 10000000;
            const availableModelsStr = AVAILABLE_MODELS.join(', ');
            const payload = {
                model: 'gemini-search',
                messages: [
                    {
                        role: 'user',
                        content: `Your Persona: You are an AI Assistant named Lily. You have access to conversation history:\n${memoryContext}\nAvailable image models: ${availableModelsStr}. If the user asks to generate, create, draw, or make an image/picture (e.g., "generate an image of...", "create a picture of...") and specifies a model (e.g., "using flux", "model turbo"), you MUST IMMEDIATELY respond ONLY with the format: {{IMAGE: <describe the image prompt here> | model=<model_name>}}. If the model is invalid, respond with text: "Sorry ${userDisplayName}, that model isn't available. Try ${availableModelsStr}!". If no model specified, use {{IMAGE: <prompt>}} (defaults to flux). Otherwise, respond normally with text. The user is named ${userDisplayName}. User Input: ${userMessage}`
                    }
                ],
                seed: seed 
            };

            console.log(`Starting Pollinations Text AI request (Attempt ${attempt}) for user ${userDisplayName} with message: ${userMessage.substring(0, 50)}...`);

            const response = await axios.post('https://text.pollinations.ai/', payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${POLLINATIONS_API_KEY}`
                },
                timeout: 30000
            });

            console.log(`Pollinations Text AI response received: Status=${response.status}`);

            const replyText = response.data.choices && 
                            response.data.choices[0] && 
                            response.data.choices[0].message && 
                            response.data.choices[0].message.content
                ? response.data.choices[0].message.content
                : (typeof response.data === 'string' ? response.data : JSON.stringify(response.data));

            return replyText;
        } catch (error) {
            if (
              attempt === 1 &&
              (
                error.response?.status === 429 ||
                error.response?.status === 502 ||
                error.code === 'ECONNABORTED' ||
                error.code === 'ETIMEDOUT'
              )
            ) {
                console.error(`Rate limit or timeout error on Text AI request: ${error.message}. Retrying in 5 seconds...`);
                await delay(5000);
                return attemptRequest(2);
            }
            console.error(`Failed to call Pollinations Text AI: ${error.message}`);
            throw error;
        }
    };

    return attemptRequest();
}

// Function to validate model
function validateModel(modelName) {
    if (!modelName) return null;
    const normalized = modelName.toLowerCase().trim();
    const validModel = AVAILABLE_MODELS.find(m => m.toLowerCase() === normalized);
    return validModel || null;
}

// Function to generate image using Pollinations Image API with optional model and retry
async function generateImage(imagePrompt, requestedModel = null) {
    if (!axios) {
        throw new Error('Axios is not available. Install with: npm install axios');
    }

    const attemptRequest = async (attempt = 1) => {
        try {
            // Sanitize and URL-encode prompt
            const encodedPrompt = encodeURIComponent(imagePrompt.trim());
            const seed = Math.floor(Math.random() * 90000000) + 10000000;
            let imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true`;

            // Add model if valid
            if (requestedModel) {
                imageUrl += `&model=${requestedModel}`;
                console.log(`Using model: ${requestedModel} for prompt: ${imagePrompt.substring(0, 50)}...`);
            } else {
                console.log(`Using default model (flux) for prompt: ${imagePrompt.substring(0, 50)}...`);
            }

            console.log(`Image URL (Attempt ${attempt}): ${imageUrl}`);

            // GET request to Pollinations Image API (fetch binary image data)
            const response = await axios.get(imageUrl, {
                timeout: 60000,
                responseType: 'arraybuffer' // Fetch data as buffer
            });

            // Create attachment from buffer
            const imageBuffer = Buffer.from(response.data);
            const attachment = new AttachmentBuilder(imageBuffer, { name: `generated_image_${requestedModel || 'flux'}.png` });

            console.log(`Image generated successfully for prompt: ${imagePrompt} with model: ${requestedModel || 'flux'}`);
            return attachment;
        } catch (error) {
            if (attempt === 1 && (error.response?.status === 429 || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
                console.error(`Rate limit or timeout error on Image AI request: ${error.message}. Retrying in 5 seconds...`);
                await delay(5000);
                return attemptRequest(2);
            }
            console.error(`Failed to generate image: ${error.message}`);
            throw error;
        }
    };

    return attemptRequest();
}

// Main function to get response (text or image)
async function getAIResponse(userMessage, userDisplayName, userId) {
    // Get text response from Lily
    const lilyResponse = await getTextAIResponse(userMessage, userDisplayName, userId);

    // Check if Lily requests image generation with format {{IMAGE: prompt | model=model_name}}
    const imageMatch = lilyResponse.match(/\{\{IMAGE:\s*(.*?)(?:\s*\|\s*model=([a-zA-Z0-9]+))?\}\}/i);
    if (imageMatch) {
        const imagePrompt = imageMatch[1].trim();
        const requestedModel = imageMatch[2] ? validateModel(imageMatch[2]) : null;

        if (imagePrompt && (requestedModel || true)) { // true allows default if no model
            console.log(`Image request detected from Lily for user ${userDisplayName}. Prompt: ${imagePrompt}, Model: ${requestedModel || 'default (flux)'}`);
            const attachment = await generateImage(imagePrompt, requestedModel);
            return { type: 'image', content: attachment, model: requestedModel || 'flux', imagePrompt };
        }
    }

    // Fallback to text (includes invalid model cases)
    return { type: 'text', content: lilyResponse };
}

// Add event for debugging
client.on('debug', (info) => {
    // Skip overly verbose debug logs
    if (!info.includes('heartbeat')) {
        console.log(`[DEBUG] ${info}`);
    }
});

client.on('warn', (warning) => {
    console.error(`[WARN] ${warning}`);
});

client.on('error', (error) => {
    console.error(`Discord Client error: ${error.message}`);
});

// Event to handle new messages (mentions and replies)
client.on('messageCreate', async (message) => {
    try {
        // Don't process messages from the bot itself
        if (message.author.bot) return;

        let shouldReply = false;
        let userMessage = '';

        // Check if bot is mentioned
        if (message.mentions.has(client.user)) {
            console.log(`Bot mentioned by ${message.author.tag} in channel ${message.channel.name}`);
            shouldReply = true;
            // Remove mention from message to get actual content
            userMessage = message.content.replace(`<@${client.user.id}>`, '').trim();
        }

        // Check if message is a reply to the bot
        if (!shouldReply && message.reference && message.reference.messageId) {
            const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (referencedMessage.author.id === client.user.id) {
                console.log(`Bot message replied to by ${message.author.tag} in channel ${message.channel.name}`);
                shouldReply = true;
                userMessage = message.content.trim();
            }
        }

        // If bot should reply, ensure message is not empty
        if (shouldReply) {
            // If message is empty, don't call AI, reply with default message
            if (!userMessage || userMessage.trim() === '') {
                console.log(`Empty message from ${message.author.tag}, replying with default message`);
                await message.reply('Hello! Please ask a question or give a command.');
                return; 
            }

            // Use displayName if available, fallback to tag
            const userDisplayName = message.member?.nickname || message.author.displayName || message.author.tag;
            const userId = message.author.id;
            console.log(`Sender: ${message.author.tag}, Display Name: ${userDisplayName}, ID: ${userId}, Message: ${userMessage}`);

            // Send "typing..." indicator
            await message.channel.sendTyping();

            // Get response from AI (text or image)
            const aiResponse = await getAIResponse(userMessage, userDisplayName, userId);

            // Log and save AI response
            if (aiResponse.type === 'image') {
                console.log(`AI response for ${userDisplayName}: Image generated with model ${aiResponse.model}`);
                // Send image as attachment
                await message.reply({ content: `Hey ${userDisplayName}, here's your image (model: ${aiResponse.model})! ðŸ˜˜`, files: [aiResponse.content] });
                // Save to memory
                saveToMemory(userId, userDisplayName, userMessage, aiResponse.imagePrompt, 'image', aiResponse.model);
            } else {
                console.log(`AI response for ${userDisplayName}: ${aiResponse.content.substring(0, 50)}...`);
                // Limit text response length (Discord limit: 2000 characters)
                const limitedResponse = aiResponse.content.length > 2000 
                    ? aiResponse.content.substring(0, 1997) + '...' 
                    : aiResponse.content;
                await message.reply(limitedResponse);
                // Save to memory
                saveToMemory(userId, userDisplayName, userMessage, aiResponse.content, 'text');
            }
            console.log(`Bot successfully replied with AI to ${message.author.tag}`);
        }
    } catch (error) {
        console.error(`Error handling message from ${message.author.tag}: ${error.message}`);
        try {
            await message.reply('Sorry, an error occurred while processing your message. I might be too popular right now! ðŸ˜… Try again in a bit.');
        } catch (replyError) {
            console.error(`Failed to send error message to ${message.author.tag}: ${replyError.message}`);
        }
    }
});

// Register slash commands
const commands = [
    {
        name: 'ping',
        description: 'Displays bot uptime'
    },
    {
        name: 'ask',
        description: 'Ask something to the AI',
        options: [
            {
                name: 'question',
                type: 3, // STRING type
                description: 'Your question',
                required: true
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// Register commands with delay to avoid race conditions
setTimeout(async () => {
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(APPLICATION_ID),
            { body: commands }
        );
        console.log('Slash commands registered successfully');
    } catch (error) {
        console.error(`Failed to register slash commands: ${error.message}`);
    }
}, 2000);

// Login to Discord with retry
let loginAttempts = 0;
const maxLoginAttempts = 3;

function attemptLogin() {
    console.log(`Attempting to login to Discord (attempt ${loginAttempts + 1}/${maxLoginAttempts})...`);
    client.login(TOKEN).catch(err => {
        console.error(`Failed to login to Discord: ${err.message}`);
        loginAttempts++;
        if (loginAttempts < maxLoginAttempts) {
            console.log(`Retrying login in 5 seconds...`);
            setTimeout(attemptLogin, 5000);
        } else {
            console.error('Maximum login attempts reached. Bot continues running without Discord connection.');
        }
    });
}

attemptLogin();

// Event when bot is ready
client.once('ready', () => {
    console.log(`Bot online as ${client.user.tag}`);
});

// Parse raw body for signature verification
app.use(bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// Endpoint /discord-bot/discord for GET and POST
app.all('/discord-bot/discord', async (req, res) => {
    try {
        if (req.method === 'GET') {
            // Handle GET request for testing AI or status
            const userMessage = req.query.message;

            if (userMessage && axios) {
                // If message parameter exists, test AI
                try {
                    // For GET endpoint, use default name and dummy userId
                    const aiResponse = await getAIResponse(userMessage, 'Unknown User', 'unknown');
                    if (aiResponse.type === 'image') {
                        res.json({
                            status: 'success',
                            message: 'Image generated from Pollinations AI',
                            query: userMessage,
                            type: 'image',
                            model: aiResponse.model,
                            image_info: { name: aiResponse.content.name }
                        });
                    } else {
                        res.json({
                            status: 'success',
                            message: 'Response from Pollinations AI',
                            query: userMessage,
                            type: 'text',
                            reply: aiResponse.content
                        });
                    }
                } catch (error) {
                    res.status(500).json({
                        status: 'error',
                        message: 'Failed to call Pollinations AI',
                        error: error.message
                    });
                }
            } else {
                // If no parameter, show bot status
                const status = {
                    server: 'running',
                    discordConnected: client.isReady(),
                    botName: client.isReady() ? client.user.tag : 'Not connected',
                    uptime: client.isReady() ? client.uptime : null,
                    timestamp: new Date().toISOString(),
                    loginStatus: client.isReady() ? 'Connected' : (client.ws.status === 0 ? 'Connecting' : 'Disconnected'),
                    axiosAvailable: !!axios,
                    availableModels: AVAILABLE_MODELS
                };

                console.log('GET /discord-bot/discord accessed: ' + JSON.stringify(status));
                res.json({
                    status: 'success',
                    message: status.discordConnected 
                        ? `Bot is connected as ${status.botName} (Uptime: ${Math.floor(status.uptime / 1000)} seconds)`
                        : `Bot server is running. Discord: ${status.loginStatus}`,
                    data: status
                });
            }
        } else if (req.method === 'POST') {
            // Handle POST request for Discord interactions
            if (!PUBLIC_KEY) {
                console.error('PUBLIC_KEY not available for verification');
                return res.status(500).json({ error: 'PUBLIC_KEY not configured' });
            }

            const signature = req.get('X-Signature-Ed25519');
            const timestamp = req.get('X-Signature-Timestamp');

            if (!signature || !timestamp) {
                console.error('Missing signature headers');
                return res.status(401).json({ error: 'Missing signature headers' });
            }

            const body = req.rawBody;
            const messageBytes = Buffer.from(timestamp + body);
            const signatureBytes = Buffer.from(signature, 'hex');
            const publicKeyBytes = Buffer.from(PUBLIC_KEY, 'hex');

            const isVerified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
            if (!isVerified) {
                console.error('Invalid signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }

            const interaction = req.body;

            // Ping
            if (interaction.type === 1) {
                console.log('Received PING interaction');
                return res.json({ type: 1 });
            }

            // Slash commands
            if (interaction.type === 2) {
                console.log(`Received slash command: ${interaction.data.name}`);
                
                if (interaction.data.name === 'ping') {
                    const uptime = client.isReady() ? Math.floor(client.uptime / 1000) : 0;
                    return res.json({
                        type: 4,
                        data: { content: `Pong! Bot uptime: ${uptime} seconds` }
                    });
                }

                if (interaction.data.name === 'ask') {
                    if (!axios) {
                        return res.json({
                            type: 4,
                            data: { content: 'AI feature not available. Axios is not installed.' }
                        });
                    }

                    // Defer reply as AI may take time (especially for images or retries)
                    res.json({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE

                    try {
                        const question = interaction.data.options[0].value;
                        // Use server nickname if available, then displayName, then tag
                        const userDisplayName = interaction.member?.nickname || interaction.user.displayName || interaction.user.tag;
                        const userId = interaction.user.id;
                        const userTag = interaction.user ? interaction.user.tag : 'Unknown User';

                        // Log sender and message for slash command
                        console.log(`Sender: ${userTag}, Display Name: ${userDisplayName}, ID: ${userId}, Message: ${question}`);

                        const aiResponse = await getAIResponse(question, userDisplayName, userId);

                        // Log and save AI response
                        if (aiResponse.type === 'image') {
                            console.log(`AI response for ${userDisplayName}: Image generated with model ${aiResponse.model}`);
                            // For slash commands, use Discord.js client for follow-up
                            const channel = await client.channels.fetch(interaction.channel_id);
                            await channel.send({
                                content: `Hey ${userDisplayName}, here's your image (model: ${aiResponse.model})! ðŸ˜˜`,
                                files: [aiResponse.content]
                            });
                            // Update deferred reply for confirmation
                            await axios.patch(
                                `https://discord.com/api/v10/webhooks/${APPLICATION_ID}/${interaction.token}/messages/@original`,
                                { content: `Image sent, ${userDisplayName}! Check it out above! ðŸ˜Š` },
                                { headers: { 'Content-Type': 'application/json' } }
                            );
                            // Save to memory
                            saveToMemory(userId, userDisplayName, question, aiResponse.imagePrompt, 'image', aiResponse.model);
                        } else {
                            console.log(`AI response for ${userDisplayName}: ${aiResponse.content.substring(0, 50)}...`);
                            // Limit text response length
                            const limitedResponse = aiResponse.content.length > 2000 
                                ? aiResponse.content.substring(0, 1997) + '...' 
                                : aiResponse.content;

                            await axios.patch(
                                `https://discord.com/api/v10/webhooks/${APPLICATION_ID}/${interaction.token}/messages/@original`,
                                { content: limitedResponse },
                                { headers: { 'Content-Type': 'application/json' } }
                            );
                            // Save to memory
                            saveToMemory(userId, userDisplayName, question, aiResponse.content, 'text');
                        }
                    } catch (error) {
                        console.error(`Error on /ask command: ${error.message}`);
                        await axios.patch(
                            `https://discord.com/api/v10/webhooks/${APPLICATION_ID}/${interaction.token}/messages/@original`,
                            { content: 'Sorry, an error occurred while processing your question. I might be too popular right now! ðŸ˜… Try again in a bit.' },
                            { headers: { 'Content-Type': 'application/json' } }
                        );
                    }
                    return;
                }

                return res.json({
                    type: 4,
                    data: { content: `Command ${interaction.data.name} received!` }
                });
            }

            console.log('Received unknown interaction type: ' + interaction.type);
            res.json({ type: 4, data: { content: 'Interaction received' } });
        } else {
            // Other methods not allowed
            console.error(`Method ${req.method} not allowed on /discord-bot/discord`);
            res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error(`Error in route handler: ${error.message}`);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// 404 handler
app.use((req, res) => {
    console.error(`404 Not Found: ${req.originalUrl}`);
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Handle server errors
app.use((err, req, res, next) => {
    console.error('Server error: ' + err.message);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server with error handling
const server = app.listen(PORT, () => {
    console.log(`=== Discord bot server listening on port ${PORT} ===`);
    console.log(`Server URL: http://localhost:${PORT}/discord-bot/discord`);
}).on('error', (err) => {
    console.error('Failed to start server: ' + err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Use another port or terminate the process using this port.`);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        client.destroy();
        logStream.end();
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        client.destroy();
        logStream.end();
        process.exit(0);
    });
});

console.log('=== Bot initialization complete ===');
