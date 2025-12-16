# Environment Variable Migration Guide (CRA → Vite)

## Changes Made

### 1. Variable Prefix Changes
- **Old CRA format**: `REACT_APP_*`
- **New Vite format**: `VITE_*`

### 2. Backend Functions (Netlify Functions)
- Updated `functions/redirect.js` and `functions/redirect-nexad.js`
- Added fallback support for both old and new variable names:
  ```javascript
  const measurementId = process.env.VITE_GA_MEASUREMENT_ID || process.env.GA_MEASUREMENT_ID;
  const apiSecret = process.env.VITE_GA_API_SECRET || process.env.GA_API_SECRET;
  ```

### 3. Frontend Code
- ✅ No environment variables currently used in frontend (uses window.gtag)
- When adding env vars to frontend, use: `import.meta.env.VITE_*`

### 4. Required Environment Variables
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Fill in your actual values:
- `VITE_GA_MEASUREMENT_ID` - Google Analytics measurement ID
- `VITE_GA_API_SECRET` - Google Analytics API secret

### 5. Netlify Deployment
Make sure to update your Netlify environment variables:
1. Go to Site settings → Environment variables
2. Add new variables with VITE_ prefix
3. Keep old GA_MEASUREMENT_ID and GA_API_SECRET as fallback

### 6. Testing
After setting up environment variables:
```bash
npm run build  # Should work without errors
npm run dev    # Should load with env vars
```

## Common Issues
- **Build fails**: Check that all env vars in code use VITE_ prefix
- **Analytics not working**: Verify Netlify env vars are set correctly
- **Functions error**: Check Netlify functions logs for missing env vars