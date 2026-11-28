# FAQ

## Where should I start? {#what-can-i-create-with-pollen}

Open [Play](https://pollinations.ai/play) to generate an image, video, or audio clip, or ask a decision model to choose between options. You can also [try a community app](https://pollinations.ai/apps). If you're building your own app, the [API quick start](https://gen.pollinations.ai/docs#tag/quick-start) walks you through your first request.

## Can I try Pollinations without a credit card? {#can-i-try-pollinations-without-a-credit-card #how-do-quests-work}

Yes. Create an account and open [Quests](https://enter.pollinations.ai/quests) to see what you can earn. The first API key quest credits your Quest balance automatically when you qualify. For other completed quests, select **Ready to claim** and claim your credit.

The [Classic API](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md) also offers free, rate-limited text and image generation without an account.

## What does it cost, and where can I see what I spent? {#how-much-does-a-generation-cost #what-is-pollen #how-do-i-get-pollen #what-payment-options-are-available}

Pollinations is prepaid. [Models](https://enter.pollinations.ai/models) shows each model's rates in US dollars. [Activity](https://enter.pollinations.ai/activity) shows what you spent by model or API key.

Buy a one-time top-up through Stripe from [Credits](https://enter.pollinations.ai/pollen). Checkout shows the payment methods available to you. You can also turn on automatic top-ups with a supported saved payment method.

## Why was my request refused when I still have credit? {#how-does-my-pollen-wallet-work}

One eligible balance must cover the estimate. For most models, the whole charge comes from your **Quest balance** if it covers the final cost, or from your **Paid balance** if it has credit available. Paid-only models always use Paid balance. A final cost above the estimate can take a balance below zero.

A key can also reach its own spending cap or be set to **Quest balance only**. Follow the link in the error to [edit the key](https://enter.pollinations.ai/keys) or [top up](https://enter.pollinations.ai/pollen). Topping up your wallet leaves the key's spending cap in place.

## Which API key should I use?

Keep your personal Secret Key (`sk_`) on your server. For a browser or mobile app, use [Pollinations Connect](https://gen.pollinations.ai/docs#tag/pollinations-pay). Each user approves a budget, expiry, models, and permissions. Your app receives a scoped `sk_` for their requests. Users can edit or revoke access in [Keys](https://enter.pollinations.ai/keys).

Connect works without an App Key. Register a publishable App Key (`pk_`) to show your app's name at consent, attribute usage to it, or enable developer earnings.

## Who pays when someone uses my app? {#what-is-pollinations-pay}

With [Pollinations Pay](https://gen.pollinations.ai/docs#tag/pollinations-pay), each user pays from their own balance. Developer earnings are optional. If you enable them on your App Key, a $1 model request costs the user $1.25 and earns you $0.25 in the same balance type they used. You can track that credit in [Activity](https://enter.pollinations.ai/activity?tab=earnings) and spend it on Pollinations.

## Can I host my app or run code here? {#is-pollinations-a-coding-tool-or-app-builder}

Publish a static site for free at `<name>.pollinations.app` with [Sites](https://gen.pollinations.ai/docs#tag/sites). If you need a Linux machine to install software or run a process, open a [Sandbox](https://enter.pollinations.ai/sandboxes) over SSH or in VS Code. Runtime is prepaid. Pausing stops further runtime charges.

## How do I share an app, agent, or model? {#can-i-build-my-own-agent #can-i-bring-my-own-model}

Open [My listings](https://enter.pollinations.ai/my-models) and choose what you want to share.

- **App** — Submit it for catalog review. If it completes an app quest, enter the quest number on the submission form.
- **Agent** — Create a [prompt or code agent](https://gen.pollinations.ai/docs#tag/publish-an-agent), then copy its model ID from the listing. Callers pay for the models and tools the agent uses.
- **Model** — [Register an endpoint](https://gen.pollinations.ai/docs#tag/publish-a-model) you operate for text, images, video, transcription, speech, or embeddings. A priced public model earns you 75% of what users spend on it, as Pollinations credit.

Link GitHub to create agents or model listings. You can keep them private or [request publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml) to make them public.

## Who can see my uploaded files?

Anyone with the file URL can open it. Untagged uploads stay out of public galleries. Adding a tag publishes the file to that tag's gallery. Storage is temporary, so download anything you want to keep. If you send a file to an externally hosted community model, its operator receives it. See [Media storage](https://gen.pollinations.ai/docs#tag/media-storage) and the [Privacy Policy](https://pollinations.ai/privacy).

## Where can I get help?

Ask the community on [Discord](https://discord.gg/k9F7SyTgqn) or email [hello@pollinations.ai](mailto:hello@pollinations.ai). For a purchase question, email [billing@pollinations.ai](mailto:billing@pollinations.ai) or read the [refund policy](https://pollinations.ai/refunds).
