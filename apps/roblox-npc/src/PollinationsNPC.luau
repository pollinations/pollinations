-- Pollinations NPC dialogue for Roblox. Server-side ModuleScript: put it in
-- ServerScriptService. Docs: apps/roblox-npc/README.md in
-- https://github.com/pollinations/pollinations

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextService = game:GetService("TextService")

local API_URL = "https://gen.pollinations.ai/v1/chat/completions"
local REMOTE_NAME = "PollinationsNPCSpeech"

-- Logged on the server so the developer knows what to fix; players only see
-- the NPC's fallback line.
local HTTP_HINTS = {
	[401] = "invalid API key, check the secret's value",
	[402] = "out of Pollen or the key's budget is used up, see https://enter.pollinations.ai",
	[403] = "this key cannot use the model, pick another from https://gen.pollinations.ai/text/models",
	[429] = "rate limited, players are talking faster than the key allows",
}

local PollinationsNPC = {}

-- options: name, persona (required); model, secretName, maxTurns, maxTokens,
-- range and fallback (optional, see README).
function PollinationsNPC.new(options)
	assert(type(options.name) == "string", "options.name is required")
	assert(type(options.persona) == "string", "options.persona is required")

	local npc = {
		name = options.name,
		model = options.model or "amazon/nova-micro-v1",
		secretName = options.secretName or "POLLINATIONS_API_KEY",
		maxTurns = options.maxTurns or 6,
		maxTokens = options.maxTokens or 150,
		range = options.range or 15,
		fallback = options.fallback or "Hmm, give me a moment to think...",
	}
	local system = string.format(
		"You are %s, a character in a Roblox game. %s Stay in character, never say you are an AI, "
			.. "and answer in one or two short sentences of plain text that suit all ages.",
		npc.name,
		options.persona
	)
	local histories = {} -- [UserId] = recent user/assistant messages
	local busy = {} -- [UserId] = true while that player's request is in flight

	-- Sends `message` from `player` and returns the NPC's filtered reply, or
	-- nil and an error. Yields. A player's messages sent while their previous
	-- one is still being answered return nil, "busy".
	function npc.reply(player, message)
		local userId = player.UserId
		if busy[userId] then
			return nil, "busy"
		end

		local found, secret = pcall(HttpService.GetSecret, HttpService, npc.secretName)
		if not found then
			return nil,
				string.format(
					"secret %q not found, add it in Creator Dashboard > Secrets "
						.. "(Studio playtests: File > Experience Settings > Security > Local Secrets)",
					npc.secretName
				)
		end

		local history = histories[userId] or {}
		local messages = { { role = "system", content = system } }
		table.move(history, 1, #history, 2, messages)
		table.insert(messages, { role = "user", content = message })

		busy[userId] = true
		local sent, response = pcall(HttpService.RequestAsync, HttpService, {
			Url = API_URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				Authorization = secret:AddPrefix("Bearer "),
			},
			Body = HttpService:JSONEncode({
				model = npc.model,
				messages = messages,
				max_tokens = npc.maxTokens,
			}),
		})
		busy[userId] = nil

		if not sent then
			return nil, "request failed (is Allow HTTP Requests on?): " .. tostring(response)
		end
		if not response.Success then
			return nil,
				string.format(
					"HTTP %d: %s",
					response.StatusCode,
					HTTP_HINTS[response.StatusCode] or response.Body:sub(1, 200)
				)
		end
		local decoded, data = pcall(HttpService.JSONDecode, HttpService, response.Body)
		local choice = decoded and type(data) == "table" and data.choices and data.choices[1]
		local text = choice and choice.message and choice.message.content
		if type(text) ~= "string" or not text:find("%S") then
			return nil, "empty reply from " .. npc.model
		end
		text = text:match("^%s*(.-)%s*$")

		table.insert(history, { role = "user", content = message })
		table.insert(history, { role = "assistant", content = text })
		while #history > npc.maxTurns * 2 do
			table.remove(history, 1)
		end
		histories[userId] = history

		-- Generated text is shown to players, so it goes through Roblox's filter.
		local filtered, result = pcall(function()
			return TextService:FilterStringAsync(text, userId):GetNonChatStringForBroadcastAsync()
		end)
		if not filtered then
			return nil, "text filter failed: " .. tostring(result)
		end
		return result
	end

	function npc.forget(player)
		histories[player.UserId] = nil
	end

	return npc
end

local function speechRemote()
	local remote = ReplicatedStorage:FindFirstChild(REMOTE_NAME)
	if not remote then
		remote = Instance.new("RemoteEvent")
		remote.Name = REMOTE_NAME
		remote.Parent = ReplicatedStorage
	end
	return remote
end

-- Makes `model` answer players who chat within `range` studs of it. Replies
-- appear as a chat bubble and a chat line via PollinationsNPCChat.client.luau.
function PollinationsNPC.attach(model, options)
	local npc = PollinationsNPC.new(options)
	local anchor = model.PrimaryPart or model:FindFirstChild("Head") or model:FindFirstChildWhichIsA("BasePart")
	assert(anchor, "the NPC model needs a part to speak from")
	local remote = speechRemote()

	local function inRange(player)
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		return root ~= nil and (root.Position - anchor.Position).Magnitude <= npc.range
	end

	local function onChatted(player, message)
		if message:sub(1, 1) == "/" or not inRange(player) then
			return
		end
		local reply, err = npc.reply(player, message)
		if err == "busy" then
			return
		end
		if not reply then
			warn(string.format("[PollinationsNPC] %s: %s", npc.name, err))
			reply = npc.fallback
		end
		remote:FireAllClients(anchor, npc.name, reply)
	end

	local function watch(player)
		player.Chatted:Connect(function(message)
			onChatted(player, message)
		end)
	end
	for _, player in Players:GetPlayers() do
		watch(player)
	end
	Players.PlayerAdded:Connect(watch)
	Players.PlayerRemoving:Connect(npc.forget)
	return npc
end

return PollinationsNPC
