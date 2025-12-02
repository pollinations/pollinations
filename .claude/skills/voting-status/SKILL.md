---
name: voting-status
description: Create and post ASCII art voting status diagrams to GitHub issues and Discord. Use when asked to update voting, show voting results, or announce voting status.
---

# Voting Status Diagrams

Generate phrack-style ASCII art diagrams showing community voting results and post them to GitHub + Discord.

---

## Hard Rules

1. **Post diagram as GitHub comment** (not in issue body)
2. **Post to all 3 Discord channels** (chat, pollen-beta, news-polls)
3. **Always include voting link** at bottom
4. **Gen-Z friendly language** ("we been cooking fr fr 🔥")

---

## Voting Issues

| Topic | Issue | Emoji Mapping |
|-------|-------|---------------|
| **Models** | #5321 | 👍=Video, 😄=Embed, ❤️=OSS, 🚀=Image, 🎉=TTS |
| **Payments** | #4826 | 👍=Crypto, 😄=PayPal, ❤️=Alipay, 🚀=UPI, 😕=GPU, 🎉=Ads, 👀=PIX |
| **Login** | #5543 | 👍=Google, 😄=Discord, ❤️=Email, 🚀=Phone, 🎉=WeChat, 👀=Wallet |

---

## Discord Config

| Channel | ID |
|---------|-----|
| Guild | `885844321461485618` |
| 💬│chat | `889573359111774329` |
| 🏵️│pollen-beta | `1432378056126894343` |
| 📰│news-polls | `1339346975690068008` |

---

## Workflow

### 1. Fetch Issue Data
```
mcp1_get_issue(owner: "pollinations", repo: "pollinations", issue_number: XXXX)
```
Extract from `reactions`: `+1`, `-1`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`

### 2. Generate ASCII Diagram

**Template:**
```
.--[ TITLE | XX votes ]--------------------------------------------------------.
|                                                                               |
|  VOTES BY CATEGORY                                 STATUS                     |
|  ────────────────                                  ──────                     |
|  🎉 WINNER    ██████████████████████████████ XX    ✓ shipped / ⏳ backlog    |
|  👍 SECOND    ████████████████████ XX              ⏳ researching             |
|  😄 THIRD     ███████████████ XX                   ⏳ backlog                 |
|  ...                                                                          |
|                                                                               |
|  ✅ SHIPPED: What's already live                                             |
|  🏆 LEADER: Top vote-getter (XX votes)                                       |
'-------------------------------------------------------------------------------'
```

**Bar formula:** `█` × `Math.round(votes / maxVotes * 30)`

### 3. Post to GitHub
```
mcp1_add_issue_comment(
  owner: "pollinations",
  repo: "pollinations", 
  issue_number: XXXX,
  body: "## 📊 Voting Status Update (Month YYYY)\n\n```\n<DIAGRAM>\n```\n\n<OUTRO>"
)
```

### 4. Post to Discord (all 3 channels: chat, pollen-beta, news-polls)
```
mcp0_discord_send(channelId: "889573359111774329", message: "<DIAGRAM + LINK>")      // chat
mcp0_discord_send(channelId: "1432378056126894343", message: "<DIAGRAM + LINK>")     // pollen-beta
mcp0_discord_send(channelId: "1339346975690068008", message: "<DIAGRAM + LINK>")     // news-polls
```

---

## Example: Models Voting

```
## 📊 Voting Status Update (Dec 2025)

\`\`\`
.--[ MODEL VOTING | 121 votes ]-------------------------------------------------.
|                                                                               |
|  VOTES BY TYPE                                     SHIPPED NOV-DEC '25        |
|  ─────────────                                     ───────────────────        |
|  👍 VIDEO    ████████████████████████████████ 46   ✓ Veo 3.1 🎬               |
|  ❤️ OSS LLM  ████████████████ 21                   ✓ Kimi K2, DeepSeek        |
|  🎉 TTS/STT  ███████████████ 20                    ✓ openai-audio             |
|  🚀 IMAGE    █████████ 13                          ✓ Nanobanana Pro           |
|  😄 EMBED    ████████ 12                           ⏳ next up?                 |
|  👎 OTHER    ████ 6                                comment below!             |
|                                                                               |
|  🏆 LEADER: Video generation (46 votes)                                      |
'-------------------------------------------------------------------------------'
\`\`\`

we been cooking fr fr 🔥 keep the votes coming!

🗳️ **Vote here:** https://github.com/pollinations/pollinations/issues/5321
```

---

## Example: Payments Voting

```
## 📊 Payment Voting Status (Dec 2025)

\`\`\`
.--[ PAYMENT VOTING | 135 votes ]-----------------------------------------------.
|                                                                               |
|  VOTES BY METHOD                                   STATUS                     |
|  ────────────────                                  ──────                     |
|  🎉 ADS EARN    ██████████████████████████████ 38  ⏳ exploring               |
|  👍 CRYPTO      ████████████████████ 24            ⏳ researching             |
|  😄 PAYPAL      █████████████████ 21               ⏳ polar integration?      |
|  😕 HOST GPUs   █████████████ 16                   ⏳ get in touch!           |
|  👀 PIX 🇧🇷     ██████████ 13                      ⏳ researching             |
|  🚀 UPI 🇮🇳     █████████ 11                       ⏳ researching             |
|  ❤️ ALIPAY 🇨🇳  ██████ 9                           ⏳ researching             |
|                                                                               |
|  ✅ SHIPPED: Credit Card via Polar.sh                                        |
|  🏆 LEADER: Display ads to earn (38 votes)                                   |
'-------------------------------------------------------------------------------'
\`\`\`

ads to earn pollen is winning! 🗳️

💳 **Vote here:** https://github.com/pollinations/pollinations/issues/4826
```

---

## Example: General Announcement (Dec 2025)

```
`░▒▓ POLLINATIONS // DEC 2025 ▓▒░`

**still in beta — values may shift as we find balance**

## ⚡ pollen rebalance

adjusting daily pollen to sustain compute
effective from next refill

\`\`\`
🦠 spore    1/day
🌱 seed     3/day
🌸 flower   10/day
🍯 nectar   20/day
\`\`\`

## 🌱 🌸 upgrade paths

**🦠 → 🌱** show us you're part of the community
- ⭐ star [repo](https://github.com/pollinations/pollinations)
- 🔀 merged PR

**🌱 → 🌸** build something with pollinations
- 🛠️ push code
- 📦 project in [showcase](https://pollinations.ai)

register → https://enter.pollinations.ai

## 🎬 new endpoints

premium models now live. all accessible to everyone.

\`\`\`
text   claude opus 4.5 · kimi k2
image  nanobanana-pro (4K) · seedream 4
video  veo 3.1 · seedance
\`\`\`

---

📖 [docs](https://enter.pollinations.ai/api/docs) · 🐙 [github](https://github.com/pollinations/pollinations) · 🗳️ [vote for models](https://github.com/pollinations/pollinations/issues/5321) · 💬 questions welcome

*we're figuring this out together — free tiers may evolve as we grow* 🌱
```

---

## Notes

- Keep diagrams < 2000 chars for Discord
- Sort categories by vote count (highest first)
- Include shipped items to show progress
- Use appropriate emoji for issue type (🗳️ models, 💳 payments, 🔐 login)
