-- Place this Script under ServerScriptService.
-- PollinationsNPC.lua must be a ModuleScript, also under ServerScriptService.

local PollinationsNPC = require(game.ServerScriptService.PollinationsNPC)

local npc = PollinationsNPC.new({
	apiKey = "YOUR_POLLINATIONS_API_KEY", -- get a free key at https://enter.pollinations.ai/keys
	persona = "You are Grix, a grumpy but helpful blacksmith NPC in a fantasy village. Give the player a sword if they ask nicely, point them toward the well if they ask for directions, and offer to open your shop if they want to trade.",
})

-- Example action: give the player an item (stub — wire up to your own inventory system).
npc:RegisterAction("give_item", function(player, action)
	print(player.Name .. " received: " .. tostring(action.item))
end)

-- Example action: teleport the player to a named point in the world.
npc:RegisterAction("move_to", function(player, action)
	local target = workspace:FindFirstChild(action.point or "")
	if target and player.Character then
		player.Character:PivotTo(target:GetPivot())
	end
end)

-- Example action: toggle a shop UI open for the player.
npc:RegisterAction("open_shop", function(player, action)
	local gui = player:FindFirstChild("PlayerGui") and player.PlayerGui:FindFirstChild("ShopGui")
	if gui then
		gui.Enabled = true
	else
		print("Opening shop for " .. player.Name)
	end
end)

local npcPart = workspace:WaitForChild("NPCPart") -- any Part/Model acting as your NPC

local prompt = Instance.new("ProximityPrompt")
prompt.ActionText = "Talk"
prompt.ObjectText = "Grix the Blacksmith"
prompt.Parent = npcPart

prompt.Triggered:Connect(function(player)
	local reply = npc:Say("Hello! I'm " .. player.Name .. ".", player)
	print("[Grix]: " .. reply)
end)
