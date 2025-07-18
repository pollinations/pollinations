# Cache Investigation Tests

This folder contains test scripts used during the direct cache investigation to diagnose and verify the semantic cache system behavior.

## Test Scripts

### Core Investigation
- **`debug-direct-cache.js`** - Tests identical requests to verify direct cache hits
- **`debug-existing-cache.js`** - Tests problematic AI question that was getting semantic hits
- **`debug-detailed-cache.js`** - Comprehensive cache behavior analysis with fresh prompts
- **`debug-semantic-hits.js`** - Investigates why specific prompts get semantic hits instead of direct hits
- **`test-fresh-cache-entries.js`** - Verifies miss → hit → hit pattern with unique prompts

### Boundary Testing
- **`test-boundary-deterministic.js`** - Deterministic semantic boundary test suite
- **`debug-cache-keys.js`** - Cache key generation debugging
- **`debug-cache-flow.js`** - Cache flow sequence testing

### Legacy Tests
- **`test-sequence-working.js`** - Sequence testing (legacy)

## Investigation Results

**ROOT CAUSE IDENTIFIED:** Direct cache "misses" were caused by stale cache entries from previous test runs when the system had the old parallel cache logic.

**SOLUTION:** Sequential cache lookup (direct → semantic) works perfectly after clearing stale cache state.

## Usage

```bash
# Run deterministic boundary test
node tests/investigation/test-boundary-deterministic.js

# Debug specific cache behavior
node tests/investigation/debug-direct-cache.js

# Test fresh cache entry creation
node tests/investigation/test-fresh-cache-entries.js
```

## Key Findings

1. ✅ **Direct cache priority**: Confirmed working
2. ✅ **Sequential lookup order**: Direct → Semantic  
3. ✅ **Cache key determinism**: Identical requests = identical keys
4. ✅ **Performance optimization**: No unnecessary semantic searches
5. ✅ **Model isolation**: Separate cache buckets per model

**STATUS: Investigation complete - semantic cache system optimal ✅**
