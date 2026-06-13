# langchain

[LangChain.js](https://js.langchain.com/) — `@langchain/openai` `ChatOpenAI` repointed at Pollinations.

## Files

- `src/agent.ts` — `ChatOpenAI` + `SystemMessage`/`HumanMessage`. `invoke([...])`.
- `src/web.ts` / `src/discord.ts` — surface adapters.

## What this gives us

- **Familiar API for anyone with LangChain background.** Largest existing community of these frameworks.
- **Easy migration target** for teams already running LangChain agents — just swap `baseURL` and `model`.
- **Chains, retrievers, agents, LangGraph** all sit on top if a bee grows into them.

## What it costs

- Largest cumulative dep tree of any variant.
- LangChain's abstraction tax for a 3-line agent like CatGPT — heavy for what you get.
- For simple single-turn bees, `core/`'s `generateCatReply` is more honest.

## Run locally

```bash
TEXT_POLLINATIONS_TOKEN=... npx tsx src/web.ts
BOT_TOKEN_CATGPT=... TEXT_POLLINATIONS_TOKEN=... npx tsx src/discord.ts
```
