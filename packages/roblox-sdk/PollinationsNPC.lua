local HttpService = game:GetService("HttpService")

local PollinationsNPC = {}
PollinationsNPC.__index = PollinationsNPC

local API_URL = "https://gen.pollinations.ai/v1/chat/completions"

-- Appended to every persona so the model replies in a parseable shape.
local ACTION_INSTRUCTIONS = [[

Respond ONLY with compact JSON: {"say": "<what you say out loud>", "action": {"type": "<action_name>", ...}}.
Omit "action" when you are not taking one. Never include text outside the JSON object.]]

function PollinationsNPC.new(config)
	config = config or {}
	local self = setmetatable({}, PollinationsNPC)
	self.apiKey = config.apiKey
	self.model = config.model or "openai"
	self.persona = (config.persona or "You are a friendly NPC in a video game.") .. ACTION_INSTRUCTIONS
	self.history = { { role = "system", content = self.persona } }
	self.maxHistory = config.maxHistory or 10
	self.fallbackReply = config.fallbackReply or "Hmm, I didn't catch that. Try again?"
	self.actions = {}
	-- Optional: function(record) called after every exchange, for developers
	-- who want to log conversations (e.g. to prep fine-tuning data). Off by
	-- default — nothing is collected unless you set this yourself.
	self.onExchange = config.onExchange
	return self
end

-- Register a callback for an action `type` the model can trigger.
-- callback receives (player, action) where `action` is the full
-- { type = ..., ...extra fields the model included } table.
function PollinationsNPC:RegisterAction(actionType, callback)
	self.actions[actionType] = callback
end

-- Parses a raw model reply into (say, action). Falls back to treating the
-- whole reply as dialogue if it isn't valid JSON, so a malformed response
-- never breaks the conversation.
function PollinationsNPC:_ParseReply(raw)
	local ok, parsed = pcall(function()
		return HttpService:JSONDecode(raw)
	end)

	if ok and type(parsed) == "table" and parsed.say then
		return parsed.say, parsed.action
	end

	return raw, nil
end

function PollinationsNPC:Say(playerMessage, player)
	table.insert(self.history, { role = "user", content = playerMessage })

	local body = HttpService:JSONEncode({
		model = self.model,
		messages = self.history,
		response_format = { type = "json_object" },
	})

	local headers = { ["Content-Type"] = "application/json" }
	if self.apiKey then
		headers["Authorization"] = "Bearer " .. self.apiKey
	end

	local ok, result = pcall(function()
		return HttpService:RequestAsync({
			Url = API_URL,
			Method = "POST",
			Headers = headers,
			Body = body,
		})
	end)

	if not ok or not result.Success then
		warn("[PollinationsNPC] request failed: " .. tostring(not ok and result or result.StatusMessage))
		return self.fallbackReply
	end

	local decodedOk, decoded = pcall(function()
		return HttpService:JSONDecode(result.Body)
	end)

	if not decodedOk or not decoded.choices or not decoded.choices[1] then
		warn("[PollinationsNPC] unexpected response body")
		return self.fallbackReply
	end

	local raw = decoded.choices[1].message.content
	local say, action = self:_ParseReply(raw)

	table.insert(self.history, { role = "assistant", content = say })

	-- trim history, always keep the system prompt at index 1
	while #self.history > self.maxHistory + 1 do
		table.remove(self.history, 2)
	end

	if action and action.type then
		local handler = self.actions[action.type]
		if handler then
			local actionOk, actionErr = pcall(handler, player, action)
			if not actionOk then
				warn("[PollinationsNPC] action '" .. action.type .. "' errored: " .. tostring(actionErr))
			end
		else
			warn("[PollinationsNPC] no handler registered for action type '" .. action.type .. "'")
		end
	end

	if self.onExchange then
		pcall(self.onExchange, {
			playerMessage = playerMessage,
			say = say,
			action = action,
		})
	end

	return say
end

return PollinationsNPC