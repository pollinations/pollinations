--[[ ExampleNPCScript.lua
   Example usage of PollinationsNPC in a Roblox game.
   Place in: ServerScriptService → ExampleNPCScript
  
   This script creates a talking NPC that responds to player chat.
  ]]

local ServerStorage = game:GetService("ServerStorage")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Load the module
local PollinationsNPC = require(script.Parent.Modules.PollinationsNPC)

-- Create an NPC with a wizard persona
local npc = PollinationsNPC.new({
	model = "openai/gpt-5.4-nano",
	systemPrompt = "You are a wise old wizard who speaks in cryptic but helpful riddles.",
	temperature = 0.8,
	maxTokens = 256,
	apiKey = "",  -- Roblox Secrets will be injected here by the NPC system
})

-- If using Roblox Secrets, fetch the key:
-- npc.config.apiKey = game:GetService("ServerStorage"):GetSecret("POLLINATIONS_API_KEY")

-- Simple NPC dialogue handler
local Dialogue = Instance.new("Folder")
Dialogue.Name = "Dialogue"
Dialogue.Parent = script

-- Respond to player questions
npc.config.apiKey = ""  -- Replace with secret key or device flow

-- Example: respond to a player's question
local function onPlayerQuestion(player, question)
	local reply = npc:AskPlayer(question)
	print(("NPC replies to %s: %s"):format(player.Name, reply))
	return reply
end

-- Example: greet a new player
local function onPlayerJoin(player)
	local greeting = npc:GetGreeting()
	print(("NPC greets %s: %s"):format(player.Name, greeting))
end

-- Connect to game events
if game:GetService("RunService"):IsStudio() then
	print("PollinationsNPC: running in Studio mode — API calls will use query-param auth without a key.")
	print("Set apiKey via ServerStorage:GetSecret('POLLINATIONS_API_KEY') for authenticated requests.")
end

-- Export for other scripts
return {
	npc = npc,
	onPlayerQuestion = onPlayerQuestion,
	onPlayerJoin = onPlayerJoin,
}
