# Shared Utilities for Pollinations Services

This directory contains shared utilities used across Pollinations services.

## Registry (`registry/`)

Model definitions and pricing for all Pollinations services:

- **text.ts** - Text model service definitions
- **image.ts** - Image model service definitions
- **registry.ts** - Core registry functions and cost/price calculations
- **usage-headers.ts** - HTTP header utilities for tracking usage
- **model-info.ts** - Model metadata and information
- **price-helpers.ts** - Pricing utility functions

## Usage

Services import from shared using relative paths:

```typescript
import { TEXT_SERVICES } from "../shared/registry/text.ts";
```
