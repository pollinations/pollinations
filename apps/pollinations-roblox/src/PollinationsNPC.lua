--[[ PollinationsNPC.lua
   Luau ModuleScript for NPC dialogue powered by Pollinations AI text models.
   Place in: ServerScriptService → Modules → PollinationsNPC
  
   Usage:
       local PollinationsNPC = require(game.ServerScriptService.Modules.PollinationsNPC)
       local npc = PollinationsNPC.new({
           model = "openai/gpt-5.4-nano",
           systemPrompt = "You are a wise old wizard.",
           apiKey = game:GetService("ServerStorage"):GetSecret("POLLINATIONS_API_KEY"),
       })
       local reply = npc:AskPlayer("What is the meaning of life?")
       print(reply)
  ]]

local HttpService = game:GetService("HttpService")

local PollinationsNPC = {}
PollinationsNPC.__index = PollinationsNPC

-- Base URL for Pollinations generation API
local BASE_URL = "https://gen.pollinations.ai"
local TEXT_MODELS_URL = BASE_URL .. "/text/models"
local CHAT_URL = BASE_URL .. "/v1/chat/completions"

-- Default configuration
PollinationsNPC.DEFAULT_CONFIG = {
	model = "openai/gpt-5.4-nano",
	systemPrompt = "You are a helpful NPC in a Roblox game.",
	temperature = 0.7,
	maxTokens = 256,
	apiKey = "",  -- Set via Roblox Secrets or pass directly
}

function PollinationsNPC.new(config)
	config = config or {}
	local self = setmetatable({}, PollinationsNPC)
	self.config = {}
	for k, v in pairs(PollinationsNPC.DEFAULT_CONFIG) do
		self.config[k] = v
	end
	for k, v in pairs(config) do
		self.config[k] = v
	end

	-- Validate API key
	if self.config.apiKey == "" or self.config.apiKey == nil then
		warn("[PollinationsNPC] No API key set. Set it via Roblox Secrets or pass directly. " ..
			"Get one at https://enter.pollinations.ai/keys")
	end

	return self
end

-- Fetch the list of available text models
function PollinationsNPC:GetTextModels()
	if not self:_hasValidKey() then
		return nil, "No API key configured"
	end

	local success, result = pcall(function()
		return HttpService:GetAsync(TEXT_MODELS_URL, {
			headers = self:_getHeaders(),
		})
	end)

	if not success then
		return nil, "HTTP fetch failed: " .. tostring(result)
	end

	local decoded
	success, decoded = pcall(function()
		return HttpService:JSONDecode(result)
	end)

	if not success then
		return nil, "JSON decode failed: " .. tostring(decoded)
	end

	return decoded
end

-- Generate text from a prompt using the chat completions endpoint
function PollinationsNPC:GenerateText(prompt, model)
	model = model or self.config.model

	if not self:_hasValidKey() then
		-- Fallback: use ?key= query parameter on text.pollinations.ai
		local fallbackUrl = "https://text.pollinations.ai/" .. self:_urlEncode(prompt)
			.. "?model=" .. model
		fallbackUrl = self:_appendKey(fallbackUrl)

		local success, result = pcall(function()
			return HttpService:GetAsync(fallbackUrl, {
				headers = {
					["User-Agent"] = "roblox-pollinations-npc/1.0"
				}
			})
		end)

		if success then
			return result
		else
			return nil, "Fallback text generation failed: " .. tostring(result)
		end
	end

	local payload = {
		model = model,
		messages = {
			{ role = "system", content = self.config.systemPrompt },
			{ role = "user", content = prompt }
		},
		max_tokens = self.config.maxTokens,
		temperature = self.config.temperature,
	}

	local jsonBody = HttpService:JSONEncode(payload)

	local success, result = pcall(function()
		return HttpService:PostAsync(
			CHAT_URL,
			jsonBody,
			Enum.HttpContentType.ApplicationJson,
			false,
			false,
			self:_getHeaders()
		)
	end)

	if not success then
		return nil, "Chat generation failed: " .. tostring(result)
	end

	local decoded
	success, decoded = pcall(function()
		return HttpService:JSONDecode(result)
	end)

	if not success then
		return nil, "JSON decode failed: " .. tostring(decoded)
	end

	if decoded.error then
		return nil, "API error: " .. tostring(decoded.error.message)
	end

	if decoded.choices and #decoded.choices > 0 then
		return decoded.choices[1].message.content
	end

	return nil, "No content in response"
end

-- Ask the NPC a question and get a persona-appropriate reply
function PollinationsNPC:AskPlayer(question)
	local prompt = string.format(
		"A player in a Roblox game asks: '%s' — respond as %s. Keep it brief, natural, and in-character. Do not break character.",
		question,
		string.sub(self.config.systemPrompt, 1, 100)  -- use start of system prompt as persona description
	)

	local reply, err = self:GenerateText(prompt)
	if err then
		return "I'm temporarily unable to speak. Please try again later.", err
	end

	return reply
end

-- Get a random greeting from the NPC
function PollinationsNPC:GetGreeting()
	local greetings = {
		"Hello, traveler!",
		"Greetings, adventurer!",
		"What brings you here?",
		"I've been expecting you...",
		"The winds carry your name.",
	}
	return greetings[math.random(1, #greetings)]
end

-- Set the NPC's persona (system prompt)
function PollinationsNPC:SetPersona(persona)
	self.config.systemPrompt = persona
end

-- Utility: check if API key is valid
function PollinationsNPC:_hasValidKey()
	return self.config.apiKey and self.config.apiKey ~= "" and string.sub(self.config.apiKey, 1, 3) == "sk_"
end

-- Utility: get HTTP headers for authenticated requests
function PollinationsNPC:_getHeaders()
	local headers = {
		["Content-Type"] = "application/json",
	}
	if self:_hasValidKey() then
		headers["Authorization"] = "Bearer " .. self.config.apiKey
	end
	return headers
end

-- Utility: append key as query param (fallback auth)
function PollinationsNPC:_appendKey(url)
	if self.config.apiKey and self.config.apiKey ~= "" then
		url = url .. "&key=" .. self:_urlEncode(self.config.apiKey)
	end
	return url
end

-- Utility: URL-encode a string for use in URLs
function PollinationsNPC:_urlEncode(str)
	return HttpService:GenerateGUID(false):sub(1, 0) -- placeholder
		.. tostring(str):gsub("([^%w%.%-_])", function(c)
			return string.format("%%%02X", string.byte(c))
		end)
end

return PollinationsNPC
