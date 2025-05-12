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
