# Pollinations.AI Model Usage Analysis Report
*Generated on: June 9, 2025*

## Overview

This report analyzes model usage patterns for Pollinations.AI's top users based on historical metrics data. The data was retrieved from the authentication database using the `common-sql-queries.sh` tool, specifically focusing on metrics related to model calls.

## Top Model Users

| Username | Total Model Calls | Primary Model | Primary Model Calls | Other Notable Models | Ad Impressions | Associated Domains |
|----------|------------------|---------------|---------------------|----------------------|---------------|-------------------|
| v1-05 | 32,712 | llamascout | 32,968 | - | 1 | None registered |
| voodoohop | 15,956 | openai | 15,753 | - | 8 | pollinations.ai, image.pollinations.ai, pollinations.github.io, github.com, websim.pollinations.ai |
| hlohaus | 10,294 | Multiple | - | gpt-4o (2,780), openai-large (2,777), gpt-4o-mini (1,097) | 4,913 | gpt4free.github.io |
| ElliotEtag | 5,221 | openai-large | 3,051 | searchgpt (1,036), openai (890) | 1,647 | pollinations.ai |
| seamini | 1,821 | openai | 1,863 | deepseek-reasoning (5) | 0 | None registered |
| liveng-wind | 1,802 | openai | 1,909 | deepseek-reasoning (4) | 0 | None registered |
| YOHOAI | 1,770 | openai | 1,840 | deepseek-reasoning (3) | 0 | hk.chat, image.hk.chat, inbay.io, audio.hk.chat |
| unqownexe | 1,635 | openai | 1,677 | - | 26 | loungeapps.com, localhost |
| p0llinati0ns | 1,224 | openai-roblox | 785 | openai (455), mistral (2) | 169 | None registered |
| ponxtm | 1,102 | openai | 1,125 | - | 129 | irjh.top |

## Key Observations

### Usage Patterns

1. **Most Active User**: User v1-05 has generated the highest number of model calls (32,712), exclusively using the llamascout model.

2. **Model Preferences**:
   - Most top users primarily use OpenAI models
   - The openai model family appears to be the most popular choice
   - User hlohaus shows the most diverse model usage pattern, with calls to over 30 different models

3. **Specialized Use Cases**:
   - User v1-05's exclusive use of llamascout suggests a specialized use case
   - ElliotEtag shows significant usage of searchgpt (1,036 calls), indicating potential search-focused applications

### Data Quality

1. **Discrepancies**:
   - Some users show more model-specific calls than total model calls
   - For example, seamini has 1,869 specific model calls but only 1,821 total model calls
   - This suggests potential tracking inconsistencies in the metrics system

2. **Ad Engagement**:
   - hlohaus has the highest ad impression count (4,913) with 47 ad clicks
   - ElliotEtag shows moderate ad engagement with 1,647 impressions and 200 clicks (highest click-through rate)
   - Some power users have minimal ad engagement

## Individual User Profiles

### v1-05 (ID: 124743234)
```json
{"ad_impressions":1,"model_calls":32712,"models.llamascout":32968}
```
This user appears to be running automated workflows or batch processes with llamascout, given the high volume and singular model usage. No domains are registered to this user, suggesting they may be primarily using the API rather than embedding on a website.

### voodoohop (ID: 5099901)
```json
{"ad_clicks":12,"ad_impressions":8,"models.openai":15753,"model_calls":15956}
```
Primary developer with consistent OpenAI model usage and minimal ad interaction. Has multiple registered domains including the core Pollinations platforms (pollinations.ai, image.pollinations.ai, websim.pollinations.ai), suggesting they are likely a platform administrator or core team member.

### hlohaus (ID: 983577)
Extensive model diversity with usage across many different models. Most diverse user with high ad impression count, suggesting frequent platform usage with UI exposure. Has registered the domain gpt4free.github.io, which may indicate they're running a free GPT service that integrates with Pollinations.

### ElliotEtag (ID: 36901823)
Balanced usage across openai-large, searchgpt, and standard openai models. Higher than average ad click-through rate. Has registered the pollinations.ai domain, suggesting they're embedding Pollinations functionality on the main site itself.

### YOHOAI (ID: 144528119)
```json
{"model_calls":1770,"models.openai":1840,"models.deepseek-reasoning":3}
```
Pattern similar to other users who primarily use the OpenAI model. Has registered four domains including hk.chat and related subdomains, indicating a multi-service deployment possibly targeting Hong Kong users.

### unqownexe (ID: 76444282)
```json
{"ad_impressions":26,"model_calls":1635,"models.openai":1677}
```
Consistent OpenAI model user with loungeapps.com domain registered, likely integrating Pollinations functionality into a commercial product.

### p0llinati0ns (ID: 213228017)
```json
{"ad_impressions":169,"models.openai-roblox":785,"models.openai":455,"model_calls":1224,"models.mistral":2,"models.searchgpt":1}
```
Notable for being the only top user with significant openai-roblox model usage, suggesting integration with Roblox platform. Username appears related to Pollinations but no domains are registered.

### ponxtm (ID: 201316572)
```json
{"ad_impressions_nexad":7,"ad_impressions":129,"models.openai":1125,"model_calls":1102}
```
Similar pattern to other OpenAI model users with a single domain (irjh.top) registered. Moderate ad impression count relative to model calls.

## Domain Integration Patterns

We can identify several distinct usage patterns based on domain registrations:

1. **Platform Administrators** (e.g., voodoohop)
   - Multiple pollinations.ai domains registered
   - Moderate model usage spread across few models
   - Likely using the system for development and administration

2. **API Integration Users** (e.g., v1-05, seamini, liveng-wind, p0llinati0ns)
   - No registered domains or minimal domain registration
   - High volume of calls to specific models
   - Likely accessing functionality programmatically rather than through embedded components
   - p0llinati0ns shows specialized usage with openai-roblox model

3. **Multi-Service Integrators** (e.g., YOHOAI)
   - Multiple related domains registered (hk.chat ecosystem)
   - Focused usage on a single model type
   - Likely building a suite of AI services localized for specific regions

4. **Single Service Embedders** (e.g., hlohaus, ElliotEtag, unqownexe, ponxtm)
   - Specific domains registered that are not part of the Pollinations core platform
   - Mixed model usage patterns
   - Integrating Pollinations functionality into their own websites/applications

## Implications for System Optimization

1. **Reducing DB Load**
   - The decision to disable metrics logging will reduce database load while preserving other functionality
   - Historical metrics data remains available for analysis through SQL queries

2. **User Blocking**
   - The blocking functionality for specific users (e.g., thespecificdev with ID 130377422) has been preserved

3. **Domain-Specific Optimizations**
   - Consider implementing different rate limits or resource allocations based on domain usage patterns
   - High-volume API users without registered domains may need different optimization strategies
   - Users with registered domains might benefit from domain-specific caching or CDN strategies

4. **Future Considerations**
   - Consider separate tracking for high-volume API users vs. web interface users
   - Review metrics tracking implementation to address data discrepancies
   - Evaluate model-specific resource allocation based on usage patterns

## Conclusion

The model usage data provides valuable insights into how Pollinations.AI services are being utilized. While we've disabled ongoing metrics collection to reduce database load, the existing data continues to offer a useful reference for understanding user behavior and system performance.

*Report generated as part of the `feature/remove-metrics` branch changes.*
