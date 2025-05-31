# Processing Special Bee Requests: Standard Operating Procedure

## Overview
This document outlines the process for handling special bee requests in the Pollinations repository. Special bee requests allow external projects to use Pollinations' image and text generation APIs by whitelisting their domains/tokens.

## Step 1: Identify Valid Requests
- Search GitHub issues with `label:special-bee-request state:open`
- Verify each issue uses the proper template with required fields:
  - Project Name
  - Project Description
  - Project URL
  - Contact Information
  - Domain/Referrer to Approve

## Step 2: Evaluate Request Validity
- Check that the domain/token is appropriate (lowercase, simple)
- Ensure project appears legitimate
- If insufficient information, comment requesting details and keep open
- If clearly spam/inappropriate, close with explanation

## Step 3: Process Valid Requests
1. **Document the token in tokens_to_add.txt**:
   ```
   ## [Project Name] (Issue #XXXX)
   
   ### Project Description
   [Copy description from issue]
   
   ### Project URL
   [URL from issue]
   
   ### Domain/Referrer
   [token]
   ```

2. **Comment on the issue**:
   ```
   Your token `[token]` has been approved and will be added to our systems immediately. You can use this as your referer/token.
   
   ```
   [token]
   ```
   
   We're implementing an authentication system which will allow you to generate a token or an API key soon. Please re-open if you encounter any problems.
   ```

3. **Close the issue**

## Step 4: Update Environment Files
Add the approved tokens to:

1. **text.pollinations.ai/.env**:
   - Locate `WHITELISTED_DOMAINS=` line
   - Add the new token to the comma-separated list

2. **image.pollinations.ai/.env**:
   - Locate `VALID_TOKENS=` line
   - Add the new token to the comma-separated list

## Step 5: Maintain Token Documentation
- Keep tokens_to_add.txt updated with all processed requests
- Maintain summary sections at the top:
  ```
  ### For text.pollinations.ai/.env (WHITELISTED_DOMAINS)
  - [list of all tokens]
  
  ### For image.pollinations.ai/.env (VALID_TOKENS)
  - [list of all tokens]
  ```

## Recent Processing Progress

**LATEST PROCESSED (May 31, 2025):**
15. **#2080 (GPT-API)** - STANDARD RESPONSE: Minimal description, personal use
16. **#2075 (AI brainrot image)** - STANDARD RESPONSE: Personal use, no GitHub repo
17. **#2084 (Wisdom-Core)** - FLAGGED for flower tier: Educational AI tutor with live website
18. **#2031 (ahmadi)** - STANDARD RESPONSE: Minimal "dev bot" description
19. **#2168 (MODA)** - STANDARD RESPONSE: Minimal description, no GitHub repo
20. **#1957 (A4F)** - FLAGGED for flower tier: Detailed project with clear use case
21. **#2190 (UnrestrictedGPT)** - STANDARD RESPONSE: Discord bot, no URL/GitHub repo
22. **#2147 (udeki.com)** - FLAGGED for flower tier: Educational platform with CEO request
23. **#2137 (ABU AI)** - FLAGGED for flower tier: Cross-platform AI assistant with live website
24. **#2091 (School District Query)** - FLAGGED for flower tier: Educational platform with existing website
25. **#2062 (pinblogai)** - FLAGGED for flower tier: Content creation tool with live website

### Response Style Improvements:
- **Concise format** based on user feedback
- **Direct @username mentions** for personalization
- **Numbered steps** for clarity
- **Emoji usage** (🌱🌸🐝⚡🤖🚀) for visual appeal
- **@thomash flagging** for promising projects

### Flagging Criteria for Flower Tier:
- **High usage potential**: Projects likely to generate significant API usage
- **Revenue opportunity**: Commercial applications or business tools
- **Ecosystem value**: Projects that showcase Pollinations capabilities
- **Innovation factor**: Unique or creative use cases
- **Partnership potential**: Professional teams or established companies

## Token Guidelines
- Use lowercase for new tokens
- Keep tokens simple, preferably matching the domain
- Maintain original casing for previously communicated tokens
- Both text and image services should have identical token lists

## Handling Internal Tasks
- Remove the `special-bee-request` label from internal tasks
- Comment explaining the label removal
- Use appropriate alternative labels (e.g., "Analytics")

## Deployment
- After processing batches of requests, manually restart services or notify DevOps
- No need to restart services after each individual token addition

## Troubleshooting
- If users report issues, verify token is properly added to both environment files
- Check for typos or case sensitivity issues
- For Cloudflare-related issues, may need to run tunnel cleanup and restart

## Metrics
- Track number of requests processed
- Document types of projects using the service
- Note any patterns in usage or request volume
