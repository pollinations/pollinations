--!strict
--[[
	TalkingNPC.server.luau
	Example Place: one talking NPC named Bramble in the Workspace.

	Setup (see luau/ExamplePlace.md and README for full steps):
		1. Insert a Part named "Bramble" into Workspace, add a ProximityPrompt
		   to it (prompt text "Talk to Bramble").
		2. Create a Cloud Secret "POLLINATIONS_API_KEY" with your Pollinations
		   key (Creator Dashboard -> Secrets).
		3. Enable HTTP requests (Experience Settings -> Security).
		4. Put PollinationsNPC as a ModuleScript under ServerScriptService and
		   this file as a Script under ServerScriptService.

	How to talk to the NPC in-game:
		- Walk up to Bramble and press E (the ProximityPrompt).
		- Type in chat:  @Bramble hello there
		- Bramble replies in chat and a speech bubble appears above her head,
		  powered by the Pollinations text model.

	You can easily swap the persona/model in the NPC config below.
--]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Players = game:GetService("Players")

local PollinationsNPC = require(ServerScriptService.PollinationsNPC)
assert(typeof(PollinationsNPC) == "table", "PollinationsNPC module not found under ServerScriptService")

-- ---------------------------------------------------------------------------
-- NPC configuration: give Bramble a persona and pick any live text model.
-- Full live model list: https://gen.pollinations.ai/text/models
-- ---------------------------------------------------------------------------
local CONFIG = {
	secretName = "POLLINATIONS_API_KEY",
	persona = "You are Bramble, a grumpy but lovable tavern keeper in the town of Pollington. " ..
		"You know everything about the local quests and gossip. Reply to players in 1-2 short " ..
		"sentences, in character, like a video game NPC. Never break character.",
	model = "openai/gpt-5.4-nano",
	temperature = 0.8,
}

local npc = PollinationsNPC.new(CONFIG)

-- Find the NPC part in the Workspace.
local npcPart = workspace:WaitForChild("Bramble")
assert(npcPart:IsA("BasePart"), "Bramble must be a BasePart (e.g. a Part) in Workspace")

-- A small speech bubble above the NPC showing her current reply.
local billboard = Instance.new("BillboardGui")
billboard.Name = "SpeechBubble"
billboard.Size = UDim2.new(0, 320, 0, 80)
billboard.StudsOffset = Vector3.new(0, 4.5, 0)
billboard.MaxDistance = 60
billboard.AlwaysOnTop = true
billboard.Adornee = npcPart

local bubbleLabel = Instance.new("TextLabel")
bubbleLabel.Name = "BubbleText"
bubbleLabel.Size = UDim2.new(1, 0, 1, 0)
bubbleLabel.BackgroundColor3 = Color3.fromRGB(20, 20, 28)
bubbleLabel.BackgroundTransparency = 0.15
bubbleLabel.TextColor3 = Color3.fromRGB(255, 245, 215)
bubbleLabel.Font = Enum.Font.GothamMedium
bubbleLabel.TextSize = 14
bubbleLabel.TextWrapped = true
bubbleLabel.TextXAlignment = Enum.TextXAlignment.Center
bubbleLabel.TextYAlignment = Enum.TextYAlignment.Center
bubbleLabel.Parent = billboard
billboard.Parent = npcPart

local function showBubble(text: string)
	bubbleLabel.Text = text
	billboard.Enabled = true
	task.delay(6, function()
		billboard.Enabled = false
	end)
end

-- Optional greeting when a player uses the ProximityPrompt.
local prompt = npcPart:WaitForChild("ProximityPrompt", 10)
if prompt then
	prompt.PromptButtonHoldBegan:Connect(function(player)
		npc:Respond(player, "(the NPC greets the player with a nod)", function(reply)
			showBubble(reply)
		end)
	end)
end

-- Players address the NPC by typing "@Bramble <message>" in chat.
local COMMAND_PREFIX = "@Bramble "
local function onPlayerChatted(player: Player, message: string)
	local text = string.trim(message) -- Luau supports string.trim
	if string.sub(text, 1, #COMMAND_PREFIX):lower() ~= COMMAND_PREFIX:lower() then
		return
	end
	local playerMessage = string.sub(text, #COMMAND_PREFIX + 1)
	if playerMessage == "" then
		return
	end

	showBubble("...")
	npc:Respond(player, playerMessage, function(reply)
		showBubble(reply)
		local chat = game:GetService("Chat")
		chat:Chat(npcPart, reply, Enum.ChatColor.Blue)
	end, function(err)
		showBubble("(Bramble seems distracted...)")
		warn(err)
	end)
end

for _, player in ipairs(Players:GetPlayers()) do
	player.Chatted:Connect(function(message)
		onPlayerChatted(player, message)
	end)
end

Players.PlayerAdded:Connect(function(player)
	player.Chatted:Connect(function(message)
		onPlayerChatted(player, message)
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	npc:Reset(player)
end)

print("[PollinationsNPC] Bramble is ready — talk to her with '@Bramble <message>' in chat.")
