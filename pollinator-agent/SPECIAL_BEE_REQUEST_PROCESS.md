# Special Bee Request Process (Updated August 2025)

## Overview
Special Bee requests are processed through our tier-based authentication system. **Most requests should receive standard responses** directing users to register at enter.pollinations.ai for seed tier access. Only exceptional projects should be considered for flower tier review.

## Important Notice
We are implementing a new system in **early September 2025** that may change how tiers work. Current tier assignments may be adjusted as part of this update.

## Process

### Step 1: Evaluate Request Quality
**DEFAULT: Give standard response unless project is truly exceptional**

- Check for live website with real users
- Verify professional team or established organization  
- Look for clear business model or educational value
- Assess potential for meaningful partnership

### Step 2: Choose Response Type

#### Standard Response (Most requests):
```markdown
Hi @username! 👋

Thanks for your interest in Pollinations! 

## 🌱 Get Started

1. **Register**: https://enter.pollinations.ai
2. **Sign in** with GitHub (@username)
3. **Get seed tier** access with improved rate limits
4. **Start building** your project

## Important Update
We're implementing a new system in early September 2025 that may adjust how tiers work. Please register to get started with current access levels.

Happy coding! 🐝
```

#### Exceptional Projects Only (Rare cases):
```markdown
Hi @username! 👋

Thanks for sharing your [project type] - it looks very promising!

## 🌱 Get Started

1. **Register**: https://enter.pollinations.ai
2. **Sign in** with GitHub (@username)
3. **Get seed tier** access with improved rate limits

## 🌸 Flower Tier Review
I'm flagging this for **flower tier** review based on [brief reason]. This provides enhanced access for qualifying projects.

Please register first, then we'll follow up on the upgrade.

## Important Update
We're implementing a new system in early September 2025 that may adjust how tiers work. Current assignments may change as part of this update.

@thomash - Flagged for flower tier review - [brief reason]

Happy coding! 🐝
```

### Step 3: Process Approved Flower Tier Requests

For requests that have been approved for flower tier:

1. **Set the tier**:
   ```bash
   cd /home/ubuntu/pollinations/enter.pollinations.ai
   node scripts/set-tier.js [USER_ID] flower --remote
   ```

2. **Comment with approval**:
   ```markdown
   Hi @username! 👋

   ## 🌸 Flower Tier Approved

   Your [project name] has been approved for flower tier access with enhanced rate limits and model access.

   ## Next Steps

   1. **Register**: https://enter.pollinations.ai
   2. **Sign in** with your GitHub account (@username)
   3. **Start building** - your enhanced access is now active

   ## Important Update
   We're implementing a new system in early September 2025 that may adjust how tiers work. Your current access level may change as part of this update.

   We're excited to see what you build!

   Happy coding! 🐝
   ```

3. **Close the issue** to keep the queue clean

### Step 4: Close Issue
After posting response, close the issue to maintain organization.

---

## Flagging Criteria for Flower Tier

**⚠️ BE VERY SELECTIVE - Most requests should get standard responses**

Only flag for flower tier if the project meets **MULTIPLE** of these strict criteria:
- **Proven traction**: Live website with existing users/traffic
- **Business model**: Clear revenue potential or commercial application
- **Professional team**: Company/organization with established presence
- **High-value use case**: Educational institutions, enterprise tools, or significant innovation
- **Gaming platforms**: Roblox, Minecraft, Discord bots, and similar gaming integrations (priority focus area)
- **Partnership potential**: Could lead to meaningful collaboration or showcase value

**RED FLAGS - Do NOT flag:**
- Personal projects or hobby apps
- Minimal descriptions or "testing" purposes
- No live website or GitHub repository
- Generic AI assistants without unique value proposition

**DEFAULT APPROACH**: When in doubt, give standard response directing to enter.pollinations.ai

## Response Guidelines

### Tone and Style
- **Professional and modest**: Avoid overpromising capabilities
- **Concise**: Keep responses brief and actionable
- **Personal**: Use @username mentions
- **Helpful**: Provide clear next steps
- **Honest**: Mention upcoming system changes

### What NOT to Say
- "Unlimited usage" or "no limits"
- "SOTA models" or technical jargon
- Overly promotional language
- Promises about specific features

### What TO Include
- Clear registration steps
- Mention of upcoming system changes in September
- Appropriate tier level (seed for most, flower for exceptional)
- Professional but friendly tone

## Handling Internal Tasks
- Remove the `special-bee-request` label from internal tasks
- Comment explaining the label removal
- Use appropriate alternative labels (e.g., "Analytics")

## System Changes Notice
All responses should include information about the upcoming system changes in early September 2025, as tier structures and access levels may be adjusted as p of this update.

## Important Service Notes
- **GPTImage model**: Currently not supported/available
