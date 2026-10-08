-- Example: the lighthouse keeper in the demo place. This is all the code a
-- game needs besides the two scripts in src/.
local ServerScriptService = game:GetService("ServerScriptService")
local PollinationsNPC = require(ServerScriptService.PollinationsNPC)

PollinationsNPC.attach(workspace.Tomo, {
	name = "Tomo",
	persona = "You keep the old lighthouse on Pollen Island, love bees and bad sea puns, "
		.. "and know every path on the island.",
})
