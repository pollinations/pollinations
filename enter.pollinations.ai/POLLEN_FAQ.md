# FAQ

## 💎 What is Pollen?

Pollen is our **prepaid credit system**. **$1 ≈ 1 Pollen** *(pricing may evolve)*.

⚡ You spend Pollen to make API calls — every generation costs Pollen based on the model you use.

## 🧩 Is Pollinations a coding tool or app builder?

**No.** Pollinations is not a code editor, no-code builder, or app development platform like Lovable, Bolt, or Cursor. We provide the **building blocks** that creators integrate into their own apps:

- 🤖 **AI Generation APIs** — Access 38+ models (text, image, audio, video) through a single API
- 💰 **Payment Infrastructure** — Let your app's users pay per use with Pollen credits, so you don't foot the compute bill
- 📊 **Monetization Tools** — Revenue share (launching Q2), and soon ads SDK — everything you need to earn from your app

🔧 You build the app your way — with any framework, any tool, any language. Plug in Pollinations for the AI capabilities and the monetization. We're the **engine and the cash register**, not the workshop.

## 🛒 How do I get Pollen?

There are **three ways**:

1. 💳 **Buy It** — Purchase Pollen packs with a credit card. Goes into your wallet and *never expires*. *(Want other payment options? [Vote here](https://github.com/pollinations/pollinations/issues/4826)!)*
2. 🎁 **Grants** — All tiers receive free Pollen that refills every hour.
3. 🏆 **Earn It** — Contribute to the ecosystem — code, docs, community support, publishing apps — and unlock higher tiers with bigger grants.

## 🆓 Can I try it for free?

**Yes!** Register, grab an API key, and start building — **no credit card required**.

- ✅ Every account gets **free Pollen** that refills hourly
- 📈 Contribute to unlock higher tiers with **bigger grants** (up to 0.8 pollen/hour)

## 💳 What payment methods do you accept?

Currently **credit cards** via Stripe. We're actively exploring more options based on community feedback.

🗳️ **Want to pay differently?** Vote for your preferred method in our [payment methods issue](https://github.com/pollinations/pollinations/issues/4826) — crypto, PayPal, Alipay, and more!

## 📅 Is there a monthly subscription?

**Not yet** — but we're considering it based on community feedback.

💬 Share your thoughts in the [voting issue](https://github.com/pollinations/pollinations/issues/2202) or join our [Discord](https://discord.gg/pollinations-ai-885844321461485618) for updates!

## 🎉 What do I get when I register?

Registration gives you **instant access** to the Pollinations API. Create API keys and start making requests right away:

- **🌐 Publishable Key (pk\_):** For client-side apps *(bound to your domain)*. Rate limits: **1 pollen per IP per hour**.
- **🔒 Secret Key (sk\_):** For server-side apps only. **No rate limits.**

🎁 All registered accounts get **free Pollen** refilled hourly — no purchase required. Active creators unlock higher tiers with bigger grants.

## 👛 How does my Pollen wallet work?

You get **one central wallet** for all your applications. It holds two types of Pollen:

- 🔄 **Tier Pollen** — Free pollen from your tier, refilled automatically every hour. Does not carry over between refills.
- 💎 **Purchased Pollen** — From packs you've bought. **Never expires.** Top up anytime.

⚡ Tier Pollen is always spent **first**, then purchased Pollen kicks in. Some models marked with 💎 **Paid Only** require purchased Pollen and skip tier grants.

⏰ Pollen refills every hour. If a request costs slightly more than estimated, your balance may go briefly negative — the **next refill covers the difference** automatically.

## 🏅 What are tiers?

| Tier | Pollen/hour |
|------|-------------|
| 🍄 Spore | 0.01 |
| 🌱 Seed | 0.15 |
| 🌸 Flower | 0.4 |
| 🍯 Nectar | 0.8 |

All tiers refill every hour. Everyone starts at Spore — the more you build and contribute, the bigger your grants:
- **Seed** — Automatic, based on GitHub activity (8+ dev points)
- **Flower** — Publish an app to the showcase
- **Nectar** — Coming soon

## 🔌 What is BYOP (Bring Your Own Pollen)?

BYOP lets your app's users **pay for their own AI generations** with their Pollen — instead of it coming out of *your* balance.

🚀 **Why it matters:** Without BYOP, every user of your app burns *your* Pollen. With BYOP, your **compute cost drops to zero**. Your users get a seamless experience, and you can scale without worrying about costs.

🔄 Every user on the platform gets free Pollen refilled hourly. With BYOP, they spend that Pollen in *your* app — the **Pollinations flywheel**: build an app for free → integrate BYOP → your users arrive with Pollen → they fuel the app → you grow → bigger grants → build bigger.

🔑 **App Key:** Create an **App Key** (`pk_...`) on [enter.pollinations.ai](https://enter.pollinations.ai) to get the most out of BYOP. With an App Key, the consent screen shows your **app name + GitHub** instead of a generic hostname, and the traffic your app drives is **tracked to your account** — helping you qualify for automatic tier upgrades and higher Pollen grants.

📖 **[Full BYOP guide →](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)**

## 🎨 What can I create with Pollen?

Anything you can imagine — **text**, **images**, **audio**, and **video**, all from one API.

- ✍️ Generate text with 30+ language models
- 🖼️ Create images with Flux, Turbo, and more
- 🎵 Text-to-speech, music generation
- 🎬 Video generation with Wan, Veo, LTX

💡 **Pro tip:** Mix efficient models for high-volume tasks with high-quality models when it matters most.

## 🚀 What's coming?

- 🧮 **Scoring System** — Tiers will be based on a transparent score — GitHub activity, API usage, apps shipped, and community contributions.
- 🔑 **Pollinations Login** — OAuth sign-in for your users. Token handling and production-ready auth.
- 🏠 **App Hosting** — Ship your app on our infra. No deploy setup, no separate hosting bill.
- 🌻 **Creator Rewards** — Get recognized for what people build with your app.
- 🗺️ **App Discovery** — A marketplace where users find your app.

🌱 Plans change. We build in the open and figure it out as we go.
