# FAQ

## 🪷 What is Pollen?

Pollen is our **prepaid credit system**. **$1 ≈ 1 Pollen** *(pricing may evolve)*.

🔒 Pollen is in-app credit for the Pollinations API. It lives inside your Pollinations wallet, isn't transferable between accounts, and isn't redeemable outside Pollinations.

⚡ You spend Pollen to make API calls — every generation costs Pollen based on the model you use.

## 🧩 Is Pollinations a coding tool or app builder?

**No.** Pollinations is not a code editor, no-code builder, or app development platform like Lovable, Bolt, or Cursor. We provide the **building blocks** that developers integrate into their own apps:

- 🤖 **AI Generation APIs** — Access 38+ models (text, image, audio, video) through a single API
- 💰 **Payment Infrastructure** — Let your app's users pay per use with Pollen credits, so you don't foot the compute bill
- 🌻 **BYOP** — your users spend their own Pollen, not yours. Turn on Developer earnings on your App Key to earn a share of what they spend in your app.

🔧 You build the app your way — with any framework, any tool, any language. Plug in Pollinations for the AI capabilities and the monetization. We're the **engine and the cash register**, not the workshop.

## 🛒 How do I get Pollen?

There are **three ways**:

1. 💳 **Buy** — Purchase Pollen packs with a credit card. Lands in your **paid balance**; from 2026-06-01, expires after 12 months of account inactivity. *(Want other payment options? [Vote here](https://github.com/pollinations/pollinations/issues/4826)!)*
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

One central wallet across all your apps, split into two balances:

- **🌱 Tier balance** — hourly grants (only while below your tier's free amount) + tier-side earnings (user spending in your apps).
- **💳 Paid balance** — purchased Pollen + paid-side earnings (user spending in your apps).

From **2026-06-01**, your wallet expires after 12 months of account inactivity. Existing balances start the clock on that date, so everyone gets a full 12-month window from the effective date. Signing in, making API requests, or buying Pollen counts as activity.

**Each request pays from a single balance — no partial spend across the two.**

- **Regular models** pay from your tier balance if it can cover the request, otherwise from paid.
- **Paid-only models** pay from paid only.

⏰ If a request streams over its estimate, the bucket that paid for it can go negative. Your 🌱 tier balance recovers automatically — hourly refills bring it back up one increment at a time, capped at your tier. Your 💳 paid balance stays negative until you top up.

## 🏅 What are tiers?

Each tier defines a free Pollen amount. The tier balance refills to this amount hourly while below — refills don't accumulate beyond it. Earnings are credited separately. *If earnings carry the balance above this amount, the hourly refill pauses until you spend back down.*

| Tier | Pollen/hour (your tier's free amount) |
|------|---------------------------------------|
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
2. Turn on Developer earnings on an App Key to charge +25% over model cost — kept by you.
3. Earnings only count for traffic through that App Key.

**If you use a Pollinations app:**

1. You spend Pollen from your wallet, not the developer's.
2. Apps may add a 25% share — shown at sign-in.
3. Tier balance pays first; paid balance covers it if tier can't.
4. Revoke or cap any app at [enter.pollinations.ai](https://enter.pollinations.ai).

📖 **[Full BYOP guide →](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)**

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
