# Dynamic Text Generation System

This folder contains the centralized configuration for AI-generated text content.

## Files

### `content.js`

Contains all text prompts (not final text). These are instructions that get sent to the LLM.

### `transforms.js`

Reusable transformation functions that modify how text is generated (tone, language, etc).

### `colors.js`

Color palette and font configuration.

---

## Usage

```jsx
import { TextGenerator } from "../components/TextGenerator";
import { HOME_HERO_TITLE } from "../config/content";
import { rephrase, emojify, noLink } from "../config/transforms";

<TextGenerator
    text={HOME_HERO_TITLE}
    transforms={[rephrase, emojify, noLink]}
    seed={1}
/>;
```

## Seed Strategy

-   Each text element gets a **unique seed number** (1, 2, 3, etc.)
-   Same seed = same output (cached on backend)
-   Generates ~3 variations per language
-   Backend caching handles performance

## Adding New Content

1. Add prompt to `content.js`:

```js
export const NEW_SECTION_TITLE = "Your prompt here";
```

2. Use in component:

```jsx
<TextGenerator text={NEW_SECTION_TITLE} transforms={[rephrase]} seed={99} />
```

## Available Transforms

-   `translate` - Auto-translates to user's browser language
-   `rephrase` - Professional, friendly tone
-   `emojify` - Adds emojis and formatting
-   `responsive` - Shorter text on mobile
-   `noLink` - Removes URLs
-   `keepOriginal` - No modifications
