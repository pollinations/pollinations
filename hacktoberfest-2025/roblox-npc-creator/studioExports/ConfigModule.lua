-- ConfigModule.lua - Updated for Roblox compatibility
local Config = {}

-- API Configuration - Using a simple text generation API that works in Roblox
Config.API_URL = "https://text.pollinations.ai/"
Config.MODEL = "openai" -- Simple model parameter
Config.API_KEY = "no key" -- This API doesn't require a key

-- Chat Configuration
Config.MAX_MESSAGE_LENGTH = 1024
Config.RATE_LIMIT_SECONDS = 2
Config.MAX_CHAT_HISTORY = 50

-- NPC Configuration
Config.NPC_NAME = "Assistant"
Config.NPC_PERSONALITY = "You are a helpful and friendly NPC in a Roblox game named " .. Config.NPC_NAME .. ". Keep responses brief, engaging, and appropriate for all ages. Be enthusiastic about helping players!"

-- System Messages
Config.SYSTEM_MESSAGES = {
    WELCOME = "👋 Hello! I'm here to help you. What would you like to talk about?",
    ERROR = "❌ Sorry, I'm having trouble connecting right now. Let me try a different response!",
    RATE_LIMIT = "⏰ Please wait a moment before sending another message.",
    TOO_LONG = "📝 Your message is too long! Please keep it under " .. Config.MAX_MESSAGE_LENGTH .. " characters."
}

return Config
