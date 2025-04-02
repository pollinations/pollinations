# Impact Publisher API Integration

This folder contains a script to fetch ads from the Impact Publisher API.

## Prerequisites

1. Node.js and npm installed
2. Impact Publisher account with API access enabled
3. API credentials:
   - Account SID
   - Auth Token

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

Run the script with:
```
node script.js
```

The script will:
1. Authenticate with the Impact API using HTTP Basic Auth
2. Fetch all available ads in your catalog (with pagination)
3. Display summary information about the first 5 ads
4. Output the total number of ads found

## Customization

You can modify the script to:
- Filter ads by specific criteria
- Change the page size (`PAGE_SIZE` constant)
- Process the ads for different purposes (store in a database, generate HTML, etc.)

## API Documentation

For more information about the Impact Publisher API, visit:
https://integrations.impact.com/impact-publisher/reference/overview 