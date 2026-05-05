# FAQ

## 🪷 What is Pollen?

Pollen is our **prepaid credit system**. **$1 ≈ 1 Pollen** *(pricing may evolve)*.

🔒 Pollen is in-app credit for the Pollinations API — **not a currency**. It lives inside your Pollinations wallet, isn't transferable between accounts, and isn't redeemable outside Pollinations.

⚡ You spend Pollen to make API calls — every generation costs Pollen based on the model you use.

## 🧩 Is Pollinations a coding tool or app builder?

**No.** Pollinations is not a code editor, no-code builder, or app development platform like Lovable, Bolt, or Cursor. We provide the **building blocks** that developers integrate into their own apps:

- 🤖 **AI Generation APIs** — Access 38+ models (text, image, audio, video) through a single API
- 👛 **One Pollen wallet** — every Pollinations app shares the same wallet per user. Top up once, spend across any app. Tier balance refills hourly; paid balance never expires.
- 💰 **BYOP monetization** — your users spend their own Pollen, not yours. Turn on Developer earnings on your App Key to earn a share of what they spend in your app.

🔧 You build the app your way — with any framework, any tool, any language. Plug in Pollinations for the AI capabilities and the monetization. We're the **engine and the cash register**, not the workshop.

## 🛒 How do I get Pollen?

There are **three ways**:

1. 💳 **Buy** — Purchase Pollen packs with a credit card. Lands in your **paid balance** and *never expires*. *(Want other payment options? [Vote here](https://github.com/pollinations/pollinations/issues/4826)!)*
2. 🌱 **Tier grants** — Free Pollen that refills every hour into your **tier balance**. Contribute to unlock bigger hourly grants.
3. 🌻 **Dev earnings** — Turn on Developer earnings for an App Key. Each request through your app is billed +25% over model cost (= 20% of user spend) — credited to your wallet. Earnings drip into your tier or paid balance, mirroring whichever the user paid from.

## 🆓 Can I try it for free?

**Yes!** Register, grab an API key, and start building — **no credit card required**.

- ✅ Every account gets **free Pollen** that refills hourly
- 📈 Contribute to unlock higher tiers with **bigger grants** (up to 0.8 Pollen/hour)

## 💳 What payment methods do you accept?

Currently **credit cards** via Stripe. We're actively exploring more options based on community feedback.

🗳️ **Want to pay differently?** Vote for your preferred method in our [payment methods issue](https://github.com/pollinations/pollinations/issues/4826) — PayPal, Alipay, and more!

## 📅 Is there a monthly subscription?

**Not yet** — but we're considering it based on community feedback.

💬 Share your thoughts in the [voting issue](https://github.com/pollinations/pollinations/issues/2202) or join our [Discord](https://discord.gg/pollinations-ai-885844321461485618) for updates!

## 🎉 What do I get when I register?

Registration gives you **instant access** to the Pollinations API. Create API keys and start making requests right away:

- **🔒 Secret Key (sk\_):** For server-side apps only. **No rate limits.**
- **🖥️ App Key:** For BYOP apps. Shows your app name + GitHub on the consent screen and attributes usage and earnings to your account.

🌱 All registered accounts get **free Pollen** refilled hourly — no purchase required. Active developers unlock higher tiers with bigger grants.

## 👛 How does my Pollen wallet work?

You get **one central wallet** for all your applications, made from two balance buckets:

- **🌱 Tier balance** — free hourly grant + earnings from tier-side traffic in your apps.
- **💳 Paid balance** — purchased Pollen + earnings from paid-side traffic in your apps. Never expires.

Earnings sit alongside the grant or purchase in their bucket — same balance, no internal priority.

**One bucket per request — no partial spend across buckets.**

- **Regular models:** if your tier balance can cover the request, it pays from tier; otherwise it pays from paid balance.
- **Paid-only models:** paid balance only.

⏰ If a request streams over its estimate, the bucket that paid for it can go negative. Your 🌱 tier balance recovers automatically — hourly refills bring it back up one increment at a time, capped at your tier. Your 💳 paid balance stays negative until you top up.

## 🏅 What are tiers?

Your tier sets how much your tier balance refills each hour. The refill stops once you're at or above the tier cap, so earnings can lift you above it.

| Tier | Pollen/hour |
|------|-------------|
| 🍄 Spore | 0.01 |
| 🌱 Seed | 0.15 |
| 🌸 Flower | 0.4 |

Everyone starts at Spore — the more you build and contribute, the bigger your grants:
- **Seed** — Automatic, based on GitHub activity (7+ dev points)
- **Flower** — Publish an app to the showcase

## 🔌 What is BYOP (Bring Your Own Pollen)?

BYOP lets your users connect their Pollinations account to your app and spend their own Pollen on AI generations.

**If you build with Pollinations:**

1. Your users pay for their requests, not you.
2. Turn on Developer earnings on an App Key to charge +25% over model cost — kept by you (= 20% of user spend).
3. On by default. Earnings only count for traffic through that App Key.
4. Earnings mirror the user: tier-paid request → tier-balance credit; paid-balance request → paid-balance credit.

**If you use a Pollinations app:**

1. You spend Pollen from your wallet, not the developer's.
2. Apps may add a 25% share — shown at sign-in (= 20% of what you pay).
3. Tier balance pays first; paid balance covers it if tier can't.
4. Revoke or cap any app at [enter.pollinations.ai](https://enter.pollinations.ai).

📖 **[Full BYOP guide →](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)**

## 🚫 Why was my request refused?

Two reasons.

1. **Account balance** — each model has an estimated cost based on its last-7-day average. If no eligible balance can cover that estimate (regular models: tier then paid; paid-only models: paid only), the request is refused before it runs.
2. **Key budget** — if the App Key has spent its full budget, requests through that key are rejected even when the account balance has Pollen left.

Refused requests cost zero Pollen and generate zero developer earnings — nothing fires when nothing runs.

## 💸 Can I refund Pollen?

Once a Pollen pack has been touched, it's non-refundable. Refunds apply to fully unused packs only — see [Refunds](/refunds).

## 🎨 What can I create with Pollen?

Anything you can imagine — **text**, **images**, **audio**, and **video**, all from one API.

- ✍️ Generate text with 30+ language models
- 🖼️ Create images with Flux, Turbo, and more
- 🎵 Text-to-speech, music generation
- 🎬 Video generation with Wan, Veo, LTX

💡 **Pro tip:** Mix efficient models for high-volume tasks with high-quality models when it matters most.

## 🚀 What's coming?

- 🎯 **Pollen Quest** — Earn Pollen by completing achievements (e.g. link your Discord), hitting milestones, and resolving issues.
- 🔑 **Pollinations Login** — OAuth sign-in for your users. Token handling and production-ready auth.
- 🏠 **App Hosting** — Ship your app on our infra. No deploy setup, no separate hosting bill.
- 📈 **Dev Earnings Analytics** — See which apps are earning Pollen.
- 🗺️ **App Discovery** — A marketplace where users find your app.
- 📣 **Ads SDK** — Optional ad placements your app can run alongside generations, with revenue shared back into your wallet.

🌱 Plans change. We build in the open and figure it out as we go.
