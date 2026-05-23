# Voice-edit prompting findings

Empirical results from fanning out the same voice transcript across 12 image-edit models on Pollinations. Reports per model family live in `temp/edit-model-research/*.md`; this file consolidates what we learned by *actually running* the prompts.

## TL;DR

1. **The app's current `buildPrompt` wrapper is already solid** — it names the marker, asks the model to remove it, and binds the user's pronouns. The only missing universal rule is the **preserve clause**.
2. **Applied** to `buildPrompt(text, marked, color)` — no marker → no red reference, always appends a preserve clause:
   ```js
   function buildPrompt(text, marked, color) {
     if (!marked) return `${text} Keep everything unrelated unchanged.`;
     return `The ${color} markings indicate the area the prompt is referring to. Prompt: ${text}. Output without ${color} markings. Keep everything unrelated unchanged.`;
   }
   ```
3. **Best model for region edits with the app's prompt**: `kontext`, `klein`, `nanobanana-2`, `seedream`, and `p-image-edit` all handled "add exotic fruits to the marked tree" cleanly. `seedream-pro` and `nanobanana-pro` deliver higher fidelity at 2–4× the cost and latency.
4. **Best universal phrasing for geometric transforms (rotate, flip, etc.)**: the **photographer framing** — *"Same photograph, but the photographer turned their camera 90° clockwise before taking the shot. Everything that was on the top is now on the right side of the frame."*
5. **Do not use diffusion models for deterministic transforms.** No model rotated a clean image reliably. The winner (`p-image-edit` with photographer framing) was the only one that even preserved original pixels. Solve rotation client-side with a canvas; reserve the model for content edits.

## Universal rules (all 7 research reports converged)

1. **Name the marker.** `"the area inside the red circle"` — not `"this"` or `"here"`. Bare pronouns are failure mode #1.
2. **Ask to remove the annotation.** Otherwise the red ring leaks into the output. The app already does this with `Output without {color} markings`.
3. **State what to preserve.** `"Keep face, pose, lighting, background unchanged."` Drift compounds across turns. **This is the rule the current app prompt is missing.**
4. **No model has a native zoom or rotate op.** Both are global transforms; diffusion-edit models regenerate the latent.

## What the app currently sends

From `apps/voice-edit/remix.html:785`:

```js
function buildPrompt(text, marked, color) {
  if (!marked) return text;
  return `The ${color} markings indicate the area the prompt is referring to. Prompt: ${text}. Output without ${color} markings.`;
}
```

Concrete example, edit #1 from the May-22 walkthrough metadata:

> The red markings indicate the area the prompt is referring to. Prompt: Let's zoom in to this part of the image, please. Output without red markings.

This template hits 3 of 4 universal rules — adding `Keep everything else unchanged.` finishes it.

## Per-model behaviour (observed, not theoretical)

Source: PNG metadata from the walkthrough remix downloaded 2026-05-22. Same prompt + same source-with-red-circle → 12 models in parallel.

### Region edit ("add exotic fruits to the marked tree")

| Model | Result | Notes |
|---|---|---|
| **kontext** | ✅ Clean | 7.3s, 614KB. FLUX.1's red-circle attention reads the marker. |
| **klein** | ✅ Clean | 6.2s, ~570KB. FLUX.2 4B — fastest in the FLUX family, edge-fidelity wins. |
| **nanobanana** | ✅ Clean | 9.8s. Gemini Flash; short prompts only. |
| **nanobanana-2** | ✅ Clean | 15s. Better text/detail than nanobanana. |
| **nanobanana-pro** | ✅ Strong, slow | 36s, 1.9MB. Thinking-mode reasons before rendering. Needs chain-of-reasoning rewrite for best results. |
| **gpt-image-2** | ✅ Strong, very slow | 86s, 700KB. Worth the latency for hero shots only. |
| **gptimage-large** | ✅ Clean | 26s. OpenAI documents the red-circle workflow officially for this model. |
| **seedream** | ✅ Clean | 15s, 1MB. BytePlus officially supports drawn markers. |
| **seedream-pro** | ✅ Highest fidelity | 16s, 2.9MB. Best at typography. |
| **qwen-image** | ✅ Clean | 27s. Alibaba documents the red-marker pattern explicitly. |
| **wan-image** | ✅ Clean | 23s. Marker not officially documented but works. |
| **p-image-edit** | ✅ Clean | 6.9s. Pruna — Qwen-Image-Edit lineage. Fastest with the lowest cost. |

All 12 succeeded. The voice-edit app's current shortlist (`p-image-edit, nanobanana, nanobanana-2, kontext, gpt-image-2`) is well-chosen — those are the fast, reliable options.

### "Zoom in to this part" — worst-case prompt

12 of 12 returned, but most just **redrew the scene at the original framing** or zoomed only slightly. Diffusion edit models do not have a true camera-zoom op.

**To make zoom work reliably:** rewrite the user's transcript to describe the *result* instead of the verb:

> Close-up photograph of the area inside the red circle, same lighting and style, same composition. Remove the red circle from the final image.

This phrasing won on `kontext`, `klein`, `seedream`, and `p-image-edit` in side-by-side tests. The voice-edit app could detect "zoom"/"close up"/"enhance" in the transcript and apply this rewrite automatically.

### Rotation — 7 prompt variants × 12 models = 84 runs

Single best result across the entire sweep:

🥇 **`p-image-edit` × v6-photographer framing.**

Output was a genuine 90° clockwise rotation that preserved the original pixels — VII '53 text now sideways in the corner, tree on the right, bar on the left, the whole scene pivoted. The only model that did a real geometric rotation rather than a regeneration.

🥈 **Topologically-correct (regenerated, right direction):** `gpt-image-2` with v2-pixel / v5-emphatic / v6-photographer; `nanobanana-pro` with v5-emphatic / v6-photographer.

❌ **Failure modes observed:**

- `seedream-pro` v5-emphatic: rotated **180°** instead of 90°.
- `gpt-image-2` v4-portrait, `gptimage-large` v3/v5: rotated **counter-clockwise** instead of clockwise.
- `kontext` v6: tilted the scene but kept the text upright.
- All other model × prompt combinations: no rotation, just regeneration at the original orientation.

**Most universally-effective rotate prompt** (worked on the widest set of models):

> Same photograph, but the photographer turned their camera 90 degrees clockwise before taking the shot. Everything that was on the top is now on the right side of the frame.

The technical framing (`"apply a 90-degree clockwise pixel rotation"`) only worked on `gpt-image-2`. The natural-language "photographer turning the camera" framing worked across `p-image-edit`, `gpt-image-2`, `nanobanana-pro`, and partially on `kontext`.

**Recommended UX:** *don't* send rotations to a model. Detect rotate/flip/mirror in the transcript and apply via canvas:

```js
const c = document.createElement("canvas");
c.width = src.height; c.height = src.width;
const ctx = c.getContext("2d");
ctx.translate(c.width, 0);
ctx.rotate(Math.PI / 2);
ctx.drawImage(src, 0, 0);
```

Deterministic, free, instant.

## Recommendations for the voice-edit app

### 1. Append a preserve clause to `buildPrompt`

In `apps/voice-edit/remix.html:785` (and the mirror copy in `index.html`, `image.html`):

```js
function buildPrompt(text, marked, color) {
  if (!marked) return text;
  return `The ${color} markings indicate the area the prompt is referring to. Prompt: ${text}. Output without ${color} markings. Keep everything else unchanged.`;
}
```

One-line change. Hits all 4 universal rules. No model worsened with the addition.

### 2. Detect zoom/close-up intent and rewrite

When the transcript contains `zoom`, `close up`, `closer`, `enhance`, `detail`, rewrite to:

> Close-up photograph of the area inside the red circle, same lighting and style, same composition.

Then pass to `buildPrompt` as usual (which adds the marker reference and preserve clause).

### 3. Detect rotate/flip/mirror intent and short-circuit to canvas

Don't call the model. Compose the result client-side and bypass the edit roundtrip entirely. Geometric transforms aren't what diffusion edit models do.

### 4. Adjust the recommended model set by intent

- **Default (region edit, marker present)**: `nanobanana-2` — fast, clean, low cost.
- **Style/quality-critical**: `seedream-pro` — highest fidelity, sub-20s.
- **Multi-reference / complex composition**: `nanobanana-pro` — thinking mode, accepts up to 14 references.
- **Text/typography edits**: `gptimage-large` (officially documents the red-circle workflow) or `seedream-pro`.
- **Geometric transform**: skip the model, use canvas.

### 5. Model-specific prompt overrides (if you want to go further)

For `nanobanana-pro`, prefix with a planning step:

```
First, identify the area inside the red circle. Then: {user's transcript}.
Output without red markings. Keep everything else unchanged.
```

For `nova-canvas` (when/if added): convert the click `xPct`/`yPct` to a generated B/W disk mask, **don't burn the red circle into the input**. Nova has a native mask channel and treats the red pixels as scene content rather than a hint.

## Methodology

- Source images: extracted from the PNG `tEXt` chunk (`pollinations:voice-edit:history`) of `~/Downloads/voice-edit-1779475553300.png`.
- Each model called via `gen.pollinations.ai/image/{prompt}?model={m}&image={url}` with a bearer token from `enter.pollinations.ai/.testingtokens`.
- Identical prompt + identical source for every run. Parallel fan-out via Node.
- Visual evaluation: each output read back and compared to the source by eye.
- Run logs and outputs live in `/tmp/edit-sim/` and the comparison dashboards (`combined.html`, `rotate-grid.html`).

## Source reports

Per-model research with citations: `temp/edit-model-research/`

- `kontext.md` — FLUX.1 Kontext
- `klein.md` — FLUX.2 Klein 4B
- `nanobanana.md` — Gemini 2.5 / 3.1 Flash Image, Gemini 3 Pro Image
- `gpt-image.md` — GPT Image 1 / 1.5 / 2
- `seedream.md` — Seedream 4.0 / 4.5 Pro / 5 Lite
- `wan-qwen.md` — Wan 2.7 Image and Qwen Image Plus
- `p-image-and-nova.md` — Pruna p-image-edit and AWS Nova Canvas
