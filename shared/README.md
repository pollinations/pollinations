# Shared Utilities for Pollinations Services

This directory contains shared utilities used across Pollinations services.

## Files

- **extractFromRequest.js** - Token extraction, IP detection, and request parsing utilities
- **utils.ts** - Generic utility functions (`omit`, `safeRound`)

## Registry (`registry/`)

Model definitions and pricing for all Pollinations services:

- **text.ts** - Text model service definitions
- **image.ts** - Image model service definitions
- **registry.ts** - Core registry functions and cost/price calculations
- **usage-headers.ts** - HTTP header utilities for tracking usage
- **model-info.ts** - Model metadata and information
- **price-helpers.ts** - Pricing utility functions
- **types.ts** - Shared TypeScript types

## Other Directories

- **assets/** - Shared logo SVGs
- **pwa-assets/** - PWA icon generation utility (has its own package.json)

## Usage

Services import from shared using relative paths:

```typescript
import { TEXT_SERVICES } from "../shared/registry/text.ts";
import { getIp } from "../shared/extractFromRequest.js";
```
