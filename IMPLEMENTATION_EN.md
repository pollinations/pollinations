# Community Model Input Modalities — Implementation Documentation

> **Issue**: [#12989](https://github.com/pollinations/pollinations/issues/12989) — "Let community models declare input modalities"
> **Related**: [#12762](https://github.com/pollinations/pollinations/issues/12762) — "Community models `input_modalities` hardcoded to `["text"]`"
> **Verification**: 27 unit tests passing, TypeScript 0 errors, Biome clean

---

## 1. Problem Statement

Community model endpoints consistently reported `input_modalities: ["text"]` in `/text/models` and `/v1/models` catalogs, regardless of what the upstream endpoint actually accepted.

### Impact

| Affected Area | Manifestation |
|---------------|---------------|
| **Catalog Misrepresentation** | Multimodal models like `glm-4.6v-flash` (vision) and `mimo-v2.5` (omnimodal) were listed as text-only, contradicting their own descriptions |
| **SDK / Tooling** | SDKs that inspect `input_modalities` to decide whether to send images/audio never attempt multimodal calls to community models |
| **User Confusion** | Users reading the catalog had no way to know which input types community models support |

---

## 2. Root Cause Analysis

### 2.1 Original Issue

Prior to the fix, `communityModelDefinition()` in `shared/community-endpoints.ts` hardcoded `inputModalities: ["text"]`. There was no path for community endpoint owners to declare their actual input modalities at registration or update time.

### 2.2 Layered Root Cause

```
┌─────────────────────────────────────────┐
│  Layer 1: Database Schema                │
│  community_endpoint table had no         │
│  input_modalities column → data          │
│  could not be stored                     │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  Layer 2: Type / Runtime                 │
│  CommunityEndpointRuntime lacked         │
│  inputModalities field → data could      │
│  not flow through the stack              │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  Layer 3: Catalog Endpoint               │
│  communityModelDefinition() hardcoded    │
│  "text" → every model looked the same    │
└─────────────────────────────────────────┘
```

---

## 3. Architecture & Data Flow

```
Frontend                     Backend                      Data Layer
────────                    ────────                      ──────────

┌──────────────┐   POST    ┌─────────────────┐   INSERT   ┌──────────────────┐
│ Dialog UI    │ ────────→ │ community-       │ ────────→ │ D1: community_   │
│ "Accepted    │           │ endpoints route  │           │ endpoint          │
│  inputs"     │           │ (Zod validated + │           │ .input_modalities │
│  [✓text]     │           │  modality guard) │           │  = ["text",       │
│  [✓image]    │           └────────┬────────┘           │     "image"]      │
│  [ audio]    │                    │                    └────────┬─────────┘
│  [ video]    │                    │ SELECT                        │
└──────────────┘                    ▼                               ▼
                            ┌──────────────┐            ┌──────────────────┐
                            │normalizeCEIM()│            │ getCommunity     │
                            │ null→["text"]│            │ ModelRegistry    │
                            │ filter unsup-│            │ Entries()        │
                            │ ported modals│            └────────┬─────────┘
                            └──────┬───────┘                     │
                                   │                             ▼
                                   ▼                    ┌──────────────────┐
                            ┌──────────────┐            │ communityModel   │
                            │ community    │            │ Definition()     │
                            │ ModelDef     │            │                  │
                            │ .inputMod    │            │ normalized       │
                            │ alities      │            │ inputModalities  │
                            └──────┬───────┘            └────────┬─────────┘
                                   │                             │
                                   ▼                             │
                            ┌──────────────┐                     │
                            │ modelInfo    │ ←───────────────────┘
                            │ FromDef()    │
                            │              │
              ┌─ GET ──→    │ input_mod:   │
              │ /text/models│ ["text",     │
              │ /v1/models  │  "image"]    │
              │ /models     └──────────────┘
              │
              ▼
         ┌────────────────┐
         │ JSON Response  │
         │ {              │
         │  name: "...",  │
         │  input_modalities:
         │   ["text","image"],
         │  ...           │
         │ }              │
         └────────────────┘
```

## 4. Implementation Details

### 4.1 Database Migration (0042)

**File**: `enter.pollinations.ai/drizzle/0042_lethal_marvel_apes.sql`

```sql
ALTER TABLE `community_endpoint` ADD `input_modalities` text;
--> statement-breakpoint
UPDATE `community_endpoint`
SET `input_modalities` = CASE
    WHEN `modality` = 'image' AND `supports_image_edits` = 1
        THEN '["text","image"]'
    ELSE '["text"]'
END
WHERE `input_modalities` IS NULL;
```

**Backward Compatibility Strategy**:
- Image endpoints with detected edit support → `["text", "image"]`
- All other existing rows → `["text"]` (safe text default)
- New rows are explicitly declared via creation flow

### 4.2 Shared Types & Normalization

**File**: `shared/community-endpoints.ts`

#### Allowed Input Modalities Map

```typescript
export const COMMUNITY_ENDPOINT_INPUT_MODALITIES = {
    text: MODEL_INPUT_MODALITIES,      // ["text", "image", "audio", "video"]
    image: ["text", "image"],          // text + image only
} as const;
```

#### Normalization Function

```typescript
export function normalizeCommunityEndpointInputModalities(
    value: readonly ModelInputModality[] | null | undefined,
    endpointModality: CommunityEndpointModality,
): ModelInputModality[] {
    if (!value?.length) return ["text"];  // empty → default text
    const declared = new Set(value);
    const normalized = COMMUNITY_ENDPOINT_INPUT_MODALITIES[
        endpointModality
    ].filter((modality) => declared.has(modality));
    return normalized.length ? [...normalized] : ["text"];
    // all declarations filtered out → fallback to text
}
```

**Three Guards**:
1. `value` is `null/undefined/empty` → `["text"]`
2. Only modalities within the current endpoint modality's allowed set pass through
3. After filtering, if zero remain → `["text"]` (safe fallback)

#### CommunityEndpointRuntime Type

```typescript
export type CommunityEndpointRuntime = {
    // ...
    inputModalities: ModelInputModality[] | null;  // nullable from DB
    // ...
};
```

#### communityModelDefinition()

```typescript
const inputModalities = normalizeCommunityEndpointInputModalities(
    endpoint.inputModalities,  // from DB or explicit declaration
    modality,
);
return {
    // ...
    inputModalities,  // passed directly to ModelDefinition
    // ...
};
```

### 4.3 Backend Router: Create & Update

**File**: `enter.pollinations.ai/src/routes/community-endpoints.ts`

#### Zod Schemas

```typescript
const InputModalitySchema = z.enum(MODEL_INPUT_MODALITIES);
const InputModalitiesSchema = z
    .array(InputModalitySchema)
    .min(1);

// Create schema
const CreateEndpointSchema = z.object({
    // ...
    inputModalities: InputModalitiesSchema.optional().default(["text"]),
});

// Update schema
const UpdateEndpointSchema = z.object({
    // ...
    inputModalities: InputModalitiesSchema.optional(),
});
```

#### Enforcement

```typescript
function enforceCommunityEndpointInputModalities(
    modality: CommunityEndpointModality,
    inputModalities: readonly string[],
): void {
    const permitted = COMMUNITY_ENDPOINT_INPUT_MODALITIES[modality];
    const unsupported = inputModalities.find(
        (input) => !(permitted as readonly string[]).includes(input),
    );
    if (!unsupported) return;
    throw new HTTPException(400, {
        message: `${unsupported} input is not supported for ${modality} models`,
    });
}
```

#### Image Endpoint Probe

File `enter.pollinations.ai/src/services/community-endpoint-openai.ts` tests image endpoints:
- Probes `/v1/images/generations` → verifies generation capability
- Probes `/v1/images/edits` → detects image input support
- Edit succeeds → `inputModalities: ["text", "image"]`
- Edit fails → `inputModalities: ["text"]`

### 4.4 Frontend Selector

**File**: `enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-dialog.tsx`

```
┌─ "Accepted inputs" ────────────────────────┐
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
│  │ ✓text│  │✓image│  │ audio│  │ video│    │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│                                              │
│  Select every input type supported by        │
│  this model. At least one is required.       │
└──────────────────────────────────────────────┘
```

- Options filtered dynamically by `modality` (text endpoints show all, image endpoints text/image only)
- At least 1 required at all times
- Auto-normalized on modality switch

### 4.5 Catalog Endpoint Data Flow

**Full Data Chain**:

```
DB (input_modalities JSON column)
  → getCommunityModelRegistryEntries()       [community-models.ts:63]
  → CommunityEndpointRuntime.inputModalities [community-models.ts:106]
  → communityModelDefinition()               [community-endpoints.ts:487-490]
  → normalizeCommunityEndpointInputModalities() [community-endpoints.ts:262-272]
  → ModelDefinition.inputModalities          [community-endpoints.ts:501]
  → modelInfoFromDefinition()                [model-info.ts:119]
  → ModelInfo.input_modalities               [model-info.ts:49]
  → communityEntryToGenerationEntry()        [model-registry.ts:105-128]
  → GET /text/models → entry.info            [proxy.ts:248]
  → GET /v1/models  → entry.info            [proxy.ts:248]

Endpoint: JSON response includes input_modalities field
```

---

## 5. Error Handling & Security

### 5.1 Input Validation Layers

| Layer | Check | Failure Behavior |
|-------|-------|-----------------|
| Zod schema | `ModelInputModality[]` type, min 1 | 400 error |
| Backend enforce | Modalities applicable to current endpoint modality | 400 error + descriptive message |
| Normalizer | Filters unknown modalities | Silent fallback to `["text"]` |

### 5.2 Security Considerations

1. **Injection Prevention**: `inputModalities` stored as JSON array, never string-interpolated or HTML-rendered
2. **Permission Model**: Only endpoint owners can modify `inputModalities` (via `POST /my-models` / `POST /:id/update`)
3. **Immutable Constraints**: `COMMUNITY_ENDPOINT_INPUT_MODALITIES` is `as const` — only maintainers can update allowed modality combinations
4. **No Stored XSS**: Values pass through Zod enum and JSON serialization, guaranteeing only valid enum strings are stored

---

## 6. Test Coverage

| Test Group (27 tests) | Coverage |
|---|---|
| **Defaults** | Unspecified defaults to `["text"]`, image endpoint defaults, null handling |
| **Explicit Declarations** | Multimodal declarations preserved, text+image on image endpoints passes |
| **Filtering** | Unsupported modalities silently filtered (e.g., audio on image endpoints) |
| **Pricing** | Flat-rate image, token-priced image, zero prices, community price fields |
| **Fallback Pricing** | Equal price allowed, cheaper allowed, any field more expensive rejected |
| **Image Endpoint Billing** | Request mode, tokens mode, zero-width image, image edits /v1/images/edits |
| **Catalog Output** | `/image/models` includes `input_modalities`, `/v1/models` includes `input_modalities`, text-only absent from image catalog |
| **Edge Cases** | Empty array, null value, all declarations filtered, modality switch recalculation |

---

## 7. Backward Compatibility

| Scenario | Old Behavior | New Behavior |
|----------|-------------|-------------|
| Create endpoint (no inputModalities) | N/A | Defaults to `["text"]` |
| Create endpoint (with inputModalities) | N/A | Uses declared values (normalized) |
| Update endpoint | N/A | inputModalities updatable |
| Existing DB rows (post-migration) | (`["text"]`) | Image+edits → `["text","image"]`, others → `["text"]` |
| Catalog output | `input_modalities` absent or `["text"]` | Correctly reflects declared modalities |
| `/v1/images/edits` shown for image endpoint | N/A | Only when `"image"` ∈ inputModalities |
| All existing tests | All passing | All passing |

---

## 8. Affected Files

| File | Change | Description |
|------|--------|-------------|
| `enter.pollinations.ai/drizzle/0042_lethal_marvel_apes.sql` | New | Migration: add `input_modalities` column |
| `shared/community-endpoints.ts` | Modified | `CommunityEndpointRuntime`, `normalizeCEIM()`, `communityModelDefinition()` |
| `shared/db/better-auth.ts` | Modified | Drizzle schema: `inputModalities` JSON column |
| `enter.pollinations.ai/src/routes/community-endpoints.ts` | Modified | Create/update schemas + enforcement |
| `enter.pollinations.ai/frontend/.../community-endpoint-dialog.tsx` | Modified | "Accepted inputs" selector UI |
| `enter.pollinations.ai/frontend/.../types.ts` | Modified | Form state + payload serialization |
| `enter.pollinations.ai/src/services/community-endpoint-openai.ts` | Modified | Image probe returns inputModalities |
| `gen.pollinations.ai/src/community-models.ts` | Modified | Read + pass through inputModalities |
| `gen.pollinations.ai/src/model-registry.ts` | Modified | Conditional image endpoint exposure |
| `gen.pollinations.ai/src/community-endpoints.test.ts` | Modified | 27 tests: defaults, declarations, filtering, pricing, catalog |

---

## 9. Verification

| Check | Result | Notes |
|-------|--------|-------|
| TypeScript `tsc --noEmit` | ✅ 0 errors | Full type check |
| Vitest (worker-pool) | ✅ 27/27 passing | Includes miniflare, D1 migrations |
| Biome `check --write` | ✅ No fixes | Consistent code style |
| Manual Review | ✅ Passed | All data paths traced |

---
