# Nex.Ad Migration Guide

## Overview
The text.pollinations.ai ad system has been migrated from the LLM-based affiliate system to use the Nex.Ad API. This provides:
- Dynamic ad selection based on conversation context
- Real-time ad relevance without requiring local LLM processing
- Simplified architecture with Ko-fi as a fallback

## Key Changes

### 1. Ad Selection Flow
**Before**: 
- Use LLM to match conversation content with affiliate programs
- Generate contextual ad text using LLM
- Redirect clicks through pollinations.ai/redirect

**After**:
- Send conversation context to Nex.Ad API
- Receive pre-formatted ads with click tracking
- Clicks go directly to Nex.Ad tracking URLs
- Ko-fi donation link as fallback when no ads available

### 2. Click Tracking
- **Nex.Ad ads**: Direct to Nex.Ad click_through URLs (no local redirect)
- **Ko-fi fallback**: Still uses pollinations.ai/redirect/kofi

### 3. Analytics
Enhanced tracking with:
- `ad_source`: 'nexad' or 'kofi_fallback'
- Nex.Ad specific fields: tid, campaign_id, ad_id
- Maintained existing Google Analytics integration

## Implementation Details

### New Modules
1. **nexAdClient.js**: Handles Nex.Ad API requests
   - Extracts visitor data from request headers
   - Formats conversation context
   - Manages API timeouts and error handling

2. **nexAdFormatter.js**: Processes Nex.Ad responses
   - Converts HTML ads to markdown format
   - Extracts tracking data
   - Sends impression tracking requests

### Modified Modules
- **initRequestFilter.js**: Simplified to use Nex.Ad with Ko-fi fallback
- **adUtils.js**: Updated helper functions for the new flow

## Testing
```bash
# Run the service locally
npm start

# Test with curl
curl -X POST http://localhost:3000/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Tell me about AI p-ads"}],
    "stream": false
  }'
```

## Analytics Events
- **ad_impression**: When an ad is shown
  - Includes: ad_source, campaign_id (nexad), affiliate_id (kofi)
- **ad_clicked**: When a user clicks an ad
  - Tracked by Nex.Ad for their ads
  - Tracked by redirect function for Ko-fi

## Next Steps
1. Configure Nex.Ad API credentials
2. Monitor ad performance metrics
3. Eventually remove unused affiliate matching code
4. Update redirect function to only handle Ko-fi
