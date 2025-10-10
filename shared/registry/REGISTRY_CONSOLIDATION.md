# Registry Consolidation Architecture

## Current State

**Three data sources with overlapping information:**

1. **`shared/registry/text.ts`** (TypeScript)
   - `TEXT_MODELS`: Upstream model costs (billing)
   - `TEXT_SERVICES`: Service prices, aliases, tier
   - Used by: `enter.pollinations.ai` (billing/analytics)

2. **`text.pollinations.ai/availableModels.js`** (JavaScript)
   - Service definitions: name, description, aliases
   - Transform functions, modalities, tools, maxInputChars
   - Reference to `portkeyConfig` for routing
   - Used by: `text.pollinations.ai` (API routing)

3. **`text.pollinations.ai/configs/modelConfigs.js`** (JavaScript)
   - Platform routing: provider, endpoints, auth keys
   - Platform-specific config: max-tokens, temperature
   - Used by: `text.pollinations.ai` (Portkey routing)

## Key Insight: 1:N Relationship

**One upstream model config → Many services**

Example:
```javascript
portkeyConfig["mistral-small-3.1-24b-instruct-2503"]
├─→ "mistral" service (conversational transform)
├─→ "unity" service (unity persona transform)
└─→ "evil" service (evil persona transform)
```

**Therefore:** Service-specific data (transforms, personas) CANNOT go in modelConfigs.

## Proposed Architecture

### **Layer 1: Platform Routing** (`modelConfigs.js`)
```javascript
export const portkeyConfig = {
  "gpt-5-nano": () => ({
    provider: "azure",
    authKey: process.env.AZURE_KEY,
    "azure-deployment-id": "gpt-5-nano",
    "max-tokens": 512,  // Platform limit
  })
}
```
**Contains:** Provider, auth, endpoints, platform constraints
**Used by:** Portkey for actual API calls

### **Layer 2: Service Behavior** (`availableModels.js`)
```javascript
const models = [
  {
    name: "openai",  // User-facing service name
    description: "OpenAI GPT-5 Nano",
    aliases: ["gpt-5-nano"],
    config: portkeyConfig["gpt-5-nano"],  // References Layer 1
    
    // Service-specific behavior
    transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    tier: "anonymous",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    maxInputChars: 5000,
  }
]
```
**Contains:** Transforms, modalities, service behavior, user-facing metadata
**Used by:** text.pollinations.ai for request processing

### **Layer 3: Billing/Analytics** (`shared/registry/`)
```typescript
export const TEXT_MODELS = {
  "gpt-5-nano-2025-08-07": {
    costType: "per_generation_cost",
    cost: [{ promptTextTokens: fromDPMT(0.055), ... }]
  }
}

export const TEXT_SERVICES = {
  "openai": {
    aliases: ["gpt-5-nano"],
    modelIds: ["gpt-5-nano-2025-08-07"],  // Links to TEXT_MODELS
    price: [ZERO_PRICE]
  }
}
```
**Contains:** Cost/price data only (no displayNames removed)
**Used by:** enter.pollinations.ai for billing calculations

## Naming Architecture

**Three naming layers (user → service → model):**

```
User Request:    "openai"
      ↓
Service Name:    "openai"  (in availableModels.js)
      ↓
Config Key:      "gpt-5-nano"  (in portkeyConfig)
      ↓
Model ID:        "gpt-5-nano-2025-08-07"  (in TEXT_MODELS for cost)
      ↓
Upstream API:    "gpt-5-nano"  (sent to Azure)
```

**Principle:** External APIs only use service names, internal systems use model IDs for billing.

## Implementation Options

### **Option A: Keep Current Split** (Recommended for Phase 1)
- Registry = Pure billing (cost/price only)
- availableModels = Service definitions (metadata, behavior)
- modelConfigs = Platform routing (auth, endpoints)

**Pros:** Minimal changes, clear separation of concerns
**Cons:** Service metadata spread across files

### **Option B: Consolidate Service Metadata**
- Move common fields (aliases, tier) from availableModels → registry
- Keep text-specific fields (transforms, modalities) in availableModels
- modelConfigs stays the same

**Pros:** Shared service metadata in one place
**Cons:** Registry has modality-agnostic fields only

### **Option C: Full Registry Ownership**
- Registry owns all service definitions
- availableModels just reads from registry
- Adds text-specific fields to registry types

**Pros:** Single source of truth
**Cons:** Registry has text-specific concerns, breaks separation

## Migration Path

### Phase 1: Remove displayNames ✅ COMPLETE
- Removed from registry (enter.pollinations.ai doesn't use them)
- Keep in availableModels (text.pollinations.ai needs them)

### Phase 2: Remove costType Field ✅ COMPLETE
**Completed: 2025-10-10**

Removed unused `costType` metadata field and flattened model definitions:

**Before:**
```typescript
"gpt-5-nano-2025-08-07": {
    costType: "per_generation_cost",
    cost: [{ date: ..., promptTextTokens: ... }]
}
```

**After:**
```typescript
"gpt-5-nano-2025-08-07": [
    { date: ..., promptTextTokens: ... }
]
```

**Changes:**
- `ModelDefinition` type: `{ costType, cost[] }` → `CostDefinition[]`
- Removed `getCostType()` method from registry API
- Updated all 16 text models and 5 image models
- Renamed `ProviderId` → `ModelId` for consistency
- Removed `costType` from event tracking (uses schema defaults)
- Updated all tests

**Benefits:**
- Simpler, cleaner data structure (-131 lines)
- Removed unused metadata that didn't affect calculations
- Aligns with "thin proxy" design principle

### Phase 3: Strict Service Resolution ✅ COMPLETE
**Completed: 2025-10-10**

Updated `resolveServiceId()` to throw errors for invalid services instead of silent fallback:

**Behavior:**
- `null/undefined` → Returns default (`openai` or `flux`)
- Valid service/alias → Returns resolved service ID
- Invalid service → **Throws error** (no silent fallback)

**Rationale:** Fail fast on typos/invalid requests rather than masking errors with defaults.

### Phase 4: Add Link Fields (TODO)
```typescript
TEXT_SERVICES = {
  "openai": {
    aliases: ["gpt-5-nano"],
    modelIds: ["gpt-5-nano-2025-08-07"],
    configKey: "gpt-5-nano",  // NEW: links to modelConfigs
    price: [ZERO_PRICE]
  }
}
```

### Phase 5: Consolidate availableModels (TODO)
```javascript
// Generate from registry + service-specific config
const models = Object.entries(TEXT_SERVICES).map(([name, service]) => ({
  name,
  description: `...`,  // From somewhere
  aliases: service.aliases,
  tier: service.tier,  // If added to registry
  config: portkeyConfig[service.configKey],
  transform: SERVICE_TRANSFORMS[name],  // New lookup
  ...SERVICE_CONFIG[name],  // modalities, tools, etc.
}));
```

## Open Questions

1. **Where should displayNames live?**
   - Option A: Only in text/image services (current)
   - Option B: Shared location for UI consumption
   
2. **Should tier move to registry?**
   - Pro: Used by enter for auth decisions
   - Con: Currently works via ZERO_PRICE check

3. **How to handle service-specific behavior?**
   - Keep transforms/modalities in text service
   - Or create generic registry fields

4. **Registry format: TypeScript or JSON?**
   - TypeScript: Type safety, current state
   - JSON: Easier cross-service consumption

## Decision Criteria

**Keep in modelConfigs:** Provider, auth, platform limits
**Keep in availableModels:** Transforms, modalities, text-specific behavior  
**Keep in registry:** Cost, price, aliases (cross-service billing data)
**Move carefully:** Fields used by multiple services

---

**Next Step:** Decide on Option A vs B vs C based on actual requirements.
