-- Place this Script under ServerScriptService.
-- PollinationsNPC.lua must be a ModuleScript, also under ServerScriptService.

local PollinationsNPC = require(game.ServerScriptService.PollinationsNPC)

local npc = PollinationsNPC.new({
	apiKey = "YOUR_POLLINATIONS_API_KEY", -- get a free key at https://enter.pollinations.ai/keys
	persona = "You are Grix, a grumpy but helpful blacksmith NPC in a fantasy village.",
})

local npcPart = workspace:WaitForChild("NPCPart") -- any Part/Model acting as your NPC

local prompt = Instance.new("ProximityPrompt")
prompt.ActionText = "Talk"
prompt.ObjectText = "Grix the Blacksmith"
prompt.Parent = npcPart

prompt.Triggered:Connect(function(player)
	local reply = npc:Say("Hello! I'm " .. player.Name .. ".")
	print("[Grix]: " .. reply)
end)
