# Vectorize Testing Strategy - Before Production Deployment

## Key Testing Insight

**Vectorize has NO local simulation** - it always connects to your actual Cloudflare account, even during development. This means we can test the full implementation locally without deploying to production!

## Testing Options

### Option 1: Local Development with Remote Vectorize (Recommended)

Since Vectorize doesn't have local simulation, `wrangler dev` automatically connects to your real Vectorize index:

```bash
# This connects to real Vectorize index during local development
wrangler dev
```

**Benefits:**
- Full end-to-end testing with real Vectorize
- Fast iteration and debugging
- Real embedding generation and similarity search
- No production deployment risk

### Option 2: Remote Development (Alternative)

```bash
# Everything runs on Cloudflare infrastructure
wrangler dev --remote
```

## Pre-Production Testing Plan

### 1. Setup Test Environment

```bash
# Create separate test index for development
wrangler vectorize create pollinations-image-cache-test --dimensions=768 --metric=cosine

# Create metadata indexes
wrangler vectorize create-metadata-index pollinations-image-cache-test --property-name=bucket --type=string
wrangler vectorize create-metadata-index pollinations-image-cache-test --property-name=model --type=string
wrangler vectorize create-metadata-index pollinations-image-cache-test --property-name=width --type=number
wrangler vectorize create-metadata-index pollinations-image-cache-test --property-name=height --type=number
wrangler vectorize create-metadata-index pollinations-image-cache-test --property-name=cachedAt --type=number
```

### 2. Update wrangler.toml for Testing

```toml
[env.test]
[[env.test.vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "pollinations-image-cache-test"

# Keep production config
[[vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "pollinations-image-cache"
```

### 3. Run Local Tests with Real Vectorize

```bash
# Test with development index
wrangler dev --env test

# Or test with production index (careful!)
wrangler dev
```

### 4. Test Scenarios

#### A. Basic Functionality Test
1. Start local development server
2. Make image request with prompt "sunset over ocean"
3. Verify exact cache miss → semantic cache miss → origin fallback
4. Make another request with similar prompt "beautiful sunset ocean"
5. Verify semantic cache hit with similarity score

#### B. Resolution Bucket Test
1. Request 1024x1024 image with prompt "red car"
2. Request 512x512 image with same prompt "red car"  
3. Verify they use different buckets (no cross-resolution matches)
4. Request another 1024x1024 with similar prompt "blue car"
5. Verify semantic match within same resolution bucket

#### C. Model Filtering Test
1. Request with model="flux" and prompt "forest"
2. Request with model="sd-xl" and same prompt "forest"
3. Verify they don't match (different model buckets)

#### D. Performance Test
1. Monitor embedding generation latency
2. Check Vectorize query response times
3. Verify asynchronous embedding storage doesn't block responses

### 5. Real Traffic Testing Script

```javascript
// test-live-vectorize.js
async function testLiveVectorize() {
  const baseUrl = 'http://localhost:8787'; // wrangler dev default
  
  console.log('🧪 Testing live Vectorize integration...\n');
  
  // Test 1: First request (cache miss)
  console.log('1. Testing cache miss scenario...');
  const response1 = await fetch(`${baseUrl}/image?prompt=sunset+over+ocean&width=1024&height=1024`);
  console.log(`Status: ${response1.status}`);
  console.log(`Cache-Type: ${response1.headers.get('x-cache-type')}`);
  
  // Wait for async embedding storage
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Similar request (should hit semantic cache)
  console.log('\n2. Testing semantic similarity...');
  const response2 = await fetch(`${baseUrl}/image?prompt=beautiful+sunset+ocean&width=1024&height=1024`);
  console.log(`Status: ${response2.status}`);
  console.log(`Cache-Type: ${response2.headers.get('x-cache-type')}`);
  console.log(`Similarity: ${response2.headers.get('x-semantic-similarity')}`);
  
  // Test 3: Different resolution (should miss)
  console.log('\n3. Testing resolution bucket isolation...');
  const response3 = await fetch(`${baseUrl}/image?prompt=sunset+over+ocean&width=512&height=512`);
  console.log(`Status: ${response3.status}`);
  console.log(`Cache-Type: ${response3.headers.get('x-cache-type')}`);
}

testLiveVectorize().catch(console.error);
```

### 6. Cost Management

**Development costs are minimal:**
- Vectorize: ~$0.04 per 100K vector operations
- Workers AI: Usually included in paid plans
- R2: Minimal for test images

**To minimize costs:**
- Use test index with limited vectors
- Clean up test data: `wrangler vectorize delete-by-metadata`
- Monitor usage in Cloudflare dashboard

### 7. Monitoring During Tests

```bash
# Watch logs during testing
wrangler dev --local-protocol=https

# Check Vectorize metrics
wrangler vectorize info pollinations-image-cache-test
```

## Production Deployment Confidence

After successful local testing with real Vectorize:

✅ **Embedding generation works** with Workers AI BGE model  
✅ **Vectorize queries function** with metadata filtering  
✅ **Resolution bucketing operates** correctly  
✅ **Semantic similarity matching** produces expected results  
✅ **Error handling gracefully** falls back to exact cache  
✅ **Performance impact** is acceptable  

**Result: Safe to deploy to production with high confidence!**

## Next Steps

1. **Run setup commands** to create test Vectorize index
2. **Start wrangler dev** and test with real requests  
3. **Use test script** to validate semantic caching behavior
4. **Monitor costs** and performance metrics
5. **Deploy to production** with confidence

The key insight is that Vectorize testing doesn't require production deployment - local development gives you the full real experience!
