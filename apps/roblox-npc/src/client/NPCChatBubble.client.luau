-- Place this LocalScript under StarterPlayer > StarterPlayerScripts.
-- Shows the NPC's reply as a chat bubble above its part for every client.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")

local npcReplyEvent = ReplicatedStorage:WaitForChild("NPCReply")

npcReplyEvent.OnClientEvent:Connect(function(npcPart, message)
	TextChatService:DisplayBubble(npcPart, message)
end)
