# Z-Image Upscaling Test Results

## Upscaling Logic (from `z-image/server.py`)

```
MAX_GEN_PIXELS = 768 * 768 = 589,824 pixels
MAX_FINAL_PIXELS = 768 * 768 * 4 = 2,359,296 pixels  
UPSCALE_FACTOR = 2
```

**Decision logic:**
- If `requested_pixels > MAX_GEN_PIXELS` → generate at half size, then SPAN 2x upscale
- Generation dimensions aligned to 16px multiples
- Uses SPAN 2x upscaler model: `2x-NomosUni_span_multijpg.pth`

## Test Results - Square & Standard

| File | Requested | Generated | Upscaled? | Notes |
|------|-----------|-----------|-----------|-------|
| 01_512x512_no_upscale.jpg | 512x512 | 512x512 | ❌ No | Native generation |
| 02_768x768_no_upscale.jpg | 768x768 | 768x768 | ❌ No | At threshold - native |
| 03_800x800_upscaled.jpg | 800x800 | 400x400 | ✅ Yes | Just over threshold |
| 04_1024x1024_upscaled.jpg | 1024x1024 | 512x512 | ✅ Yes | Common size |
| 05_1024x768_upscaled.jpg | 1024x768 | 512x384 | ✅ Yes | Landscape |
| 06_1536x1536_upscaled.jpg | 1536x1536 | 768x768 | ✅ Yes | Max size |
| 07_769x769_upscaled.jpg | 769x769 | 384x384 | ✅ Yes | Edge case - 1px over |
| 20_256x256_min.jpg | 256x256 | 256x256 | ❌ No | Minimum size |

## Test Results - Aspect Ratios

| File | Requested | Aspect | Upscaled? | Notes |
|------|-----------|--------|-----------|-------|
| 10_1536x864_16-9.jpg | 1536x864 | 16:9 | ✅ Yes | HD landscape |
| 11_864x1536_9-16.jpg | 864x1536 | 9:16 | ✅ Yes | Mobile portrait |
| 18_1200x800_3-2.jpg | 1200x800 | 3:2 | ✅ Yes | Photo landscape |
| 19_800x1200_2-3.jpg | 800x1200 | 2:3 | ✅ Yes | Photo portrait |

## Test Results - Extreme Aspect Ratios

| File | Requested | Aspect | Upscaled? | Notes |
|------|-----------|--------|-----------|-------|
| 12_1536x512_3-1_panorama.jpg | 1536x512 | 3:1 | ✅ Yes | Wide panorama |
| 13_512x1536_1-3_tall.jpg | 512x1536 | 1:3 | ✅ Yes | Tall banner |
| 14_256x1024_1-4_extreme.jpg | 256x1024 | 1:4 | ❌ No | Extreme tall (under threshold) |
| 15_1024x256_4-1_extreme.jpg | 1024x256 | 4:1 | ❌ No | Extreme wide (under threshold) |
| 16_1536x384_4-1_upscaled.jpg | 1536x384 | 4:1 | ✅ Yes | Extreme wide upscaled |
| 17_384x1536_1-4_upscaled.jpg | 384x1536 | 1:4 | ✅ Yes | Extreme tall upscaled |

## Potential Issues

### 1. **Edge case at 769x769**
When requesting 769x769:
- `769*769 = 591,361 > 589,824` → triggers upscale
- `gen_w = 769 // 2 = 384` (aligned to 16px = 384)
- `gen_h = 769 // 2 = 384` (aligned to 16px = 384)
- Final: 384*2 = 768x768 (NOT 769x769!)

**This means the output is 768x768, not the requested 769x769.**

### 2. **Small generation sizes for upscaled images**
For 800x800 request:
- Generates at 400x400 (very small)
- Upscales to 800x800

The SPAN upscaler may introduce artifacts when upscaling from such small source images.

### 3. **Quality degradation pattern**
Images that get upscaled may show:
- "Squished" or "waffle iron" effect (as users reported)
- Loss of fine details
- Smoothing/blurring artifacts

### 4. **Extreme aspect ratios with upscaling**
Extreme ratios like 4:1 or 1:4 when upscaled:
- 1536x384 generates at 768x192 → very thin source
- 384x1536 generates at 192x768 → very narrow source
- May cause more pronounced artifacts due to extreme proportions

## Comparison

Compare these pairs to see upscaling effects:
- `01_512x512_no_upscale.jpg` vs `04_1024x1024_upscaled.jpg` (same seed, different path)
- `02_768x768_no_upscale.jpg` vs `06_1536x1536_upscaled.jpg` (native 768 vs upscaled from 768)
- `14_256x1024_1-4_extreme.jpg` vs `17_384x1536_1-4_upscaled.jpg` (native vs upscaled extreme)
- `15_1024x256_4-1_extreme.jpg` vs `16_1536x384_4-1_upscaled.jpg` (native vs upscaled extreme)

## Recommendation

The threshold of 768x768 may be too aggressive. Consider:
1. Raising `MAX_GEN_PIXELS` to allow larger native generation
2. Using a higher quality upscaler
3. Adding option to disable upscaling for users who prefer native resolution
4. Special handling for extreme aspect ratios to avoid thin generation dimensions
