# Affiliate Integration System

This project integrates the Impact Publisher API and custom affiliates to generate a combined affiliate list for Pollinations.

## Prerequisites

1. Node.js and npm installed
2. Impact Publisher account with API access enabled
3. API credentials:
   - Account SID
   - Auth Token
4. Access to Pollinations LLM API

## Setup

1. Update the root `.env` file with your Impact Publisher API credentials:
   ```
   IMPACT_ACCOUNT_SID=YourActualAccountSid
   IMPACT_AUTH_TOKEN=YourActualAuthToken
   IMPACT_API_BASE_URL=https://api.impact.com
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Usage

Run the pipeline with:
```
node impact/scripts/get_affiliate_list/get_affiliates_list.js
```

The script will:
1. Fetch ads from the Impact API
2. Enrich each ad with additional campaign details 
3. Combine with custom affiliates from custom_affiliate_list.json
4. Use Pollinations LLM to analyze and categorize all affiliates
5. Output a combined JSON file with all ads

## Pipeline Components

The affiliate pipeline consists of four main scripts:

1. **1_impact_ad_fetch.js** - Fetches ads from the Impact API
2. **2_impact_ad_enrich.js** - Enriches ads with campaign details
3. **3_extra_ad_combine.js** - Combines Impact ads with custom affiliates
4. **4_ad_llm_enrich.js** - Adds audience, product and category data via LLM

The main pipeline controller is `get_affiliates_list.js` which orchestrates all four scripts.

## Custom Affiliates

To add your own custom affiliates, edit the `custom_affiliate_list.json` file in the root directory.
Each affiliate should include the following fields:

```json
{
  "id": "unique_id",
  "type": "TEXT_LINK",
  "trackingLink": "https://example.com/?ref=your_ref_link",
  "landingPageUrl": "https://example.com/",
  "advertiserName": "Example Company",
  "mobileReady": "true",
  "language": "ENGLISH",
  "description": "Description of the affiliate product",
  "topSeller": "false",
  "labels": "label1,label2,label3"
}
```

## Consolidated Affiliate Data

The `affiliates.js` file serves as the single source of truth for all affiliate information used across the Pollinations platform. This file:

1. Consolidates data from both `pollinations.ai/functions/affiliate_mapping.js` and `text.pollinations.ai/ads/affiliate_prompt.js`
2. Provides rich metadata for each affiliate (ID, name, product, description, audience, categories, tags, tracking links)
3. Supports both CommonJS and ES modules for compatibility across different parts of the application
4. Includes utility functions for generating markdown (for LLM prompting) and creating redirect mappings

### Usage in Other Files

The consolidated affiliate data is used in:

- `pollinations.ai/functions/redirect.js` - For handling redirects to affiliate links
- `pollinations.ai/functions/affiliate_mapping.js` - For backward compatibility
- `text.pollinations.ai/ads/affiliate_prompt.js` - For ad generation and content matching
- `text.pollinations.ai/ads/adLlmMapper.js` - For finding relevant affiliates based on content

### Data Structure

Each affiliate in the consolidated file includes:

```javascript
{
  id: "unique_id",
  name: "Affiliate Name",
  product: "Product description",
  description: "Detailed description of the affiliate product",
  audience: "Target audience description",
  categories: ["Category1", "Category2"],
  tags: ["tag1", "tag2"],  // Optional
  nsfw: true,              // Optional, for adult content
  ad_text: "Custom ad text with {url} placeholder",  // Optional
  trackingLink: "https://example.com/?ref=your_ref_link"
}
```

## Output Format

The final output is stored in `impact/scripts/get_affiliate_list/result/` with filenames following the format:
`get_affiliate_list_YYYYMMDD_HHMM.json`

## API Documentation

For more information about the Impact Publisher API, visit:
https://integrations.impact.com/impact-publisher/reference/overview 