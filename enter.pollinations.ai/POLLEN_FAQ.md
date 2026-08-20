# FAQ

## 🪷 What is Pollen?

Pollen is the prepaid credit used by the Pollinations API. **$1 ≈ 1 Pollen**; a generation spends Pollen according to the selected model's price and usage.

Pollen stays inside your Pollinations wallet. It is not transferable between accounts or redeemable outside Pollinations.

## 🧩 Is Pollinations a coding tool or app builder?

No. Pollinations provides infrastructure that you connect to your own application:

- **Generation APIs** for text, image, video, audio, realtime, embeddings, and 3D.
- **Managed agents** built from a prompt, a base model, and optional Pollinations tools.
- **Community models** for developers who operate compatible model endpoints.
- **User-pays authorization (BYOP)** so an app can let each user fund their own requests.

You build and host the application. Pollinations provides model access, account authorization, and billing.

## 🛒 How do I get Pollen?

- **Buy Pollen** from the [Pollen dashboard](https://enter.pollinations.ai/pollen) through Stripe Checkout.
- **Complete Quests** and claim eligible rewards from the [Quests dashboard](https://enter.pollinations.ai/quests).
- **Earn from a BYOP app** by enabling Developer earnings on an App Key. Users pay a 25% markup on that app's model usage, which is credited to the developer.
- **Publish a community model** with a price. The model owner receives 75% of its model cost when other users call it.

## 🆓 Can I try Pollinations without a credit card?

Yes. Create an account, complete eligible Quests, and claim the rewards to receive Quest Pollen. Available Quests and rewards are shown in the [Quests dashboard](https://enter.pollinations.ai/quests).

## 🎯 How do Quests work?

Quests reward eligible account activity and community contributions.

- Browse the dashboard for current requirements, progress, and rewards.
- Claim completed rewards from the dashboard; past qualifying activity may count.
- Contribution quests are labeled GitHub issues with a stated reward. Get assigned, complete the issue, and claim after the work is merged.

Quest availability and reward amounts can change, so the dashboard and the linked issue are the source of truth.

## 👛 How does my Pollen wallet work?

Your wallet has two balances:

- **Quest Pollen** — earned from Quests and eligible developer rewards.
- **Paid Pollen** — purchased through Stripe and eligible developer rewards.

Every request is charged to one balance, never split across both:

- A regular model uses Quest Pollen when that balance can cover the estimated charge; otherwise it uses Paid Pollen.
- A paid-only model requires Paid Pollen.
- The final cost can exceed the estimate and make the selected balance negative.

Developer rewards are credited to the matching balance type used by the paying user.

## 💰 How much does a generation cost?

Prices depend on the model and may use tokens, images, seconds, or another model-specific unit. Check the live [model catalog](https://enter.pollinations.ai/models) or [`GET /v1/models`](https://gen.pollinations.ai/v1/models) instead of relying on a hardcoded model list or price.

## 🎨 What can I create with Pollen?

Pollinations supports text, images and image edits, video, speech and audio, transcription, realtime conversations, embeddings, and 3D generation. Availability and capabilities differ by model; use the live model catalog to choose one for your task.

## 🔑 Which API key should I use?

- **Personal Secret Key (`sk_`)** — use on a trusted server for your own model usage. It can have a Pollen budget, expiry, model restrictions, and account permissions. Do not ship a personal Secret Key in browser or mobile code.
- **App Key (`pk_`)** — a publishable OAuth client identifier for BYOP. It identifies your app and its redirect URIs; it is not the generation credential. After user consent, your app receives a scoped, user-authorized `sk_` for API calls.
- **Raw publishable key (`pk_` without an app binding)** — legacy direct generation only, limited to 1 Pollen per IP per hour. Do not create new integrations around this flow.

All traffic remains subject to platform abuse protection and any model-specific constraints.

## 🔌 What is BYOP (Bring Your Own Pollen)?

BYOP lets users authorize an application to spend Pollen from their own wallet.

For app developers:

1. Create an App Key. Web apps must register their exact redirect URIs.
2. Use the OAuth authorization-code flow with PKCE, or the device flow for headless clients.
3. Call the API with the scoped user key returned after consent.
4. Optionally enable Developer earnings, which adds a disclosed 25% markup to that app's traffic.

Users choose the budget, expiry, models, and account permissions they approve. They can edit or revoke issued keys from the dashboard.

Read the [Bring Your Own Pollen guide](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md) for the complete integration.

## 🤖 Can I build my own agent?

Yes. A managed agent combines a system prompt, a Pollinations base model, and optional built-in Pollinations tools. Create one in [My Agents & Models](https://enter.pollinations.ai/my-models), then call its registered `owner/name` ID through the normal text-generation API.

An agent listing has no owner-set price, but the caller pays for its base model and any generations performed by tools. Every account can create an owner-only private agent; publishing an agent requires community publisher access.

## 🧩 Can I bring my own model?

Yes. Register a compatible text, image, image-edit, or transcription provider from [My Agents & Models](https://enter.pollinations.ai/my-models) or the `/account/my-models` API. Every authenticated account can create an owner-only private model. Public publishing requires community publisher access.

Public community models can set prices and compatible fallback models. Pollinations monitors public text and image endpoints and credits 75% of their model cost to the owner when other users call them.

## 💳 What payment options are available?

Pollen is sold as one-time packs through Stripe Checkout. Stripe displays the payment methods and local pricing available for the buyer's region and checkout session. Pollinations does not currently require a monthly subscription.

You can also configure automatic top-up from the Pollen dashboard after adding a supported default payment method.

## 🆘 Where can I get help?

Use [Discord](https://discord.gg/pollinations-ai-885844321461485618) for community help, email [hello@pollinations.ai](mailto:hello@pollinations.ai) for general support, or email [billing@pollinations.ai](mailto:billing@pollinations.ai) for billing questions.
