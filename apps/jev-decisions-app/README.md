# Jev Decisions App

> Ask yes/no, multiple choice, or scored questions — get probabilistic answers powered by [Jev](https://typesafe.com/jev) via [Pollinations](https://pollinations.ai). Pay with your own Pollen.

## What It Does

This web app wraps Pollinations' `POST /alpha/decisions` endpoint, which forwards to OpenRouter's Jev model. You give Jev a context (state), ask one or more questions, and get answers with probabilities and confidence scores.

**Three question types supported:**

| Type | Description | Response |
|---|---|---|
| **Yes/No** (`noul`) | "Is this invoice overdue?" | Probability that the proposition is true (0–1) |
| **Choice** | "Which team should handle this?" | Selected option key + per-option probabilities + confidence |
| **Score** | "How urgent is follow-up?" | Position on an ordered scale + legend + per-option probabilities |

## Try It

👉 **[decisions.pollinations.ai](https://decisions.pollinations.ai)**

## Quick Start

### Web App
1. Go to **[decisions.pollinations.ai](https://decisions.pollinations.ai)**
2. Click **Log In** and authorize with your Pollinations account
3. Enter context/facts in the **Context** box
4. Click **＋ Add Question** and pick a question type
5. Click **Ask Jev** — results appear below

### Polli CLI
```bash
npx polli decision "Is my server at risk?" \
  --question "noul: Is the disk full?" \
  --question "choice: What should I do? options=restart,check,delay"
```

## API Usage

```bash
POST https://gen.pollinations.ai/alpha/decisions
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "jev",                    # optional — defaults to jev
  "state": "Invoice issued 2026-08-01, net-30. Today is 2026-09-19.",
  "questions": {
    "overdue": {
      "type": "noul",
      "instructions": "Is this invoice overdue?"
    },
    "action": {
      "type": "choice",
      "instructions": "What is the right next step?",
      "criteria": {
        "wait": "Do nothing",
        "remind": "Send a reminder",
        "escalate": null
      }
    },
    "urgency": {
      "type": "score",
      "instructions": "How urgent is follow-up?",
      "criteria": ["none", "low", "medium", "high"]
    }
  }
}
```

### Response
```json
{
  "id": "dec-abc123",
  "model": "typesafe/jev-1.13",
  "provider": "TypeSafe",
  "answers": {
    "overdue": { "type": "noul", "noul": 0.96 },
    "action": {
      "type": "choice",
      "choice": "remind",
      "probabilities": { "wait": 0.01, "remind": 0.79, "escalate": 0.20 },
      "confidence": 0.69
    },
    "urgency": {
      "type": "score",
      "score": 2.72,
      "legend": { "0": "none", "1": "low", "2": "medium", "3": "high" },
      "probabilities": { "0": 0.1, "1": 0.25, "2": 0.45, "3": 0.2 },
      "confidence": 0.75
    }
  },
  "usage": { "input_tokens": 452, "output_tokens": 73 }
}
```

## Authentication

Sign in with your Pollinations account via OAuth:
```
GET https://enter.pollinations.ai/authorize
  ?app_key=pk_jev_decisions_app_v1
  &redirect_url=https://decisions.pollinations.ai
  &budget=5
  &models=typesafe/jev-1.13
  &permissions=profile,usage
```

> **Security**: API keys are stored in volatile browser memory only — never in `localStorage`. Re-authentication required on page reload.

## Available Models

| Model | Provider | Notes |
|---|---|---|
| `jev` / `typesafe/jev-1.13` | TypeSafe | Default — bills input tokens only |
| `typesafe/jev-1.13-20260917` | TypeSafe | Dated build (pinned by upstream) |

## Project Structure

```
apps/jev-decisions-app/
├── deploy.json       # Cloudflare Pages → decisions.pollinations.ai
├── index.html        # UI: auth, state, question builder, results
├── script.js         # Decision API calls + dynamic UI
├── ai.js             # API config, auth, utilities
├── styles.css        # Comic-style dark theme
├── README.md         # This file
```

## Development

```bash
cd apps/jev-decisions-app
npx serve .
```

## License

Part of the [Pollinations.AI](https://github.com/pollinations/pollinations) ecosystem.
