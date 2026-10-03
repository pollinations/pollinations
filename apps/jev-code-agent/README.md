# Jev Code Agent

> A coding agent where Jev makes the **decisions** via `/alpha/decisions` and other models **write the code** via `/v1/chat/completions`. Pay with your own Pollen.

## What It Does

This web app implements a **code agent loop**:

1. User enters a coding task
2. Agent asks **Jev** (via `POST /alpha/decisions`) — *"What should I do next?"* → explore, plan, code, test, review, or done
3. Agent asks **Jev** — *"Am I confident?"* → yes/no probability
4. If "code" → agent uses **GPT model** (via `/v1/chat/completions`) to generate code
5. If "done" → loop ends
6. Every decision is logged with **probabilities** and **confidence**

### Key Difference from Other Agent PRs

| PR | Approach | This PR (#15911) |
|---|---|---|
| #15916 (jev-agent) | General web agent | **Dual API**: decisions + chat completions |
| #15730 (agent-referee) | TypeScript, tests, CLI | **Browser-based**, zero install |
| #15866 (idea-judge) | Idea evaluation agent | **Coding-focused** action loop |
| #15867 (support-desk) | Support desk agent | **Visual decision trace** with probabilities |

This agent **visualizes every Jev decision** — the action choice with per-option probabilities, the confidence score with a bar, and a step-by-step trace log. Nothing is hidden.

## Try It

👉 **[code-agent.pollinations.ai](https://code-agent.pollinations.ai)**

## Quick Start

1. Go to **[code-agent.pollinations.ai](https://code-agent.pollinations.ai)**
2. Click **Log In** and authorize with your Pollinations account
3. Enter a coding task: *"Create a Python function that validates email addresses"*
4. Click **Start Agent** — watch Jev decide each step
5. Review the decision trace and generated code

## API Usage

### Decisions API (Jev decides actions)

```bash
POST https://gen.pollinations.ai/alpha/decisions
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "jev",
  "state": "Task: Create a Python function that validates email addresses. Step 1: ...",
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "What should the code agent do next?",
      "criteria": {
        "explore": "Explore the relevant codebase or gather context",
        "plan": "Plan the implementation approach",
        "code": "Write or modify the code",
        "test": "Write tests or verify the code works",
        "review": "Review for quality, security, or correctness",
        "done": "The task is complete"
      }
    },
    "confident": {
      "type": "noul",
      "instructions": "How confident are you that the action taken is correct?"
    }
  }
}
```

### Text Generation API (code writing)

```bash
POST https://gen.pollinations.ai/v1/chat/completions
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "openai/gpt-image-1-mini",
  "messages": [
    { "role": "system", "content": "You are a helpful coding agent..." },
    { "role": "user", "content": "Task: Create a Python function..." }
  ],
  "max_tokens": 4000
}
```

## Authentication

```
GET https://enter.pollinations.ai/authorize
  ?app_key=pk_jev_code_agent_v1
  &redirect_url=https://code-agent.pollinations.ai
  &budget=5
  &models=typesafe/jev-1.13,openai/gpt-image-1-mini
  &permissions=profile,usage
```

> **Security**: API keys stored in **volatile browser memory only** — never `localStorage`. Re-authentication required on page reload.

## Agent Actions

| Action | Emoji | Description |
|---|---|---|
| explore | 🔍 | Analyze codebase or task context |
| plan | 📝 | Break down into implementation steps |
| code | ✍️ | Generate code via GPT |
| test | 🧪 | Write or run tests |
| review | 🔍 | Review for quality/security |
| done | ✅ | Task complete |

## Project Structure

```
apps/jev-code-agent/
├── deploy.json       # Cloudflare Pages → code-agent.pollinations.ai
├── index.html        # UI: auth, task input, decision trace, code output
├── script.js         # Agent loop, decision tracing, code generation
├── ai.js             # API utils: /alpha/decisions + /v1/chat/completions
├── styles.css        # Comic-style dark theme with trace log
└── README.md         # This file
```

## Development

```bash
cd apps/jev-code-agent
npx serve .
```

## License

Part of the [Pollinations.AI](https://github.com/pollinations/pollinations) ecosystem.
