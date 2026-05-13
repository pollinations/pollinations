# FAQ

## 🪷 What is Pollen?

Pollen is our **prepaid credit system**. **$1 ≈ 1 Pollen** *(pricing may evolve)*.

🔒 Pollen is in-app credit for the Pollinations API. It lives inside your Pollinations wallet, isn't transferable between accounts, and isn't redeemable outside Pollinations.

⚡ You spend Pollen to make API calls — every generation costs Pollen based on the model you use.

## 🧩 Is Pollinations a coding tool or app builder?

**No.** Pollinations isn't a code editor or app builder like Lovable, Bolt, or Cursor. It's two pieces of infrastructure you wire into your own app:

- 🤖 **AI Generation APIs** — 38+ models (text, image, audio, video) behind one API
- 💰 **Payment Infrastructure** — your users pay for requests in your app, not you
- 🌻 **BYOP** — users spend their own Pollen. Flip on Developer earnings on your App Key to take a cut.

You build the app. We handle the models and the billing.

## 🛒 How do I get Pollen?

There are **three ways**:

1. 💳 **Buy** — Pay by card, Pollen goes to your **paid balance**. Expires after 12 months of account inactivity. *(Want other payment options? [Vote here](https://github.com/pollinations/pollinations/issues/4826)!)*
2. 🌱 **Tier grants** — Free Pollen that refills every hour into your **tier balance**. Contribute to unlock bigger hourly grants.
3. 🌻 **Dev earnings** — Flip on Developer earnings on an App Key to take +25% on top of model price on user traffic.

## 🆓 Can I try it for free?

Free Pollen on every account, refilled hourly. No credit card to register. Contribute on GitHub or ship an app and the hourly grant gets bigger.

## 💳 What payment methods do you accept?

Currently **credit cards** via Stripe. We're actively exploring more options based on community feedback.

🗳️ **Want to pay differently?** Vote for your preferred method in our [payment methods issue](https://github.com/pollinations/pollinations/issues/4826) — PayPal, Alipay, and more!

## 📅 Is there a monthly subscription?

**Not yet** — but we're considering it based on community feedback.

💬 Share your thoughts in the [voting issue](https://github.com/pollinations/pollinations/issues/2202) or join our [Discord](https://discord.gg/pollinations-ai-885844321461485618) for updates!

## 🎉 What do I get when I register?

Registration gets you API keys. There are two:

- **🔒 Secret Key (sk\_)** — server-side only, no rate limits.
- **🖥️ App Key** — for BYOP. Surfaces your app name and GitHub on the consent screen and attributes usage and earnings to you.

## 👛 How does my Pollen wallet work?

One central wallet across all your apps, split into two balances:

- **🌱 Tier balance** — free, refilled hourly up to your tier cap.
- **💳 Paid balance** — purchased Pollen.
- **Earnings** — credited to the balance the user spent from.

Balances expire after 12 months of account inactivity.

**Every request comes from one balance, not both at once.**

- **Regular models** use your free tier balance first. If it can't cover the cost, they switch to paid.
- **Paid-only models** always charge your paid balance.

⏰ A request can overshoot its estimate and push the balance that paid for it negative. Your 🌱 tier balance refills hourly until it's back to its cap; your 💳 paid balance stays negative until you top up.

## 🏅 What are tiers?

Your tier sets how much free Pollen you get each hour. The tier balance tops up to that amount, then waits.

| Tier | Pollen/hour |
|------|-------------|
| 🍄 Spore | 0.01 |
| 🌱 Seed | 0.15 |
| 🌸 Flower | 0.4 |

Everyone starts at Spore. Tiers go up as you build:
- **Seed** — automatic, once you've racked up enough GitHub activity in the Pollinations org.
- **Flower** — publish an app to the showcase.

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

Text, images, audio, and video — one API.

- 30+ language models for text.
- Flux, Turbo, and others for images.
- Text-to-speech and music generation.
- Video via Wan, Veo, and LTX.

## 🚀 What's coming?

- 🎯 **Pollen Quest** — earn Pollen through achievements, milestones, and closing issues.
- 🔑 **Pollinations Login** — OAuth sign-in for your users, with token handling handled for you.
- 🏠 **App Hosting** — run your app on our infra, no separate hosting bill.
- 🗺️ **App Discovery** — a marketplace for users to find your app.
- 📣 **Ads SDK** — optional ad placements next to generations, revenue back into your wallet.

🌱 Plans change. We build in the open and figure it out as we go.
