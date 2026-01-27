# Billing Discrepancy Analysis

## Key Finding: No Markup Applied

**CRITICAL ISSUE**: The system is charging users exactly what we pay providers (0% markup).

### Evidence

1. **Code Analysis** (shared/registry/registry.ts:120):
   - Service registry copies cost directly to price: `price: sortDefinitions([...service.cost])`
   - No markup multiplier applied anywhere

2. **Tinybird Data Verification**:
   - Query: Last 10 minutes of billing data
   - Result: `total_price === total_cost` for ALL models
   - Profit margin: 0% across the board

3. **Example Data** (from live logs):
   - Flux: price=$0.0002, cost=$0.0002 (should have markup)
   - Gemini-fast: price=$0.0001053, cost=$0.0001053
   - Nova-fast: price=$0.0000341, cost=$0.0000341

## Data Flow

1. **Request Processing**:
   - User makes API request → enter.pollinations.ai
   - Proxy to backend service (image/text)
   - Response includes usage data

2. **Billing Calculation** (middleware/track.ts):
   - Cost: `calculateCost(modelId, usage)` - uses MODEL_REGISTRY costs
   - Price: `calculatePrice(serviceId, usage)` - uses SERVICE_REGISTRY prices
   - But SERVICE_REGISTRY prices = costs (no markup)

3. **Balance Updates**:
   - D1: User balance decremented by `total_price`
   - API Key budget: Decremented by `total_price` 
   - Tinybird: Event logged with `total_price` and `total_cost`

## Impact

- **Revenue = Cost**: We're running at 0% margin
- Every API call loses money when accounting for:
  - Infrastructure overhead
  - Cloudflare Workers costs
  - Storage (R2, D1)
  - Bandwidth
  - Operational costs

## Recommended Fix

Add a markup multiplier in the SERVICE_REGISTRY construction or in the price calculation functions. Typical SaaS markup: 20-50% above cost.
