# pollinations.ai

A themeable frontend for pollinations.ai with a built-in theme creator.

## Quick Start

```bash
npm install
npm run dev
```

## Theme System Architecture

A single text prompt (the **"vibe"**) drives the entire theme generation through 3 AI agents:

```
                            ┌─────────────────┐
                            │   Your Vibe     │
                            │   "bioluminescent deep sea"
                            └────────┬────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
            ┌───────────┐    ┌───────────┐    ┌───────────┐
            │ Designer  │    │ Animator  │    │ Copywriter│
            │           │    │           │    │           │
            │ Colors    │    │ WebGL     │    │ UI Text   │
            │ Fonts     │    │ Background│    │ Tone      │
            │ Spacing   │    │ (Three.js)│    │ Voice     │
            └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
                  │                │                │
                  ▼                ▼                ▼
            ┌─────────────────────────────────────────────┐
            │              Complete Theme                 │
            │  CSS Variables + Background + Styled Copy   │
            └─────────────────────────────────────────────┘
```

### Execution Modes

| Mode         | Key Type            | Execution                 | Use Case          |
| ------------ | ------------------- | ------------------------- | ----------------- |
| **Backend**  | Secret key (`.env`) | All 3 calls in parallel   | Local development |
| **Frontend** | Publishable key     | Sequential with 3s delays | Production        |

### The 3 AI Agents

| Agent          | Purpose                           | Output                                     |
| -------------- | --------------------------------- | ------------------------------------------ |
| **Designer**   | Generates design tokens from vibe | Colors, fonts, borders, opacity            |
| **Animator**   | Creates WebGL background scene    | Self-contained HTML with Three.js          |
| **Copywriter** | Rewrites UI text to match vibe    | Themed copy (same meaning, different tone) |

### Not Yet in Pipeline

**Supporter Logos** (Community page) — Currently use a static prompt defined in `community.ts`, not the theme vibe. This avoids regenerating ~12 images on every theme test. The `illustrator.ts` pipeline exists but is not yet connected.

---

## File Structure

```
src/theme/
├── guidelines/          # 🎯 AI PROMPTS (edit these to experiment!)
│   ├── designer.ts      #    → STYLING_GUIDELINES (colors, fonts, tokens)
│   ├── animator.ts      #    → BACKGROUND_GUIDELINES (WebGL scene)
│   ├── copywriter.ts    #    → WRITING_GUIDELINES (text transformation)
│   ├── illustrator.ts   #    → DRAWING_GUIDELINES (not used yet — future: logos)
│   └── helpers/         #    Processing logic (parse responses, etc.)
│
├── buildPrompts.ts      # Assembles: guidelines + vibe → final prompt
│
├── style/
│   ├── theme-processor.ts    # LLM response → CSS variables
│   ├── design-tokens.ts      # Token definitions (what the AI can set)
│   └── semantic-ids.types.ts # Type-safe token IDs
│
├── copy/                # Default UI text for each page
│   ├── hello.ts, docs.ts, play.ts, ...
│
└── presets/             # Saved themes (auto-discovered)
    ├── bioluminescent-deep-sea-...ts
    └── bioluminescent-mycelium-...ts
```

---

## Experimenting with Prompts

The prompt files in `guidelines/` are pure text templates. To experiment:

1. **`designer.ts`** — Change how colors/fonts are chosen (mood classification, palette rules)
2. **`animator.ts`** — Modify the WebGL scene style (particle counts, motion rules, visual patterns)
3. **`copywriter.ts`** — Adjust how text is rewritten (tone rules, vocabulary constraints)

### Example: Designer Prompt Structure

```
STYLING_GUIDELINES
├── Input: VIBE (e.g., "luminous mycelium network")
├── Mood classification (symbiotic, bioluminescent, ethereal, ...)
├── Color palette rules (bioluminescent teals, pollen yellows, ...)
├── Typography guidelines (organic yet modern fonts)
├── Output: JSON with exact token schema
└── Hard constraints (valid hex, no extra fields)
```

### How Prompts Are Assembled

```typescript
// buildPrompts.ts
assembleStylePrompt(themeDescription) →
  STYLING_GUIDELINES + "\n\nTheme Description:\n" + themeDescription
```

The assembled prompt is sent to the AI, and the response is processed by `theme-processor.ts` into CSS variables.
