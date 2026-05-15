# voice-edit-remix

Image-only voice editor that can save itself as a remix: a new HTML file
with the current image and history embedded. Open the file and you land
on the same gallery.

Same edit mechanics as `voice-edit-image`. The only addition is the
**remix** button.

## the remix mechanic

1. Click **remix**.
2. The page reads its own DOM via `document.documentElement.outerHTML`.
3. Two sentinels in the source get rewritten:
   - `const STARTER = "..."` -> current image URL.
   - `const INITIAL_HISTORY = [...]; const INITIAL_HISTORY_INDEX = ...` -> populated.
4. The resulting HTML is downloaded as `voice-edit-remix-<ts>.html`.
5. Opening that file boots into the embedded gallery instead of the default starter.

No source-doubling. No `<template id="self">`. The remix file is the same
size as the canonical app plus a few hundred bytes of state. Image bytes
are never embedded — only Pollinations URLs, which are content-addressed
and cached server-side.

## sentinels

These three lines must stay as a single, well-defined block — the remix
serializer regex-matches them:

```js
const STARTER = "https://media.pollinations.ai/...";
const INITIAL_HISTORY = [];
const INITIAL_HISTORY_INDEX = -1;
```

Don't reformat them, don't move them apart, don't change the constant
names without updating the regex in the remix handler.

## auth

A remix file holds no user token. Tokens live in `localStorage` under
`voice-edit:user-key`. The serializer also refuses to download if any
`pk_*` or `sk_*` string is found anywhere in the source.

Recipient must connect their own Pollinations account before editing.
The cached gallery loads without auth — generation URLs are public.

## local

```bash
cd apps/voice-edit-remix
python3 -m http.server 8767
# http://localhost:8767/
```

## siblings

- `apps/voice-edit` — richer version with video animate mode.
- `apps/voice-edit-image` — minimal image-only base. This variant forks
  from it.
