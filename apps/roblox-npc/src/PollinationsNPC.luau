--!strict

-- Gives an NPC a persona and a conversation with each player, powered by the
-- Pollinations text API (gen.pollinations.ai). Server-side only: reads the
-- API key from Roblox's secrets store so it's never exposed to clients.
-- https://create.roblox.com/docs/cloud-services/secrets

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local TextService = game:GetService("TextService")

local API_URL = "https://gen.pollinations.ai/v1/chat/completions"
local RULES = " Stay in character, never say you are an AI, and keep every reply family friendly."

export type Config = {
	persona: string?, -- who the NPC is, e.g. "You are Grix, a grumpy blacksmith."
	model: string?, -- any model from https://gen.pollinations.ai/text/models
	secretName: string?, -- secrets store entry holding the API key
	maxHistory: number?, -- messages remembered per player
	fallbackReply: string?, -- said when the request fails
}

type Message = { role: string, content: string }

local PollinationsNPC = {}

function PollinationsNPC.new(config: Config)
	local model = config.model or "amazon/nova-micro-v1"
	local secretName = config.secretName or "POLLINATIONS_API_KEY"
	local maxHistory = config.maxHistory or 10
	local fallbackReply = config.fallbackReply or "Hmm, I didn't catch that. Try again?"
	local system = (config.persona or "You are a friendly NPC in a video game.") .. RULES

	local histories: { [number]: { Message } } = {}
	local busy: { [number]: boolean } = {}
	Players.PlayerRemoving:Connect(function(player)
		histories[player.UserId] = nil
	end)

	local npc = {}

	-- Sends the message plus this player's conversation to Pollinations and
	-- returns the NPC's reply, filtered for everyone in the server. Returns
	-- nil while the player is still waiting for the previous reply. Yields.
	function npc:Say(player: Player, message: string): string?
		local userId = player.UserId
		if busy[userId] then
			return nil
		end
		busy[userId] = true

		local history = histories[userId] or {}
		local messages: { Message } = { { role = "system", content = system } }
		table.move(history, 1, #history, 2, messages)
		table.insert(messages, { role = "user", content = message })

		local ok, reply = pcall(function(): string
			local secret = HttpService:GetSecret(secretName)
			local result = HttpService:RequestAsync({
				Url = API_URL,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					Authorization = secret:AddPrefix("Bearer "),
				},
				Body = HttpService:JSONEncode({ model = model, messages = messages, max_tokens = 150 }),
			})
			assert(result.Success, `HTTP {result.StatusCode}: {result.Body:sub(1, 200)}`)
			return HttpService:JSONDecode(result.Body).choices[1].message.content
		end)
		busy[userId] = nil

		if ok and type(reply) == "string" and reply:find("%S") then
			-- Only answered turns are remembered.
			table.insert(history, { role = "user", content = message })
			table.insert(history, { role = "assistant", content = reply })
			while #history > maxHistory do
				table.remove(history, 1) -- drop the oldest question and answer together
				table.remove(history, 1)
			end
			histories[userId] = history
		else
			-- A missing secret means: add POLLINATIONS_API_KEY in the Creator
			-- Dashboard, or in Studio's Local Secrets for playtests (README).
			warn(`[PollinationsNPC] {if ok then "empty reply" else reply}`)
			reply = fallbackReply
		end

		-- Generated text is shown to players, so it goes through Roblox's filter.
		local filtered, text = pcall(function()
			return TextService:FilterStringAsync(reply, userId):GetNonChatStringForBroadcastAsync()
		end)
		if not filtered then
			warn(`[PollinationsNPC] text filter failed: {text}`)
			return nil
		end
		return text
	end

	return npc
end

return PollinationsNPC
