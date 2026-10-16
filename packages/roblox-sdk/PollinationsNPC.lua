local HttpService = game:GetService("HttpService")

local PollinationsNPC = {}
PollinationsNPC.__index = PollinationsNPC

local API_URL = "https://gen.pollinations.ai/v1/chat/completions"

function PollinationsNPC.new(config)
	config = config or {}
	local self = setmetatable({}, PollinationsNPC)
	self.apiKey = config.apiKey
	self.model = config.model or "openai"
	self.persona = config.persona or "You are a friendly NPC in a video game."
	self.history = { { role = "system", content = self.persona } }
	self.maxHistory = config.maxHistory or 10
	self.fallbackReply = config.fallbackReply or "Hmm, I didn't catch that. Try again?"
	return self
end

function PollinationsNPC:Say(playerMessage)
	table.insert(self.history, { role = "user", content = playerMessage })

	local body = HttpService:JSONEncode({
		model = self.model,
		messages = self.history,
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

	local reply = decoded.choices[1].message.content
	table.insert(self.history, { role = "assistant", content = reply })

	-- trim history, always keep the system prompt at index 1
	while #self.history > self.maxHistory + 1 do
		table.remove(self.history, 2)
	end

	return reply
end

return PollinationsNPC