# Z-Image-Turbo Server

FastAPI server for Z-Image-Turbo (6B parameter text-to-image model from Tongyi-MAI) with intelligent block-based upscaling.

## Performance

- **512×512**: ~0.9s
- **1024×1024**: ~3.5s
- **VRAM**: ~20GB peak
- **Upscaling**: 4× LANCZOS or SD X4 per block (concurrent, max 4 blocks)

## Working Mechanism

```mermaid
flowchart TD
  A[Client Request] --> B["Calculate Dimensions<br/>(clamp to 512-768)"]
  B --> C["Z-Image Generation<br/>(6B model)"]
  C --> D["Slice into Overlapping<br/>Blocks 128×128"]
  D --> E["Saliency Analysis<br/>(edge + laplacian + color variance)"]
  
  E --> F["Detect Subject Blocks<br/>(top 15% saliency)"]
  E --> G["Variance Analysis<br/>(threshold: 350.0)"]
  
  F --> I["Enforce SDXL Ratio<br/>(Priority: Subject)"]
  G --> H["Classify Flat Blocks<br/>(var < threshold/2)"]
  H --> I
  
  I --> J["Parallel Upscaling<br/>(ThreadPool max 4)"]
  J --> J1["SDXL Path<br/>(SD X4 upscaler)"]
  J --> J2["LANCZOS Path<br/>(fast interpolation)"]
  
  J1 --> K["Stitch with Feather Mask<br/>(gaussian blending)"]
  J2 --> K
  
  K --> L["Face Detection<br/>(MediaPipe)"]
  L --> M["Face Restoration<br/>(GFPGAN v1.4)"]
  M --> N["Resize to Final Dimensions<br/>(client requested)"]
  N --> O["JPEG Encode + Base64"]
  O --> P["Return Image + Metadata"]
```

## Technical Details

### Block Processing Pipeline

| Stage | Input | Process | Output |
|-------|-------|---------|--------|
| **Slicing** | 512-768px image | Stride-based overlap | N blocks, positions |
| **Saliency** | Image array | Sobel + Laplacian + variance | 0-1 normalized map |
| **Classification** | Blocks + saliency | Percentile thresholding | Subject/flat/detail sets |
| **Upscaling** | Classified blocks | Conditional (SDXL or LANCZOS) | 512px blocks (4×) |
| **Stitching** | Upscaled blocks | Feather mask blending | Seamless 2048-3072px output |

### Key Algorithms

**Saliency Computation:**
```
S(x,y) = 0.4·E(x,y) + 0.4·L(x,y) + 0.2·C(x,y)
```
- E: Sobel edge magnitude
- L: Laplacian (local contrast)
- C: RGB color variance
- Gaussian smoothed (σ=2)

**Subject Detection:**
- Threshold: 85th percentile of saliency
- Constraint: max_saliency > threshold AND mean_saliency > 0.8·threshold

**Flat Block Detection:**
- Variance < 175.0 → LANCZOS (very flat)
- Variance ≥ 175.0 → SDXL (detail retained)

**Upscaler Selection Enforcement:**
- Priority 1: Subject blocks → always SDXL
- Priority 2: Flat blocks → LANCZOS candidates
- Priority 3: Detail blocks → SDXL
- Ratio enforcement via moving blocks between sets

## API

### POST /generate

```json
{
  "prompts": ["a cat wearing sunglasses"],
  "width": 1024,
  "height": 1024,
  "steps": 9,
  "seed": 42
}
```

### Response

```json
{
  "image": "base64_jpeg_data",
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "timing_report": {
    "Base Generation": 3.2,
    "Block Slicing": 0.1,
    "Block Upscaling": 8.5,
    "Block Stitching": 0.3,
    "Total Pipeline": 12.1
  }
}
```

> Build with 💖 for Pollinations.ai