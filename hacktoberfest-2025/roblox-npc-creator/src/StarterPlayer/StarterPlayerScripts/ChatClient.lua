-- Enhanced ChatClient with proper text display and scrolling
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local TextService = game:GetService("TextService")

-- Prevent multiple instances
if _G.ChatClientRunning then
    script:Destroy()
    return
end
_G.ChatClientRunning = true

print("📱 Enhanced ChatClient with full text display")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Get UI components
local chatUI = playerGui:WaitForChild("ChatUI")
local mainFrame = chatUI:WaitForChild("MainFrame")
local inputBox = mainFrame:WaitForChild("InputBox")
local sendButton = mainFrame:WaitForChild("SendButton")
local closeButton = mainFrame:WaitForChild("CloseButton")
local outputFrame = mainFrame:WaitForChild("OutputFrame")

-- Get RemoteEvents
local chatEvents = ReplicatedStorage:WaitForChild("ChatEvents")
local sendMessageEvent = chatEvents:WaitForChild("SendMessage")
local receiveMessageEvent = chatEvents:WaitForChild("ReceiveMessage")
local openChatUIEvent = chatEvents:WaitForChild("OpenChatUI")

local isUIOpen = false

-- Enhanced message creation with proper height calculation
local function createMessage(sender, message, isNPC)
    print("📝 Creating message from " .. sender .. ": " .. string.sub(message, 1, 50) .. "...")
    
    local messageFrame = Instance.new("Frame")
    messageFrame.Size = UDim2.new(1, -10, 0, 20) -- Start small, will resize
    messageFrame.BackgroundTransparency = 1
    messageFrame.Parent = outputFrame
    
    local messageLabel = Instance.new("TextLabel")
    messageLabel.Size = UDim2.new(1, -10, 1, 0)
    messageLabel.Position = UDim2.new(0, 5, 0, 0)
    messageLabel.BackgroundTransparency = 1
    messageLabel.Font = Enum.Font.SourceSans
    messageLabel.TextSize = 14
    messageLabel.TextWrapped = true
    messageLabel.TextXAlignment = Enum.TextXAlignment.Left
    messageLabel.TextYAlignment = Enum.TextYAlignment.Top
    messageLabel.Parent = messageFrame
    
    -- Set text and color based on sender
    if isNPC then
        messageLabel.TextColor3 = Color3.fromRGB(120, 220, 255)
        messageLabel.Text = "🤖 " .. sender .. ": " .. message
    else
        messageLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        messageLabel.Text = "👤 " .. sender .. ": " .. message
    end
    
    -- Calculate proper height for the message
    spawn(function()
        wait(0.1) -- Let the text render
        
        local textBounds = TextService:GetTextSize(
            messageLabel.Text,
            messageLabel.TextSize,
            messageLabel.Font,
            Vector2.new(outputFrame.AbsoluteSize.X - 20, math.huge)
        )
        
        -- Set proper height with padding
        local properHeight = math.max(textBounds.Y + 10, 25)
        messageFrame.Size = UDim2.new(1, -10, 0, properHeight)
        
        print("📏 Message height set to: " .. properHeight .. " pixels")
        
        -- Update scrolling
        wait(0.1)
        local listLayout = outputFrame:FindFirstChild("UIListLayout")
        if listLayout then
            outputFrame.CanvasSize = UDim2.new(0, 0, 0, listLayout.AbsoluteContentSize.Y + 20)
            -- Auto-scroll to bottom
            outputFrame.CanvasPosition = Vector2.new(0, math.max(0, outputFrame.CanvasSize.Y.Offset - outputFrame.AbsoluteSize.Y))
            print("📜 Scrolled to show new message")
        end
    end)
    
    return messageFrame
end

-- Enhanced UI functions
local function openChatUI()
    if isUIOpen then return end
    print("📱 Opening enhanced chat UI")
    isUIOpen = true
    mainFrame.Visible = true
    
    -- Smooth animation
    mainFrame.Size = UDim2.new(0, 0, 0, 0)
    local openTween = TweenService:Create(
        mainFrame,
        TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
        {Size = UDim2.new(0, 450, 0, 400)} -- Made larger: 450x400
    )
    openTween:Play()
    
    wait(0.3)
    inputBox:CaptureFocus()
end

local function closeChatUI()
    if not isUIOpen then return end
    print("📱 Closing chat UI")
    isUIOpen = false
    inputBox:ReleaseFocus()
    
    local closeTween = TweenService:Create(
        mainFrame,
        TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
        {Size = UDim2.new(0, 0, 0, 0)}
    )
    closeTween:Play()
    closeTween.Completed:Connect(function()
        mainFrame.Visible = false
    end)
end

local function sendMessage()
    local message = inputBox.Text
    if string.len(message) > 0 then
        print("📤 Sending enhanced message: " .. message)
        sendMessageEvent:FireServer(message)
        inputBox.Text = ""
        inputBox:CaptureFocus()
    end
end

-- Connect UI events
sendButton.MouseButton1Click:Connect(sendMessage)
closeButton.MouseButton1Click:Connect(closeChatUI)

inputBox.FocusLost:Connect(function(enterPressed)
    if enterPressed and isUIOpen then
        sendMessage()
    end
end)

UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    if input.KeyCode == Enum.KeyCode.Escape and isUIOpen then
        closeChatUI()
    end
end)

-- Connect RemoteEvents
openChatUIEvent.OnClientEvent:Connect(function()
    print("📨 Received enhanced open UI command")
    openChatUI()
end)

receiveMessageEvent.OnClientEvent:Connect(function(sender, message)
    print("📨 Received enhanced message from " .. sender .. " (" .. string.len(message) .. " chars)")
    local isNPC = (sender ~= player.Name)
    createMessage(sender, message, isNPC)
end)

print("✅ Enhanced ChatClient ready with full text display!")
