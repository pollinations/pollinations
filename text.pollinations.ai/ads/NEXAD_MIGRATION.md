# nex.ad Migration Guide

## Overview
This branch implements nex.ad integration for the text.pollinations.ai ad system with a feature flag for gradual rollout.

## Environment Variables

### Required for nex.ad
- `NEX_AD_ENDPOINT` - nex.ad API endpoint (default: https://api-prod.nex-ad.com/ad/request/v2)

### Feature Flags
- `USE_NEX_AD` - Enable nex.ad integration (true/false, default: false)
- `NEX_AD_ROLLOUT_PERCENTAGE` - Percentage of requests to use nex.ad (0-100, default: 0)
- `FALLBACK_TO_AFFILIATES` - Fallback to affiliate system if nex.ad fails (true/false, default: true)

## Testing

### Test with nex.ad only (no fallback)
```bash
USE_NEX_AD=true NEX_AD_ROLLOUT_PERCENTAGE=100 FALLBACK_TO_AFFILIATES=false npm start
```

### Test with 50% rollout
```bash
USE_NEX_AD=true NEX_AD_ROLLOUT_PERCENTAGE=50 npm start
```

### Test with affiliate system only (current behavior)
```bash
USE_NEX_AD=false npm start
```

## Key Changes

1. **New Modules**:
   - `nexAdClient.js` - Handles nex.ad API requests
   - `nexAdFormatter.js` - Formats nex.ad responses to markdown
   - `adConfig.js` - Feature flag configuration

2. **Modified Files**:
   - `initRequestFilter.js` - Added nex.ad integration with feature flag

3. **Click Tracking**:
   - With nex.ad: Uses nex.ad's click_through URLs directly
   - With affiliates: Still uses pollinations.ai/redirect/

## Analytics

Both systems track the same metrics with an additional `ad_source` field:
- `ad_source: 'nexad'` - Ad served by nex.ad
- `ad_source: 'affiliate'` - Ad served by affiliate system

## Rollback

To instantly rollback to affiliate system:
1. Set `USE_NEX_AD=false`
2. Or set `NEX_AD_ROLLOUT_PERCENTAGE=0`

## Next Steps

1. Get nex.ad API credentials
2. Test in development
3. Gradual rollout:
   - Start with 5% (NEX_AD_ROLLOUT_PERCENTAGE=5)
   - Monitor metrics
   - Increase gradually to 100%
4. Remove affiliate system code once stable
