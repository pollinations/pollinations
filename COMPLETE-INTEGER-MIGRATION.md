# Complete Integer Balance Migration

## ✅ COMPLETED
1. **Schema updated** - All monetary fields changed from `real()` to `integer()` (micro-pollen)
2. **priceToEventParams** - All price conversions wrapped in `toMicroPollen()`
3. **Registry imports** - Added `toMicroPollen` import
4. **totalCost calculation** - Added `toMicroPollen()` wrapper (needs closing paren fix)

## 🔧 REMAINING FIXES (5 minutes)

### 1. Fix registry.ts closing parenthesis (Line 271)
**Current:**
```typescript
const totalCost = toMicroPollen(safeRound(
    Object.values(omit(usageCost, "unit")).reduce(
        (total, cost) => total + cost,
    ),
    PRECISION,
);  // ❌ Missing closing paren for toMicroPollen
```

**Should be:**
```typescript
const totalCost = toMicroPollen(safeRound(
    Object.values(omit(usageCost, "unit")).reduce(
        (total, cost) => total + cost,
    ),
    PRECISION,
    )
); // ✅ Closes both safeRound and toMicroPollen
```

### 2. Fix totalPrice calculation (Line 291-296)
**Add the same pattern:**
```typescript
// Change line 291 from:
const totalPrice = safeRound(

// To:
const totalPrice = toMicroPollen(safeRound(

// Then fix closing (line 296) from:
    PRECISION,
);

// To:
    PRECISION,
    )
); // Convert to micro-pollen (integer)
```

### 3. Update cost-estimation.ts
**File:** `enter.pollinations.ai/src/utils/cost-estimation.ts`

Add import:
```typescript
import { toMicroPollen } from "@shared/registry/pollen-precision.ts";
```

Update return statement (line ~30):
```typescript
// From:
return Math.ceil(estimatedCost * 1.2);

// To:
return toMicroPollen(Math.ceil(estimatedCost * 1.2));
```

### 4. Create Drizzle Migration
```bash
cd enter.pollinations.ai
npx drizzle-kit generate:sqlite
```

This will auto-generate migration from schema changes. Review it to ensure:
- Multiplies existing REAL values by 1,000,000
- Converts columns to INTEGER

### 5. Test with Real Prices
```typescript
// Test file: test-precision.ts
import { toMicroPollen, fromMicroPollen } from "@shared/registry/pollen-precision.ts";

// Smallest price: 0.00000015 pollen (from price list)
const smallest = 0.00000015;
console.log("Smallest price (pollen):", smallest);
console.log("Smallest price (micro-pollen):", toMicroPollen(smallest)); // Should be: 0.15 micro-pollen

// Test arithmetic
const price1 = 0.1;
const price2 = 0.2;
const sum = toMicroPollen(price1) + toMicroPollen(price2);
console.log("0.1 + 0.2 =", fromMicroPollen(sum)); // Should be: 0.3 (exact!)

// Test 1000 requests
const perRequest = 0.00000015;
const total = toMicroPollen(perRequest) * 1000;
console.log("1000 requests total:", fromMicroPollen(total)); // Should be: 0.00015 (exact!)
```

## Quick Fix Commands

```bash
# Fix registry.ts line 271 (add missing closing paren)
# Manual edit or:
sed -i '271s/    );/        )\n    ); \/\/ Convert to micro-pollen (integer)/' shared/registry/registry.ts

# Fix registry.ts line 291 (add toMicroPollen)
sed -i '291s/const totalPrice = safeRound(/const totalPrice = toMicroPollen(safeRound(/' shared/registry/registry.ts

# Fix registry.ts line 296 (add closing paren)
sed -i '296s/    );/        )\n    ); \/\/ Convert to micro-pollen (integer)/' shared/registry/registry.ts
```

## Verification
After fixes:
1. Run TypeScript compiler: `npm run type-check`
2. Run tests: `npm test`
3. Generate migration: `npx drizzle-kit generate:sqlite`
4. Review migration SQL
5. Test with real pricing examples

## Notes
- Cache similarity fields (lines 192-193) kept as `real()` - they're not money
- Response time (line 55) kept as `real()` - it's milliseconds, not money
- All 14 monetary fields converted to integer (micro-pollen)
