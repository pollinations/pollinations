# Reducing cost with a fine-tuned NPC model

The base SDK (`PollinationsNPC.lua`) works with any model on `gen.pollinations.ai`, but a general-purpose model needs a fairly long system prompt (persona + JSON-response instructions) on every request, which costs tokens on every single NPC line. This guide covers collecting your own game's conversation data and using it to fine-tune (or otherwise specialize) a smaller model that needs a much shorter prompt, cutting cost per conversation.

Pollinations itself doesn't host training/fine-tuning — it's a router to model providers. This guide fine-tunes externally, then registers the result as a callable model on Pollinations.

## 1. Collect conversation data (opt-in, your own data only)

Pass `onExchange` when creating your NPC. It fires after every exchange with `{playerMessage, say, action}` — nothing is collected unless you set this.

```lua
local npc = PollinationsNPC.new({
	apiKey = "YOUR_KEY",
	persona = "You are Grix, a blacksmith.",
	onExchange = function(record)
		-- POST it to a small local HTTP server you run while testing,
		-- or accumulate in a DataStore for later export.
		HttpService:RequestAsync({
			Url = "http://localhost:8787/log",
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = HttpService:JSONEncode(record),
		})
	end,
})
```

Only log conversations with players who know their session is being recorded for this purpose (e.g. a test build with your friends, not live production traffic without consent) — see Pollinations' own [privacy policy](../../pollinations.ai/public/legal/PRIVACY_POLICY.md) for the standard this SDK follows.

Have your local receiver append each record as one line of JSON to `raw-logs.jsonl`.

## 2. Format it for fine-tuning

```bash
node tools/prepare-finetune-data.js \
  --in raw-logs.jsonl \
  --out train.jsonl \
  --persona "You are Grix, a blacksmith."
```

This bakes your **short** production persona into every training example (the fine-tuned model learns the personality from the data, so you don't need to repeat the long instructions at inference time) and reshapes each record into `{"messages": [...]}` — the format OpenAI-compatible fine-tuning APIs expect.

## 3. Fine-tune

Use `train.jsonl` with any OpenAI-compatible fine-tuning API (e.g. [OpenAI's fine-tuning API](https://platform.openai.com/docs/guides/fine-tuning) on a small base model, or an open-weight model fine-tuned with LoRA/PEFT on a rented GPU). Aim for a few hundred examples minimum before the results are meaningfully better than the base prompt.

## 4. Register it as a Pollinations model

Once you have a fine-tuned model hosted somewhere with an OpenAI-compatible endpoint, register it as a community model so your SDK can call it exactly like any built-in model — see [`BRING_YOUR_OWN_MODEL.md`](../../BRING_YOUR_OWN_MODEL.md). Then just change:

```lua
local npc = PollinationsNPC.new({
	model = "your-username/npc-mini",
	persona = "You are Grix, a blacksmith.", -- can now be much shorter
})
```

## 5. Benchmark before you switch

```bash
POLLINATIONS_API_KEY=pk_... node tools/benchmark-models.js \
  --prompts prompts.json \
  --models openai,your-username/npc-mini \
  --out report.json
```

This reports average latency and average token usage per model, and writes every reply to `report.json` so you can read the baseline vs. fine-tuned outputs side by side. Roleplay quality and engagement are judged by that manual read-through, not an automated score — record your findings (a short table of "baseline felt X, fine-tuned felt Y") in your PR/issue so the comparison is reproducible for reviewers.

## Recommendation

Don't default the SDK to a fine-tuned model — it's game- and persona-specific. Keep `model = "openai"` as the SDK default, and document this path as an opt-in optimization for developers scaling up.
