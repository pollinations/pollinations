-- Shows NPC replies as a chat bubble and a line in the chat window. Roblox
-- only allows both on the client. Put this LocalScript in
-- StarterPlayer > StarterPlayerScripts.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")

local speech = ReplicatedStorage:WaitForChild("PollinationsNPCSpeech")

speech.OnClientEvent:Connect(function(part, name, text)
	TextChatService:DisplayBubble(part, text)
	local general = TextChatService:FindFirstChild("TextChannels")
		and TextChatService.TextChannels:FindFirstChild("RBXGeneral")
	if general then
		general:DisplaySystemMessage(string.format("[%s]: %s", name, text))
	end
end)
