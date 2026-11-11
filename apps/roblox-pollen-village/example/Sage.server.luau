-- Sage, the talking NPC in Pollen Village. This is all the code a game needs
-- besides the two scripts in src/.

local ServerScriptService = game:GetService("ServerScriptService")
local PollinationsNpc = require(ServerScriptService.PollinationsNpc)

PollinationsNpc.new(workspace.Sage, {
	name = "Sage",
	persona = "Sage is a retired cartographer who has walked every road in the valley. "
		.. "He is calm, a little dry, and always happy to point a traveller in the right direction.",
})
