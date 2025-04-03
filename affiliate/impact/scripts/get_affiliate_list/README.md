# Affiliate List Generator

This directory contains scripts to generate a combined affiliate list from Impact Publisher API and custom affiliates.

## Pipeline Controller

- **get_affiliates_list.js** - Main entry point that orchestrates the pipeline

## Pipeline Stages

1. **1_impact_ad_fetch.js**
   - Fetches ads from the Impact Publisher API
   - Authenticates using credentials from .env file
   - Outputs a JSON array of ads to stdout

2. **2_impact_ad_enrich.js**
   - Reads ads from stdin
   - Fetches additional campaign details from Impact API
   - Adds campaign details to each ad
   - Outputs enriched ads as JSON to stdout

3. **3_custom_ad_combine.js**
   - Reads enriched ads from stdin
   - Loads custom affiliates from custom_affiliate_list.json
   - Formats custom affiliates to match Impact API format
   - Adds isCustomAffiliate=true flag to custom affiliates
   - Combines both sets and outputs to stdout

4. **4_ad_llm_enrich.js**
   - Reads combined ads from stdin
   - Sends details to Pollinations LLM API for analysis
   - Adds audience, product, and category data
   - Outputs final enriched ads as JSON

## Output

The final output is stored in the `result/` directory with filenames in the format:
`get_affiliate_list_YYYYMMDD_HHMM.json`

## Usage

To run the complete pipeline:

```bash
node get_affiliates_list.js
```

To run individual stages for testing:

```bash
node 1_impact_ad_fetch.js > test_output.json
```

## Debugging

Each script includes detailed logging with prefixes:
- `[DEBUG]` - General debug information
- `[enrich_ad]` - From the ad enrichment script
- `[combine_affiliates]` - From the affiliate combination script
- `[analyze_link]` - From the LLM analysis script
- `[Pipeline]` - From the main controller

## Dependencies

- axios - For HTTP requests
- dotenv - For environment variables 