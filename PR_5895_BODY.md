## Description

This PR fixes issue #5895 by automatically enforcing `temperature=1` for o1/reasoning models to prevent 400 errors from Azure OpenAI.

## Problem

Users were encountering 400 errors when using `o1` / `o1-mini` models with a `temperature` other than 1 (e.g., default 0.7). Azure OpenAI o1 models only support `temperature=1` and reject any other value.

Error message:
```
azure-openai error: Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported.
```

## Solution

Added automatic temperature enforcement in `parameterProcessor.js` that:
- Detects o1 models (o1, o1-mini, o1-preview) by checking the `requestedModel` name
- Forces `temperature=1` when a different value is provided
- Logs the enforcement for debugging purposes

## Changes

**Modified:** `text.pollinations.ai/transforms/parameterProcessor.js`
- Added detection for o1 models using regex pattern `/^o1(-mini|-preview)?$/i`
- Automatically sets `temperature=1` if a different value is provided
- Preserves user's requested value in logs for transparency

## Testing

- ✅ Handles `o1` model correctly
- ✅ Handles `o1-mini` model correctly  
- ✅ Handles `o1-preview` model correctly (if exists)
- ✅ Only affects o1 models, other models unchanged
- ✅ Logs enforcement for debugging

## Example

**Before (causes 400 error):**
```javascript
// User requests o1-mini with temperature=0.7
{
  model: "o1-mini",
  temperature: 0.7  // ❌ Azure rejects this
}
```

**After (works correctly):**
```javascript
// Parameter processor automatically enforces temperature=1
{
  model: "o1-mini",
  temperature: 1  // ✅ Automatically set to 1
}
```

## Credits

**Developed by:** Fábio Arieira  
**Website:** https://fabioarieira.com  
**Production Projects:**
- IA-Books: https://iabooks.com.br
- ViralFlow: https://fabioarieira.com/viralflow
- Real Estate Platform: https://fabioarieira.com/imob

Full Stack Developer specializing in AI integrations, TypeScript, and modern web applications.

---

Resolves #5895
