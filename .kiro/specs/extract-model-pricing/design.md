# Design Document

## Overview

This design outlines the extraction of pricing information from `availableModels.js` into a dedicated `modelPricing.js` module. The solution maintains backward compatibility while improving separation of concerns and making pricing management more maintainable.

## Architecture

The current architecture has pricing data embedded within model definitions:

```
availableModels.js
├── Model definitions with embedded pricing
├── DEFAULT_PRICING constants
└── Pricing merge logic

costCalculator.js
└── Pricing resolution by original_name lookup
```

The new architecture separates concerns:

```
availableModels.js
└── Clean model definitions (no pricing)

modelPricing.js
├── Pricing data indexed by original_name
├── Default pricing constants
├── Pricing resolution functions
└── Pricing lookup utilities

costCalculator.js
└── Uses modelPricing.js for resolution
```

## Components and Interfaces

### modelPricing.js

**Core Data Structure:**
```javascript
const MODEL_PRICING = {
  "gpt-5-nano-2025-08-07": {
    prompt_text: 0.055,
    prompt_cache: 0.0055,
    completion_text: 0.44
  },
  "gpt-4.1-2025-04-14": {
    prompt_text: 1.91,
    prompt_cache: 0.48,
    completion_text: 7.64
  }
  // ... other models
};
```

**Exported Functions:**
```javascript
// Primary pricing resolution function
export function resolvePricing(originalName, fallbackName = null)

// Get pricing with defaults applied
export function getPricingWithDefaults(originalName, fallbackName = null)

// Check if pricing exists for a model
export function hasPricing(originalName, fallbackName = null)

// Get all pricing data (for admin/debugging)
export function getAllPricing()
```

### Updated availableModels.js

**Removed Elements:**
- All `pricing` objects from model definitions
- `DEFAULT_PRICING` constant
- `modelsWithPricing` processing logic
- Pricing merge operations

**Preserved Elements:**
- All model metadata (name, description, handler, etc.)
- Model lookup functions (findModelByName, getHandler)
- Model processing for vision/audio capabilities

### Updated costCalculator.js

**Changes:**
- Import `resolvePricing` from `modelPricing.js` instead of using availableModels
- Remove direct access to `availableModels` for pricing lookup
- Maintain same function signatures for backward compatibility

## Data Models

### Pricing Schema

```javascript
{
  // Text-based pricing (per million tokens)
  prompt_text?: number,
  completion_text?: number,
  prompt_cache?: number,
  
  // Audio-based pricing (per million tokens)
  prompt_audio?: number,
  completion_audio?: number,
  
  // Legacy fields for backward compatibility
  prompt?: number,
  completion?: number,
  cache?: number
}
```

### Default Pricing

```javascript
const DEFAULT_PRICING = {
  prompt_text: 1.0,
  completion_text: 4.0,
  prompt_cache: 0.25,
  prompt_audio: 0.0,
  completion_audio: 0.0
};
```

## Error Handling

### Pricing Resolution Failures

1. **Missing original_name**: Fall back to model name if provided
2. **No pricing found**: Return null (current behavior)
3. **Invalid pricing data**: Log warning and return null
4. **Malformed pricing object**: Apply defaults for missing fields

### Backward Compatibility

1. **Legacy pricing fields**: Support both new (`prompt_text`) and legacy (`prompt`) field names
2. **Null handling**: Maintain current null-return behavior when pricing not found
3. **API responses**: Continue filtering out pricing from public model listings

## Testing Strategy

### Unit Tests

1. **Pricing Resolution Tests**
   - Test successful pricing lookup by original_name
   - Test fallback to model name when original_name missing
   - Test null return when no pricing found
   - Test default pricing application

2. **Data Integrity Tests**
   - Verify all current models with pricing have entries in new pricing file
   - Validate pricing schema consistency
   - Test pricing data completeness

3. **Integration Tests**
   - Test costCalculator.js with new pricing resolution
   - Verify /models API response excludes pricing
   - Test model lookup functions remain unchanged

### Migration Validation

1. **Before/After Comparison**
   - Compare pricing resolution results before and after migration
   - Verify identical cost calculations for same inputs
   - Validate API response consistency

2. **Edge Case Testing**
   - Test models without pricing (community models)
   - Test models with partial pricing data
   - Test invalid/malformed pricing entries

## Implementation Phases

### Phase 1: Create Pricing Module
- Extract all pricing data from availableModels.js
- Create modelPricing.js with pricing data and resolution functions
- Add comprehensive JSDoc documentation

### Phase 2: Update Dependencies
- Modify costCalculator.js to use new pricing module
- Update any other files that directly access pricing from availableModels

### Phase 3: Clean Up Model Definitions
- Remove all pricing-related code from availableModels.js
- Update requestUtils.js to remove pricing filtering (no longer needed)
- Verify model objects no longer contain pricing

### Phase 4: Testing and Validation
- Run comprehensive tests to ensure functionality unchanged
- Validate API responses match previous behavior
- Test cost calculations produce identical results