-- Grix the blacksmith: greets players who use the Talk prompt and answers
-- anyone who chats nearby. Lives in ServerScriptService next to the
-- PollinationsNPC ModuleScript.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local PollinationsNPC = require(script.Parent:WaitForChild("PollinationsNPC"))

local TALK_RANGE = 15 -- studs

local npcReplyEvent = ReplicatedStorage:FindFirstChild("NPCReply")
if not npcReplyEvent then
	npcReplyEvent = Instance.new("RemoteEvent")
	npcReplyEvent.Name = "NPCReply"
	npcReplyEvent.Parent = ReplicatedStorage
end

local npc = PollinationsNPC.new({
	persona = "You are Grix, a grumpy but helpful blacksmith NPC in a fantasy village. "
		.. "Keep replies to one or two sentences.",
})

local npcPart = workspace:WaitForChild("Grix") -- any Part acting as your NPC

local function reply(player, message)
	local text = npc:Say(player, message)
	if text then
		npcReplyEvent:FireAllClients(npcPart, text)
	end
end

local prompt = Instance.new("ProximityPrompt")
prompt.ActionText = "Talk"
prompt.ObjectText = "Grix the Blacksmith"
prompt.HoldDuration = 0
prompt.MaxActivationDistance = 10
prompt.Parent = npcPart

prompt.Triggered:Connect(function(player)
	reply(player, "(A traveller walks up and says hello.)")
end)

local function listen(player)
	player.Chatted:Connect(function(message)
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		if message:sub(1, 1) ~= "/" and root and (root.Position - npcPart.Position).Magnitude <= TALK_RANGE then
			reply(player, message)
		end
	end)
end
for _, player in Players:GetPlayers() do
	listen(player)
end
Players.PlayerAdded:Connect(listen)
