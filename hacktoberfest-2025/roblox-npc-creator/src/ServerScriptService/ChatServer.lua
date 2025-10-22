-- Memory-Enhanced ChatServer with Conversation Context
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

print("🚀 Memory-Enhanced ChatServer starting...")

-- Get events
local chatEvents = ReplicatedStorage:WaitForChild("ChatEvents")
local sendMessageEvent = chatEvents:WaitForChild("SendMessage")
local receiveMessageEvent = chatEvents:WaitForChild("ReceiveMessage")
local openChatUIEvent = chatEvents:WaitForChild("OpenChatUI")

print("✅ RemoteEvents connected")

-- CONVERSATION MEMORY SYSTEM
local playerConversations = {} -- Store conversation history per player
local maxHistoryLength = 10 -- Keep last 10 exchanges

-- Function to get or create conversation history for a player
local function getPlayerHistory(userId)
    if not playerConversations[userId] then
        playerConversations[userId] = {}
    end
    return playerConversations[userId]
end

-- Function to add message to conversation history
local function addToHistory(userId, role, message)
    local history = getPlayerHistory(userId)
    table.insert(history, {role = role, content = message})
    
    -- Keep only recent messages to prevent API limits
    if #history > maxHistoryLength then
        table.remove(history, 1)
    end
    
    print("💭 Added to " .. userId .. "'s history: " .. role .. " - " .. string.sub(message, 1, 30) .. "...")
    print("   History length: " .. #history .. " messages")
end

-- Function to build conversation context for API
local function buildConversationContext(userId, currentMessage)
    local history = getPlayerHistory(userId)
    local context = "You are Assistant, a friendly and helpful NPC in a Roblox game. "
    context = context .. "You remember previous parts of this conversation. "
    
    -- Add conversation history
    if #history > 0 then
        context = context .. "Previous conversation:\n"
        for _, exchange in pairs(history) do
            if exchange.role == "user" then
                context = context .. "Player: " .. exchange.content .. "\n"
            else
                context = context .. "You: " .. exchange.content .. "\n"
            end
        end
    end
    
    context = context .. "Current message: " .. currentMessage .. "\n"
    context = context .. "Respond naturally, referencing previous conversation when relevant:"
    
    return context
end

-- Enhanced API function with conversation memory
local function getResponseWithMemory(message, playerName, userId)
    if not HttpService.HttpEnabled then
        print("   ⚠️ HTTP disabled, using contextual fallback")
        local history = getPlayerHistory(userId)
        if #history > 0 then
            return "I remember we were talking about that! Unfortunately my AI connection is offline right now, but I'm still here to chat, " .. playerName .. "!"
        else
            return "Hello " .. playerName .. "! I'm your friendly NPC assistant. What would you like to chat about?"
        end
    end
    
    local success, result = pcall(function()
        local contextualPrompt = buildConversationContext(userId, message)
        
        print("   🧠 Built contextual prompt (" .. string.len(contextualPrompt) .. " chars)")
        print("   🌐 Making memory-enhanced API call...")
        
        local encodedPrompt = HttpService:UrlEncode(contextualPrompt)
        local url = "https://text.pollinations.ai/" .. encodedPrompt
        
        local response = HttpService:GetAsync(url, true)
        print("   ✅ Got contextual response: " .. string.len(response) .. " chars")
        
        return string.sub(response, 1, 400) -- Allow longer responses
    end)
    
    if success and result and string.len(result) > 5 then
        print("   🤖 Using memory-enhanced AI response")
        -- Add both user message and AI response to history
        addToHistory(userId, "user", message)
        addToHistory(userId, "assistant", result)
        return result
    else
        print("   🔄 Using contextual fallback: " .. tostring(result))
        local history = getPlayerHistory(userId)
        local fallback
        
        if #history > 0 then
            -- Contextual fallback based on history
            fallback = "I remember our conversation, " .. playerName .. "! Can you tell me more about what you mentioned earlier?"
        else
            fallback = "Hi " .. playerName .. "! That's really interesting. What else would you like to talk about?"
        end
        
        -- Still add to history even with fallback
        addToHistory(userId, "user", message)
        addToHistory(userId, "assistant", fallback)
        return fallback
    end
end

-- NPC setup with enhanced welcome
local function setupNPC()
    print("🔍 Looking for ChatNPC...")
    
    local npc = workspace:FindFirstChild("ChatNPC")
    if not npc then
        print("❌ ChatNPC not found")
        return false
    end
    
    local head = npc:FindFirstChild("Head")
    local clickDetector = head and head:FindFirstChild("ClickDetector")
    
    if not clickDetector then
        print("❌ ClickDetector not found")
        return false
    end
    
    print("✅ Found ChatNPC with memory system")
    
    -- Enhanced click handler with personalized welcome
    clickDetector.MouseClick:Connect(function(player)
        print("🎯 " .. player.Name .. " clicked ChatNPC!")
        local userId = tostring(player.UserId)
        
        -- Open chat UI
        openChatUIEvent:FireClient(player)
        print("📤 Sent UI open command")
        
        -- Send contextual welcome message
        spawn(function()
            wait(0.5)
            print("🤖 Getting contextual welcome for " .. player.Name)
            
            local history = getPlayerHistory(userId)
            local welcomePrompt
            
            if #history > 0 then
                welcomePrompt = "A returning player I've chatted with before just clicked on me to continue our conversation"
            else
                welcomePrompt = "A new player just clicked on me to start our first conversation"
            end
            
            local welcome = getResponseWithMemory(welcomePrompt, player.Name, userId)
            receiveMessageEvent:FireClient(player, "Assistant", welcome)
            print("📤 Sent contextual welcome")
        end)
    end)
    
    print("✅ Memory-enhanced NPC ready")
    return true
end

-- Enhanced message handler with conversation context
sendMessageEvent.OnServerEvent:Connect(function(player, message)
    local userId = tostring(player.UserId)
    print("💬 Contextual message from " .. player.Name .. " (" .. userId .. "): " .. message)
    
    -- Echo player message
    receiveMessageEvent:FireClient(player, player.Name, message)
    print("📤 Echoed message")
    
    -- Get contextual response
    spawn(function()
        print("🧠 Processing contextual response for " .. player.Name)
        local response = getResponseWithMemory(message, player.Name, userId)
        receiveMessageEvent:FireClient(player, "Assistant", response)
        print("📤 Sent contextual response (" .. string.len(response) .. " chars)")
    end)
end)

print("✅ Memory-enhanced message handler connected")

-- Initialize with memory system
spawn(function()
    wait(2)
    local success = setupNPC()
    if success then
        print("🎉 Memory-Enhanced ChatServer fully initialized!")
        print("📊 Conversation memory system active")
    else
        print("❌ ChatServer initialization failed")
    end
end)

-- Debug function to check memory
_G.checkPlayerMemory = function(playerName)
    local player = game.Players:FindFirstChild(playerName)
    if player then
        local userId = tostring(player.UserId)
        local history = getPlayerHistory(userId)
        print("🧠 " .. playerName .. "'s conversation history:")
        for i, exchange in pairs(history) do
            print("   " .. i .. ". " .. exchange.role .. ": " .. exchange.content)
        end
        print("   Total: " .. #history .. " exchanges")
    else
        print("❌ Player " .. playerName .. " not found")
    end
end

print("✅ Memory-Enhanced ChatServer loaded!")
