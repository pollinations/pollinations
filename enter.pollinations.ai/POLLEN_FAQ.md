# FAQ

## What can I make, and where should I start? {#what-can-i-create-with-pollen}

Open [Play](https://pollinations.ai/play) to make an image, video, or audio clip, or ask a decision model to choose between options. You can also [try a community app](https://pollinations.ai/apps).

Through the API you can also generate text, edit images, transcribe speech, use realtime voice, create embeddings, and generate 3D models. Browse the [models](https://enter.pollinations.ai/models) or make your first request with the [API quick start](https://gen.pollinations.ai/docs#tag/quick-start).

## Can I try Pollinations without a credit card?

Yes. Create an account and earn credit through [Quests](https://enter.pollinations.ai/quests). The first API key quest credits your Quest balance automatically when you qualify.

The [Classic API](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md) also offers free, rate-limited text and image generation without an account.

## How do Quests work?

Open [Quests](https://enter.pollinations.ai/quests) for current tasks, amounts, and your progress. Select **Ready to claim** to collect earned credit.

For a [GitHub contribution quest](https://github.com/pollinations/pollinations/blob/main/CONTRIBUTING.md), anyone can start without reserving the issue. Several people can submit solutions. The author of the selected pull request can claim the credit after it merges. For an app quest, enter the quest number on the [app submission form](https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml) and claim after the catalog pull request merges.

## How do I add or earn credit? {#how-do-i-add-or-earn-credit #how-do-i-get-pollen}

- Buy a top-up in [Credits](https://enter.pollinations.ai/pollen).
- Complete [Quests](https://enter.pollinations.ai/quests).
- Enable developer earnings on your [App Key](https://enter.pollinations.ai/keys?tab=app) to earn from usage through your app.
- [Publish a model](https://gen.pollinations.ai/docs#tag/publish-a-model) with a price to earn when people use it.

## What does it cost, and where can I see what I spent? {#how-much-does-a-generation-cost #what-is-pollen #what-payment-options-are-available}

Pollinations is prepaid. Depending on the model, you might pay per token, image, or second. [Models](https://enter.pollinations.ai/models) shows rates in US dollars. [Activity](https://enter.pollinations.ai/activity) shows what you spent by model or API key.

Top-ups are one-time purchases with no subscription. Stripe Checkout shows the payment methods available to you. You can enable automatic top-ups in [Credits](https://enter.pollinations.ai/pollen) with a supported saved payment method.

## What are Quest and Paid balances? {#what-are-quest-and-paid-balances #how-does-my-pollen-wallet-work}

Quests earn **Quest balance**. Top-ups add **Paid balance**. Earnings from apps and models go to the same balance type the caller used. Credit cannot be transferred between accounts or redeemed outside Pollinations.

Each request charges one balance. For most models, Quest balance pays when it covers the final cost. Otherwise, available Paid balance pays the whole charge. Paid-only models always use Paid balance.

## Why was my request refused when I still have credit?

One eligible balance must cover the estimate before a request can start. A **Quest balance only** key can spend only Quest credit. If your key has a budget, the estimate must fit its remaining budget too. Follow the link in the error to [edit your key](https://enter.pollinations.ai/keys) or [top up your account balance](https://enter.pollinations.ai/pollen).

The final charge can exceed the estimate or the key's budget and can take a balance below zero.

## Which API key should I use?

Keep your personal Secret Key (`sk_`) on your server. For a browser or mobile app, use [Pollinations Connect](https://gen.pollinations.ai/docs#tag/pollinations-pay). Each user approves a budget, expiry, models, and permissions. Your app receives a scoped `sk_` for their requests. Users can edit or revoke access in [Keys](https://enter.pollinations.ai/keys).

Connect works without an App Key. Register a publishable App Key (`pk_`) to show your app's name at consent, attribute usage to it, or enable developer earnings.

## Who pays when someone uses my app? {#what-is-pollinations-pay}

With [Pollinations Pay](https://gen.pollinations.ai/docs#tag/pollinations-pay) (BYOP), users authorize your app to pay for requests from their Pollinations balance. Developer earnings are optional. If you enable them on your App Key, a $1 model request costs the user $1.25 and earns you $0.25 in the same balance type they used. You can track that credit in [Activity](https://enter.pollinations.ai/activity?tab=earnings) and spend it on Pollinations.

## Can I host my app or run code here? {#is-pollinations-a-coding-tool-or-app-builder}

Publish a static site for free at `<name>.pollinations.app` with [Sites](https://gen.pollinations.ai/docs#tag/sites). If you need a Linux machine to install software or run a process, open a [Sandbox](https://enter.pollinations.ai/sandboxes) over SSH or in VS Code. Runtime is prepaid. Pausing stops further runtime charges.

## Can I build an agent, bring my own model, or list my app? {#can-i-build-my-own-agent #can-i-bring-my-own-model}

Open [My listings](https://enter.pollinations.ai/my-models) and choose what you want to build or publish.

- **Agent** — Create a [prompt or code agent](https://gen.pollinations.ai/docs#tag/publish-an-agent), then copy its model ID from the listing. Callers pay for the models and tools the agent uses.
- **Model** — [Register an endpoint](https://gen.pollinations.ai/docs#tag/publish-a-model) you operate for text, images, video, transcription, speech, or embeddings. A priced public model earns you 75% of what users spend on it, as Pollinations credit.
- **App** — Submit your app for review to appear in the [app catalog](https://pollinations.ai/apps).

Link GitHub to create agents or model listings. You can keep them private or [request publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml) to make them public.

## Who can see my uploaded files?

Anyone with the file URL can open it. Untagged uploads stay out of public galleries. Adding a tag publishes the file to that tag's gallery. Storage is temporary, so download anything you want to keep. If you send a file to an externally hosted community model, its operator receives it. See [Media storage](https://gen.pollinations.ai/docs#tag/media-storage) and the [Privacy Policy](https://pollinations.ai/privacy).

## Where can I get help?

Ask the community on [Discord](https://discord.gg/k9F7SyTgqn) or email [hello@pollinations.ai](mailto:hello@pollinations.ai). For a purchase question, email [billing@pollinations.ai](mailto:billing@pollinations.ai) or read the [refund policy](https://pollinations.ai/refunds).
