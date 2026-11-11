--!strict

-- Shows NPC replies as a chat bubble and as a line in the chat window. Roblox
-- only allows both on the client. LocalScript for StarterPlayerScripts.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")

local speech = ReplicatedStorage:WaitForChild("PollinationsNpcSpeech") :: RemoteEvent

-- Chat lines are rich text, so markup in a reply must not be interpreted.
local function escape(text: string): string
	return (text:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

speech.OnClientEvent:Connect(function(head: BasePart, name: string, text: string)
	TextChatService:DisplayBubble(head, text)
	local channels = TextChatService:FindFirstChild("TextChannels")
	local general = channels and channels:FindFirstChild("RBXGeneral") :: TextChannel?
	if general then
		general:DisplaySystemMessage(string.format('<font color="#F5C542">[%s]</font> %s', escape(name), escape(text)))
	end
end)
