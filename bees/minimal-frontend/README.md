# Minimal bee frontend

Tiny static app that treats a deployed bee as its backend. It proves the app
pattern: UI owns presentation, the bee owns conversation, tools, state, billing,
and surfaces.

Open `index.html` directly or serve this folder with any static server.

Configure:

- Bee id: `?bee=bee_booking-assistant`, or edit the input.
- API origin: defaults to `https://gen.pollinations.ai`.
- Authorization: paste a BYOP/App Key token when the bee requires user-pays
  invocation.

The app posts to:

```text
POST {origin}/bees/{beeId}/web/messages
```

Request body:

```json
{ "text": "Can you help book a trio?", "userId": "browser-demo" }
```
