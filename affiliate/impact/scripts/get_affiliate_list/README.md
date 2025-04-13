# Affiliate List Generator

This directory contains scripts to generate a combined affiliate list from the Impact Publisher API and custom affiliates.

## Pipeline Controllers

- **get_affiliates_list.js**: Main Node.js entry point that orchestrates the full pipeline (Steps 1-7).
- **create_affiliate_list.sh**: A shell script for manually running the first four steps of the pipeline sequentially. Useful for debugging or generating intermediate data. It creates timestamped intermediate files and outputs the result of Step 4 directly to `output/affiliate_list.json`. **It does not perform cleanup, Markdown generation, or JavaScript generation (Steps 5-7).**

## Pipeline Stages

*These stages describe the full pipeline executed by `get_affiliates_list.js`. The `create_affiliate_list.sh` script only executes steps 1 through 4.*

1.  **1_impact_tracking_links.js**
    - Fetches programs from the Impact Publisher API
    - Generates tracking links for each program
    - Uses MediaPartnerPropertyId from `.env` file
    - Outputs a JSON array of programs with tracking links to stdout
    - Intermediate output saved as `intermediate_results/1_impact_tracking_links_YYYY-MM-DDTHH-MM-SS.json`

2.  **2_impact_tracking_links_enrich.js**
    - Reads tracking links from stdin
    - Fetches additional campaign details from Impact API
    - Adds campaign details to each tracking link
    - Outputs enriched tracking links as JSON to stdout
    - Intermediate output saved as `intermediate_results/2_impact_tracking_links_enrich_YYYY-MM-DDTHH-MM-SS.json`

3.  **3_custom_ad_combine.js**
    - Reads enriched tracking links from stdin
    - Loads custom affiliates from `custom_affiliate_list.json`
    - Formats custom affiliates to match Impact API format
    - Adds `isCustomAffiliate=true` flag to custom affiliates
    - Combines both sets and outputs to stdout
    - Intermediate output saved as `intermediate_results/3_custom_ad_combine_YYYY-MM-DDTHH-MM-SS.json`

4.  **4_ad_llm_enrich.js**
    - Reads combined data from stdin
    - Sends details to Pollinations LLM API for analysis
    - Adds audience, product, and category data
    - Generates trigger words for each affiliate (single words only)
    - Outputs enriched data as JSON
    - Intermediate output saved as `intermediate_results/4_ad_llm_enrich_YYYY-MM-DDTHH-MM-SS.json`

## Output

### Intermediate Output (`intermediate_results/`)

All intermediate outputs are stored in the `intermediate_results/` directory, named with a timestamp:
- `1_impact_tracking_links_YYYY-MM-DDTHH-MM-SS.json`
- `2_impact_tracking_links_enrich_YYYY-MM-DDTHH-MM-SS.json`
- `3_custom_ad_combine_YYYY-MM-DDTHH-MM-SS.json`
- `4_ad_llm_enrich_YYYY-MM-DDTHH-MM-SS.json`
- `5_cleanup_format_YYYY-MM-DDTHH-MM-SS.json` (Only created by `get_affiliates_list.js`)

### Final Output (`output/`)

- **When using `get_affiliates_list.js`**:
    - `affiliates.js`: JavaScript module for import by the application.
    - `affiliates.md`: Markdown documentation for reference.
- **When using `create_affiliate_list.sh`**:
    - `affiliate_list.json`: Raw JSON output from Step 4 (`4_ad_llm_enrich.js`).

## Usage

**To run the complete pipeline (recommended):**

```bash
node get_affiliates_list.js
```

**To run the manual shell script pipeline (Steps 1-4 only):**

```bash
./create_affiliate_list.sh
```
*This is useful for debugging individual steps or if you only need the raw data from Step 4.*

**To run individual stages for testing:**

```bash
# Example: Generate tracking links only
node 1_impact_tracking_links.js > output/intermediate_results/test_output_step1.json

# Example: Generate and enrich tracking links
cat output/intermediate_results/test_output_step1.json | node 2_impact_tracking_links_enrich.js > output/intermediate_results/test_output_step2.json

# Example: Generate markdown only (requires output from step 5, likely named final_result.json or similar)
# node 6_generate_markdown.js # This may require the full pipeline via get_affiliates_list.js to run first
```

## Environment Variables

Make sure these are set in your `.env` file:

```
IMPACT_ACCOUNT_SID=your_account_sid
IMPACT_AUTH_TOKEN=your_auth_token
IMPACT_API_BASE_URL=https://api.impact.com
IMPACT_MEDIA_PARTNER_PROPERTY_ID=your_media_property_id
POLLINATIONS_REFERRER=your_referrer_name (optional)
```

## Debugging

Each script includes detailed logging with prefixes:
- `[DEBUG]` - General debug information
- `[enrich_tracking]` - From the tracking link enrichment script
- `[combine_affiliates]` - From the affiliate combination script
- `[analyze_link]` - From the LLM analysis script
- `[cleanup]` - From the cleanup and format script
- `[markdown]` - From the markdown generation script
- `[Pipeline]` - From the main controller (`get_affiliates_list.js`)

## Dependencies

- axios - For HTTP requests
- dotenv - For environment variables 