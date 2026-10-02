--!strict
--[[
	PollinationsNPC.luau
	Roblox NPC dialogue powered by Pollinations text models.

	A few lines of Luau give any NPC a persona and let it reply to players
	in chat. The API key is kept in Roblox's Cloud Secrets store and is only
	ever used from server scripts — it never touches the client.

	Requires:
		- HTTP requests enabled in Experience Settings.
		- A Cloud Secret (Creator Dashboard -> your experience -> Secrets)
		  containing a Pollinations API key (sk_ or pk_). The Secret name is
		  passed to PollinationsNPC.new({ secretName = "POLLINATIONS_API_KEY" }).
		  Local Studio playtesting can use a local secret; see README.

	Usage (from a Script under ServerScriptService):

		local PollinationsNPC = require(script.Parent.PollinationsNPC)
		local bramble = PollinationsNPC.new({
			secretName = "POLLINATIONS_API_KEY",
			persona = "You are Bramble, a grumpy but lovable tavern keeper in a fantasy town.",
			model = "openai/gpt-5.4-nano",
		})

		-- When a player chats "hello", Bramble answers:
		bramble:Respond(player, "hello", function(reply)
			print(reply)
		end)

	The endpoint follows the live model list at https://gen.pollinations.ai/text/models
	Any text model name from that list can be passed as `model`.
--]]

local HttpService = game:GetService("HttpService")

local API_URL = "https://gen.pollinations.ai/v1/chat/completions"
local DEFAULT_MODEL = "openai/gpt-5.4-nano"
local DEFAULT_HISTORY_SIZE = 12
local DEFAULT_TIMEOUT = 30
local MAX_OUTPUT_TOKENS = 200

local PollinationsNPC = {}
PollinationsNPC.__index = PollinationsNPC

--[[
	Create an NPC.
	config:
		secretName  (string)  Name of the Cloud Secret holding the Pollinations API key.
		persona     (string)  Persona/system prompt for this NPC.
		model       (string?) Text model from the live model list (default openai/gpt-5.4-nano).
		temperature (number?) Sampling temperature (default 0.8).
		historySize (number?) Max turns kept per player (default 12).
		timeout     (number?) HTTP timeout in seconds (default 30).
--]]
function PollinationsNPC.new(config: {
	secretName: string,
	persona: string,
	model: string?,
	temperature: number?,
	historySize: number?,
	timeout: number?,
}): typeof(setmetatable({}, PollinationsNPC))
	assert(config ~= nil, "config table is required")
	assert(config.secretName ~= nil, "secretName is required (Cloud Secrets name)")
	assert(config.persona ~= nil, "persona is required")

	local self = setmetatable({}, PollinationsNPC)
	self.secretName = config.secretName
	self.persona = config.persona
	self.model = config.model or DEFAULT_MODEL
	self.temperature = config.temperature or 0.8
	self.historySize = config.historySize or DEFAULT_HISTORY_SIZE
	self.timeout = config.timeout or DEFAULT_TIMEOUT
	self.history = {} -- [userId] = { { role = "user", content = string }, ... }
	self.inFlight = {} -- [userId] = boolean, prevents overlapping requests
	return self
end

-- Returns the Secret value from Roblox Cloud Secrets (server only).
function PollinationsNPC:getSecret()
	local ok, secret = pcall(function()
		return HttpService:GetSecret(self.secretName)
	end)
	if not ok then
		error(("PollinationsNPC: could not read secret %q (%s)"):format(self.secretName, tostring(secret)), 0)
	end
	return secret
end

function PollinationsNPC:appendMessage(userId: number, role: string, content: string)
	local history = self.history[userId] or {}
	table.insert(history, { role = role, content = content })
	-- Trim the oldest turns to keep the request small and the conversation coherent.
	while #history > self.historySize do
		table.remove(history, 1)
	end
	self.history[userId] = history
end

--[[
	Have the NPC respond to a player's message.

	Parameters:
		player  (Player) The speaking player.
		message (string) What the player said.
		onReply (function?) Called with the NPC's reply string on success.
		onError (function?) Called with an error message on failure.

	Returns true when a request was started, false when one is already in
	flight for this player (the module never overlaps requests per player).
--]]
function PollinationsNPC:Respond(player: Player, message: string, onReply: ((string) -> ())?, onError: ((string) -> ())?)
	assert(typeof(player) == "Instance" and player:IsA("Player"), "player must be a Player")
	assert(type(message) == "string" and message ~= "", "message must be a non-empty string")

	local userId = player.UserId
	if self.inFlight[userId] then
		return false
	end
	self.inFlight[userId] = true

	self:appendMessage(userId, "user", message)

	-- Build the chat completion request. The API key never leaves the header;
	-- Roblox Secret values may only be used in URLs or headers, never the body.
	local secret = self:getSecret()
	local messages = { { role = "system", content = self.persona } }
	for _, entry in ipairs(self.history[userId]) do
		table.insert(messages, entry)
	end

	local body = {
		model = self.model,
		messages = messages,
		temperature = self.temperature,
		max_tokens = MAX_OUTPUT_TOKENS,
	}

	-- Asynchronous fire-and-forget so the server never blocks on the network.
	task.spawn(function()
		local ok, result = pcall(function()
			local response = HttpService:RequestAsync({
				Url = API_URL,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["Authorization"] = secret:AddPrefix("Bearer "),
				},
				Body = HttpService:JSONEncode(body),
				Timeout = self.timeout,
			})
			return response
		end)

		local reply: string?
		if ok and result.Success and result.StatusCode >= 200 and result.StatusCode < 300 then
			local decoded = HttpService:JSONDecode(result.Body)
			local choice = decoded and decoded.choices and decoded.choices[1]
			if choice and choice.message and choice.message.content then
				reply = choice.message.content
			end
		end

		if reply then
			self:appendMessage(userId, "assistant", reply)
			if onReply then
				task.spawn(onReply, reply)
			end
		else
			local reason = if ok then ("HTTP %d"):format(result.StatusCode) else tostring(result)
			if onError then
				task.spawn(onError, ("Pollinations request failed (%s)"):format(reason))
			end
		end

		self.inFlight[userId] = false
	end)

	return true
end

-- Clears the conversation history for a player (e.g. on leave).
function PollinationsNPC:Reset(player: Player)
	self.history[player.UserId] = nil
	self.inFlight[player.UserId] = nil
end

return PollinationsNPC
