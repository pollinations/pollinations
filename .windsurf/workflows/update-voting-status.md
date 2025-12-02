---
description: Create and post voting status diagrams to GitHub issues and Discord
---

# Update Voting Status Diagrams

Generate phrack-style ASCII art diagrams showing voting results and post them to GitHub issues and Discord channels.

## Voting Issues

| Issue | Topic | Number |
|-------|-------|--------|
| Models | Which models to add next | #5321 |
| Payments | What payment methods to add | #4826 |
| Login | What login providers to add | #5543 |

## Discord Configuration

- **Guild ID**: `885844321461485618`
- **Chat Channel**: `889573359111774329`
- **Pollen Beta Channel**: `1432378056126894343`
- **News & Polls Channel**: `1339346975690068008`

## Steps

### 1. Fetch issue data
Use `mcp1_get_issue` to get the issue details including reaction counts:
```
owner: pollinations
repo: pollinations
issue_number: <ISSUE_NUMBER>
```

### 2. Map reactions to vote categories
Each voting issue uses emoji reactions as votes:

**Models (#5321):**
- 👍 (+1) = Video generation
- 😄 (laugh) = Embeddings
- ❤️ (heart) = OSS LLMs
- 🚀 (rocket) = Image models
- 🎉 (hooray) = TTS/STT
- 👎 (-1) = Other

**Payments (#4826):**
- 👍 (+1) = Crypto
- 😄 (laugh) = PayPal
- ❤️ (heart) = Alipay/WeChat
- 🚀 (rocket) = UPI (India)
- 😕 (confused) = Host GPUs
- 🎉 (hooray) = Display ads
- 👀 (eyes) = PIX (Brazil)
- 👎 (-1) = Other

**Login (#5543):**
- 👍 (+1) = Google
- 😄 (laugh) = Discord
- ❤️ (heart) = Email+Password
- 🚀 (rocket) = Phone OTP
- 🎉 (hooray) = WeChat
- 👀 (eyes) = Wallet/ETH
- 👎 (-1) = Other

### 3. Generate ASCII diagram
Create a phrack-style box diagram:
```
.--[ TITLE | X votes ]---------------------------------------------------------.
|                                                                               |
|  VOTES BY CATEGORY                                 STATUS                     |
|  ────────────────                                  ──────                     |
|  🎉 WINNER    ██████████████████████████████ XX    ✓ shipped / ⏳ backlog    |
|  👍 SECOND    ████████████████████ XX              ⏳ status                  |
|  ...                                                                          |
|                                                                               |
|  ✅ SHIPPED: List what's already done                                        |
|  🏆 LEADER: Highlight the top vote-getter                                    |
'-------------------------------------------------------------------------------'
```

Bar length formula: `Math.round(votes / maxVotes * 30)` █ characters

### 4. Post to GitHub issue as comment
// turbo
Use `mcp1_add_issue_comment`:
```
owner: pollinations
repo: pollinations
issue_number: <ISSUE_NUMBER>
body: <DIAGRAM_WITH_HEADER>
```

### 5. Post to Discord channels
// turbo
Use `mcp0_discord_send` for all 3 channels:
```
channelId: 889573359111774329   (chat)
channelId: 1432378056126894343  (pollen-beta)
channelId: 1339346975690068008  (news-polls)
message: <DIAGRAM_WITH_VOTING_LINK>
```

## Example Output

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
|  ...                                                                          |
'-------------------------------------------------------------------------------'
\`\`\`

🗳️ **Vote here:** https://github.com/pollinations/pollinations/issues/XXXX
```

## Notes
- Keep diagrams under 2000 chars for Discord
- Use gen-z friendly language ("we been cooking fr fr 🔥")
- Always include link to the GitHub issue for voting
- Sort categories by vote count (highest first)
