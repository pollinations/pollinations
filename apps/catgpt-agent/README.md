# CatGPT Agent

A reusable Pollinations prompt agent that turns your questions into sassy cat comics.

## What it does

CatGPT responds to your questions with a short, sarcastic feline reply drawn into a comic image — just like the original CatGPT webcomic by [@missfitcomics](https://www.instagram.com/tanikagodbole/) (Tanika Godbole).

## How to use

Call the agent through any Pollinations-compatible client:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Marcus-Mok-GH/catgpt",
    "messages": [{"role": "user", "content": "Why do boxes call to me?"}]
  }'
```

Or in Discord bots, chat clients, or any app that supports Pollinations agents.

## Output format

The agent returns a Markdown image link followed by the cat's reply:

```markdown
![CatGPT](https://image.pollinations.ai/...)
Nap through it.
```

## Credit

Based on the original CatGPT concept by Tanika Godbole (@missfitcomics). The reference art and style guide are preserved from [apps/catgpt/](../catgpt/).

## Reward

Submitted for Quest #[14822](https://github.com/PollinationsAI/pollinations/issues/14822).
