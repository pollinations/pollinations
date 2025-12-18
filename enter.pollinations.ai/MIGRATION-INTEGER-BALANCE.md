# Integer Balance Migration Plan (#6134)

## Problem
Storing money as SQLite `REAL` (float) causes precision errors that compound over time:
- `0.1 + 0.2 = 0.30000000000000004`
- Users end up with `$0.00000001` they can't spend
- Accounting doesn't add up exactly

## Solution
Store all monetary values as `INTEGER` in **micro-pollen** (1 pollen = 1,000,000 micro-pollen).

## Files to Update

### 1. Database Schema (`src/db/schema/event.ts`)
Change ALL `real()` fields to `integer()`:

```diff
  // Pricing (Lines 94-117)
- tokenPricePromptText: real("token_price_prompt_text").notNull(),
+ tokenPricePromptText: integer("token_price_prompt_text").notNull(), // micro-pollen
  
  // Apply to ALL tokenPrice* fields...
  
  // Totals (Lines 148-149)
- totalCost: real("total_cost").notNull(),
- totalPrice: real("total_price").notNull(),
+ totalCost: integer("total_cost").notNull(), // micro-pollen  
+ totalPrice: integer("total_price").notNull(), // micro-pollen
  
  // Cache similarity (Line 192-193) - keep as REAL (not money)
  cacheSemanticSimilarity: real("cache_semantic_similarity"), // OK
  cacheSemanticThreshold: real("cache_semantic_threshold"), // OK
```

### 2. Price Calculations (`shared/registry/registry.ts`)
Convert calculations to use integers:

```typescript
import { toMicroPollen, fromMicroPollen } from "./pollen-precision.ts";

// In convertUsage():
const usageTypeCost = toMicroPollen(
    safeRound(amount * conversionRate, PRECISION)
);

// In calculateCost() / calculatePrice():
const totalCost = toMicroPollen(
    safeRound(Object.values(...).reduce(...), PRECISION)
);
```

### 3. Event Parameter Converters (`src/db/schema/event.ts`)
Update `priceToEventParams()` to convert to micro-pollen:

```typescript
import { toMicroPollen } from "@shared/registry/pollen-precision.ts";

export function priceToEventParams(
    priceDefinition?: PriceDefinition,
): GenerationEventPriceParams {
    return {
        tokenPricePromptText: toMicroPollen(
            priceDefinition?.promptTextTokens || 0
        ),
        // ... apply to all fields
    };
}
```

### 4. Display/API Layer
When returning prices to users, convert back:

```typescript
import { fromMicroPollen } from "@shared/registry/pollen-precision.ts";

// In API responses:
{
    totalPrice: fromMicroPollen(event.totalPrice) // Display as pollen
}
```

### 5. Database Migration
Create Drizzle migration:

```sql
-- Convert existing data (multiply by 1,000,000)
UPDATE event 
SET 
    token_price_prompt_text = CAST(token_price_prompt_text * 1000000 AS INTEGER),
    token_price_prompt_cached = CAST(token_price_prompt_cached * 1000000 AS INTEGER),
    -- ... all tokenPrice* fields ...
    total_cost = CAST(total_cost * 1000000 AS INTEGER),
    total_price = CAST(total_price * 1000000 AS INTEGER);

-- Then alter columns to INTEGER (SQLite requires table recreation)
-- Drizzle will handle this automatically
```

### 6. Cost Estimation (`src/utils/cost-estimation.ts`)
Already returns pollen values - convert to micro-pollen:

```typescript
import { toMicroPollen } from "@shared/registry/pollen-precision.ts";

export function estimateMaxCost(priceDefinition: PriceDefinition): number {
    const estimatedCost = /* calculation */;
    return toMicroPollen(estimatedCost * 1.2); // Return micro-pollen
}
```

### 7. Pending Spend Reservation (`src/durable-objects/PendingSpendReservation.ts`)
Already uses numbers - just document that they're micro-pollen:

```typescript
type Reservation = {
    id: string;
    estimatedCost: number; // micro-pollen (integer)
    timestamp: number;
    status: "pending" | "confirmed" | "released";
};
```

### 8. Balance Checks (`src/middleware/polar.ts`, `src/events.ts`)
`getPendingSpend()` returns sum - ensure it's in micro-pollen:

```typescript
// In getPendingSpend():
const total = toMicroPollen(result[0]?.total || 0);
```

## Testing Checklist
- [ ] Verify smallest price (0.00000015 pollen) converts correctly
- [ ] Test: 0.1 + 0.2 = exactly 0.3 (no `.30000000000000004`)
- [ ] Run calculation: 1000 requests at 0.00000015 pollen each = exact total
- [ ] Verify no users have fractional micro-pollen stuck
- [ ] Test pending spend reservation with integer values
- [ ] Check Polar/Tinybird event delivery with new format

## Rollback Plan
If issues occur:
1. Revert schema changes
2. Divide all integers by 1,000,000 to restore floats
3. Investigation required before re-attempting

## Benefits
- ✅ Exact arithmetic (no rounding errors)
- ✅ No orphaned micro-cents
- ✅ Simpler accounting (integers sum perfectly)
- ✅ Faster comparisons (integer vs float)
- ✅ Industry standard for financial systems
