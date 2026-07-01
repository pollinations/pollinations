# core/

Framework-agnostic CatGPT logic. Three pure modules:

- `prompt.ts` — `CAT_SYSTEM` system prompt + `createImagePrompt(question, reply, hasImage)`
- `reply.ts` — `generateCatReply(question, imageUrl?, opts?)` — calls `gen.pollinations.ai/v1/chat/completions`
- `image.ts` — `buildComicImageUrl(question, reply, imageUrl?, opts?)` and `pickImageModel(apiKey)`

No framework, no DI, no class hierarchy. Each `implementations/<name>/` imports these and adapts them to its runtime/surface idioms.

## Why this lives outside any one variant

CatGPT today (`apps/catgpt/ai.js` + `apps/catgpt-bot/bot.ts`) duplicates these three functions verbatim across web and Discord. The duplication is the symptom we're trying to fix — extracting them once makes the variants below honest comparisons of frameworks rather than re-implementations of the prompt.

## Stable surface

```ts
generateCatReply(question, imageUrl?, { apiKey?, endpoint?, model? })
  → Promise<string>          // 2-8 word cat reply

buildComicImageUrl(question, reply, uploadedImageUrl?, { apiKey?, imageModel?, width?, height?, endpoint? })
  → string                   // direct gen.pollinations.ai/image URL
```

Both accept `apiKey`/`endpoint` overrides so a runtime can route via egress proxy or self-host without forking the core.
