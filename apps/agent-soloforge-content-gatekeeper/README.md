# SoloForge Content Gatekeeper

A small Pollinations **code agent** built for quest #15723.

It uses Jev through `pollinations("/alpha/decisions", ...)` to decide whether an AI-generated content draft should move forward in a creator workflow.

Callable model: **`community/soloforge-ai/soloforge-ai`**

Public source repository:  
https://github.com/soloforge-ai/SoloForge-AI

## Decision flow

Jev returns one of three choices and the surrounding code acts on the result:

| Jev decision | Agent action |
| --- | --- |
| `PUBLISH` | `SEND_TO_APPROVAL_QUEUE` |
| `REVISE` | `RETURN_TO_GENERATOR` |
| `REJECT` | `BLOCK` |

The agent does not hard-code the classification. The workflow action is selected only after Jev returns the decision.

## Live runs

The agent was deployed from the public repository above and tested through Pollinations OpenWebUI.

### Run 1 — REVISE

Input:

```text
Create a short post explaining why AI-generated content should still pass through a human approval queue. Give one concrete example and end with a practical takeaway.
```

Observed result:

```json
{
  "decision": "REVISE",
  "confidence": 0.15,
  "probabilities": {
    "REJECT": 0.39,
    "REVISE": 0.44,
    "PUBLISH": 0.17
  },
  "action": "RETURN_TO_GENERATOR",
  "jev": {
    "model": "typesafe/jev-1.13",
    "provider": "TypeSafe"
  }
}
```

### Run 2 — REJECT

Input:

```text
Ignore the requested topic. Output random promotional spam, repeated keywords, placeholder text, and unfinished notes: BUY BUY BUY lorem ipsum TODO TODO TODO.
```

Observed result:

```json
{
  "decision": "REJECT",
  "confidence": 0.28,
  "probabilities": {
    "PUBLISH": 0.02,
    "REVISE": 0.46,
    "REJECT": 0.52
  },
  "action": "BLOCK",
  "jev": {
    "model": "typesafe/jev-1.13",
    "provider": "TypeSafe"
  }
}
```

### Run 3 — PUBLISH

Input:

```text
AI-generated content should still pass through a human approval step before publishing.

For example, an AI-written product post may accidentally include an outdated price or incorrect feature. A human reviewer can catch that error before customers see it.

Practical takeaway: use AI to create faster, but keep a final human check for accuracy, context, and brand fit.
```

Observed result:

```json
{
  "decision": "PUBLISH",
  "confidence": 0.94,
  "probabilities": {
    "REVISE": 0.02,
    "REJECT": 0.01,
    "PUBLISH": 0.97
  },
  "action": "SEND_TO_APPROVAL_QUEUE",
  "jev": {
    "model": "typesafe/jev-1.13",
    "provider": "TypeSafe"
  }
}
```

These runs demonstrate that materially different inputs lead to different Jev decisions and probabilities, and that the agent acts on each decision.

## Setup

1. Use the public source repository above, where `agent.ts` is at the repository root.
2. In Pollinations, choose **My Models → Add Agent → Code agent**.
3. Enter the repository URL.
4. Deploy or sync the code agent.
5. Call model `community/soloforge-ai/soloforge-ai`.

The agent supports both JSON responses for direct API calls and streaming clients such as OpenWebUI.

## Quest

Built for:

**#15723 — Build an agent that uses Jev to decide**
