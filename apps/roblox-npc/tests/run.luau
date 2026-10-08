-- Runs src/PollinationsNPC.luau under Lune with stand-ins for the Roblox
-- services it uses, so the request, history, error and chat wiring can be
-- checked outside Studio.
--   lune run tests/run.luau                       (offline)
--   POLLINATIONS_API_KEY=sk_... lune run tests/run.luau   (+ live API calls)

local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")

local function signal()
	local handlers = {}
	return {
		Connect = function(_, fn)
			table.insert(handlers, fn)
		end,
		fire = function(...)
			for _, fn in handlers do
				fn(...)
			end
		end,
	}
end

-- Secrets can't be read by scripts; only AddPrefix/AddSuffix and the HTTP
-- layer see the value. `reveal` plays the part of the HTTP layer.
local secretValues = setmetatable({}, { __mode = "k" })
local function makeSecret(value)
	local secret = {}
	secretValues[secret] = value
	function secret.AddPrefix(_, prefix)
		return makeSecret(prefix .. value)
	end
	return setmetatable(secret, {
		__tostring = function()
			return "Secret"
		end,
	})
end
local function reveal(header)
	return secretValues[header] or header
end

local secrets = {}
local requests = {}
local respond -- function(request) -> Roblox-style response; set per test
local filterCalls = 0

local HttpService = {
	GetSecret = function(_, name)
		assert(secrets[name], "Can't find secret with given key")
		return makeSecret(secrets[name])
	end,
	RequestAsync = function(_, request)
		local headers = {}
		for k, v in request.Headers do
			headers[k] = reveal(v)
		end
		local seen =
			{ Url = request.Url, Method = request.Method, Headers = headers, Body = serde.decode("json", request.Body) }
		table.insert(requests, seen)
		return respond(seen, request)
	end,
	JSONEncode = function(_, value)
		return serde.encode("json", value)
	end,
	JSONDecode = function(_, text)
		return serde.decode("json", text)
	end,
}

local TextService = {
	FilterStringAsync = function(_, text, userId)
		assert(type(userId) == "number")
		filterCalls += 1
		return {
			GetNonChatStringForBroadcastAsync = function()
				return (text:gsub("darn", "####"))
			end,
		}
	end,
}

local Players = { list = {}, PlayerAdded = signal(), PlayerRemoving = signal() }
function Players.GetPlayers(self)
	return self.list
end

local fired = {}
local ReplicatedStorage = { children = {} }
function ReplicatedStorage.FindFirstChild(self, name)
	return self.children[name]
end

Instance = {
	new = function(className)
		assert(className == "RemoteEvent")
		return setmetatable({
			FireAllClients = function(_, ...)
				table.insert(fired, { ... })
			end,
		}, {
			__newindex = function(remote, key, value)
				rawset(remote, key, value)
				if key == "Parent" then
					value.children[remote.Name] = remote
				end
			end,
		})
	end,
}
local services = {
	HttpService = HttpService,
	Players = Players,
	ReplicatedStorage = ReplicatedStorage,
	TextService = TextService,
}
game = {
	GetService = function(_, name)
		return assert(services[name], name)
	end,
}
local warnings = {}
warn = function(message)
	table.insert(warnings, message)
end

local PollinationsNPC = require("../src/PollinationsNPC")

local function player(userId, position)
	return {
		UserId = userId,
		Character = {
			FindFirstChild = function()
				return { Position = position }
			end,
		},
		Chatted = signal(),
	}
end

local function vector(x, y, z)
	return setmetatable({ x = x, y = y, z = z }, {
		__sub = function(a, b)
			return vector(a.x - b.x, a.y - b.y, a.z - b.z)
		end,
		__index = function(v, key)
			if key == "Magnitude" then
				return math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
			end
		end,
	})
end

local function ok(content)
	return function()
		return {
			Success = true,
			StatusCode = 200,
			Body = serde.encode("json", { choices = { { message = { content = content } } } }),
		}
	end
end

local function status(code, body)
	return function()
		return { Success = false, StatusCode = code, Body = body or "" }
	end
end

local passed, failed = 0, 0
local function test(name, fn)
	requests, fired, warnings, filterCalls = {}, {}, {}, 0
	secrets = { POLLINATIONS_API_KEY = "sk_test" }
	respond = ok("Ahoy!")
	local success, err = pcall(fn)
	if success then
		passed += 1
		print("ok   " .. name)
	else
		failed += 1
		print("FAIL " .. name .. "\n     " .. tostring(err))
	end
end

local function eq(actual, expected, label)
	if actual ~= expected then
		error(string.format("%s: expected %s, got %s", label or "value", tostring(expected), tostring(actual)), 2)
	end
end

test("sends the persona, the message and the model with a Bearer secret", function()
	local npc = PollinationsNPC.new({ name = "Tomo", persona = "You keep the lighthouse." })
	local reply = npc.reply(player(1), "Hi there")
	eq(reply, "Ahoy!", "reply")
	local r = requests[1]
	eq(r.Url, "https://gen.pollinations.ai/v1/chat/completions", "url")
	eq(r.Method, "POST", "method")
	eq(r.Headers.Authorization, "Bearer sk_test", "authorization")
	eq(r.Headers["Content-Type"], "application/json", "content type")
	eq(r.Body.model, "amazon/nova-micro-v1", "default model")
	eq(r.Body.max_tokens, 150, "max_tokens")
	eq(#r.Body.messages, 2, "messages")
	eq(r.Body.messages[1].role, "system", "system role")
	assert(r.Body.messages[1].content:find("You are Tomo", 1, true), "system names the NPC")
	assert(r.Body.messages[1].content:find("You keep the lighthouse.", 1, true), "system has the persona")
	eq(r.Body.messages[2].content, "Hi there", "user message")
end)

test("uses the configured model, secret name and token limit", function()
	secrets = { MY_KEY = "sk_other" }
	local npc = PollinationsNPC.new({
		name = "A",
		persona = "B",
		model = "openai/gpt-5.4-nano",
		secretName = "MY_KEY",
		maxTokens = 40,
	})
	npc.reply(player(1), "x")
	eq(requests[1].Body.model, "openai/gpt-5.4-nano", "model")
	eq(requests[1].Body.max_tokens, 40, "max_tokens")
	eq(requests[1].Headers.Authorization, "Bearer sk_other", "authorization")
end)

test("remembers each player's conversation separately and trims old turns", function()
	local npc = PollinationsNPC.new({ name = "A", persona = "B", maxTurns = 2 })
	local alice, bob = player(1), player(2)
	for i = 1, 3 do
		respond = ok("answer " .. i)
		npc.reply(alice, "question " .. i)
	end
	local last = requests[3].Body.messages
	eq(#last, 6, "system + 2 turns + new message")
	eq(last[2].content, "question 1", "oldest kept turn")
	eq(last[3].content, "answer 1", "oldest kept answer")

	respond = ok("answer 4")
	npc.reply(alice, "question 4")
	local trimmed = requests[4].Body.messages
	eq(#trimmed, 6, "still capped at maxTurns")
	eq(trimmed[2].content, "question 2", "turn 1 dropped")

	npc.reply(bob, "hello")
	eq(#requests[5].Body.messages, 2, "bob starts fresh")

	npc.forget(alice)
	npc.reply(alice, "again")
	eq(#requests[6].Body.messages, 2, "forget clears history")
end)

test("filters the reply before returning it", function()
	respond = ok("  well darn it  ")
	local npc = PollinationsNPC.new({ name = "A", persona = "B" })
	eq(npc.reply(player(1), "x"), "well #### it", "filtered and trimmed")
	eq(filterCalls, 1, "filter calls")
end)

test("explains HTTP errors and keeps them out of the history", function()
	local npc = PollinationsNPC.new({ name = "A", persona = "B" })
	for code, hint in
		{ [401] = "invalid API key", [402] = "out of Pollen", [403] = "cannot use the model", [429] = "rate limited" }
	do
		respond = status(code)
		local reply, err = npc.reply(player(1), "x")
		eq(reply, nil, "reply on " .. code)
		assert(err:find("HTTP " .. code, 1, true) and err:find(hint, 1, true), err)
	end
	respond = status(500, "upstream exploded")
	local _, err = npc.reply(player(1), "x")
	assert(err:find("upstream exploded", 1, true), err)
	respond = ok("fine")
	npc.reply(player(1), "y")
	eq(#requests[#requests].Body.messages, 2, "failed turns not remembered")
end)

test("reports a missing secret without sending a request", function()
	secrets = {}
	local npc = PollinationsNPC.new({ name = "A", persona = "B" })
	local reply, err = npc.reply(player(1), "x")
	eq(reply, nil, "reply")
	assert(err:find('secret "POLLINATIONS_API_KEY" not found', 1, true), err)
	eq(#requests, 0, "requests")
end)

test("handles network errors, bad JSON and empty replies", function()
	local npc = PollinationsNPC.new({ name = "A", persona = "B" })
	respond = function()
		error("HttpService is not allowed to access ROBLOX resources")
	end
	local _, err = npc.reply(player(1), "x")
	assert(err:find("Allow HTTP Requests", 1, true), err)
	respond = function()
		return { Success = true, StatusCode = 200, Body = "<html>" }
	end
	_, err = npc.reply(player(1), "x")
	assert(err:find("empty reply", 1, true), err)
	respond = ok("   ")
	_, err = npc.reply(player(1), "x")
	assert(err:find("empty reply", 1, true), err)
	respond = ok(nil)
	_, err = npc.reply(player(1), "x")
	assert(err:find("empty reply", 1, true), err)
end)

test("answers one message per player at a time", function()
	local npc = PollinationsNPC.new({ name = "A", persona = "B" })
	local alice = player(1)
	local nested
	respond = function()
		nested = { npc.reply(alice, "second") }
		return ok("first answer")()
	end
	eq(npc.reply(alice, "first"), "first answer", "first")
	eq(nested[1], nil, "second reply")
	eq(nested[2], "busy", "second error")
	respond = ok("next")
	eq(npc.reply(alice, "third"), "next", "free again")
end)

test("attach answers nearby players in chat and ignores the rest", function()
	local npcModel = { PrimaryPart = { Position = vector(0, 0, 0) } }
	local near, far = player(1, vector(5, 0, 0)), player(2, vector(50, 0, 0))
	Players.list = { near }
	PollinationsNPC.attach(npcModel, { name = "Tomo", persona = "B", range = 10 })
	Players.PlayerAdded.fire(far)

	near.Chatted.fire("hello")
	eq(#fired, 1, "fired once")
	eq(fired[1][1], npcModel.PrimaryPart, "bubble part")
	eq(fired[1][2], "Tomo", "speaker")
	eq(fired[1][3], "Ahoy!", "text")

	far.Chatted.fire("hello?")
	near.Chatted.fire("/e wave")
	eq(#requests, 1, "far players and commands are ignored")

	respond = status(402)
	near.Chatted.fire("still there?")
	eq(fired[2][3], "Hmm, give me a moment to think...", "fallback line")
	assert(warnings[1]:find("Tomo: HTTP 402", 1, true), warnings[1])
	eq(ReplicatedStorage.children.PollinationsNPCSpeech ~= nil, true, "remote created")
end)

local key = process.env.POLLINATIONS_API_KEY
if key and key ~= "" then
	-- Real HTTP for the live checks.
	respond = function(_, request)
		local headers = {}
		for k, v in request.Headers do
			headers[k] = reveal(v)
		end
		local response =
			net.request({ url = request.Url, method = request.Method, headers = headers, body = request.Body })
		return { Success = response.ok, StatusCode = response.statusCode, Body = response.body }
	end
	local live = respond

	test("live: the default model answers in character and remembers the player", function()
		respond = live
		secrets = { POLLINATIONS_API_KEY = key }
		local npc = PollinationsNPC.new({
			name = "Tomo",
			persona = "You keep the lighthouse on Pollen Island.",
			maxTokens = 60,
		})
		local alice = player(1)
		local first, err = npc.reply(alice, "Hi! I lost my red bucket on the beach. What do you do here?")
		assert(first, err)
		print("     Tomo: " .. first)
		local second, err2 = npc.reply(alice, "What colour was the bucket I lost?")
		assert(second, err2)
		print("     Tomo: " .. second)
		eq(#requests[#requests].Body.messages, 4, "second request carries the first turn")
		assert(second:lower():find("red"), "remembers the earlier turn")
	end)

	test("live: a wrong key is reported as 401", function()
		respond = live
		secrets = { POLLINATIONS_API_KEY = "sk_not_a_real_key" }
		local npc = PollinationsNPC.new({ name = "A", persona = "B" })
		local reply, err = npc.reply(player(1), "hi")
		eq(reply, nil, "reply")
		assert(err:find("HTTP 401", 1, true), err)
	end)
else
	print("skip live checks (set POLLINATIONS_API_KEY to run them)")
end

print(string.format("\n%d passed, %d failed", passed, failed))
if failed > 0 then
	process.exit(1)
end
