# RunPod Serverless Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Vast.ai GPU routing with RunPod Serverless for Flux and Z-Image models, starting with Flux.

**Architecture:** Add a `runpodDispatch.ts` module that calls RunPod's `/runsync` API directly, bypassing the heartbeat-based server registry. The dispatch function wraps RunPod's input/output format to match the existing `POST /generate` interface (base64 JPEG response). The `createAndReturnImages.ts` routing logic switches from `fetchFromLeastBusyServer()` to `fetchFromRunPod()` based on an env var toggle, keeping Vast.ai code intact but unplugged.

**Tech Stack:** RunPod Serverless API, Docker (existing Dockerfiles), TypeScript (image.pollinations.ai gateway)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `image.pollinations.ai/src/runpodDispatch.ts` | Create | RunPod API client: calls `/runsync`, translates input/output format |
| `image.pollinations.ai/src/createAndReturnImages.ts` | Modify (lines 206-222) | Route flux/zimage to RunPod dispatch instead of Vast.ai pools |
| `image.pollinations.ai/runpod/flux/handler.py` | Create | RunPod handler wrapping nunchaku inference logic |
| `image.pollinations.ai/runpod/flux/Dockerfile` | Create | Docker image for RunPod Flux worker |
| `image.pollinations.ai/runpod/zimage/handler.py` | Create | RunPod handler wrapping Z-Image inference logic |
| `image.pollinations.ai/runpod/zimage/Dockerfile` | Create | Docker image for RunPod Z-Image worker |
| `image.pollinations.ai/test/runpodDispatch.test.ts` | Create | Tests for RunPod dispatch module |

---

## Phase 1: RunPod Flux Handler + Docker Image

### Task 1: Create RunPod Flux handler

The RunPod handler wraps the existing `nunchaku/server.py` inference logic into RunPod's `handler(job)` format. Models load at container start (outside handler). The handler receives the same fields as the FastAPI `/generate` endpoint and returns the same base64 JSON response.

**Files:**
- Create: `image.pollinations.ai/runpod/flux/handler.py`

- [ ] **Step 1: Create the handler file**

```python
# image.pollinations.ai/runpod/flux/handler.py
import os
import sys
import io
import base64
import logging
import torch
import runpod
from diffusers import FluxPipeline
from nunchaku import NunchakuFluxTransformer2dModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_ID = "black-forest-labs/FLUX.1-schnell"
QUANT_MODEL_PATH = "mit-han-lab/svdq-fp4-flux.1-schnell"

# --- Model loading (runs once at container start) ---

logger.info("Loading FLUX pipeline...")
transformer = NunchakuFluxTransformer2dModel.from_pretrained(QUANT_MODEL_PATH)
pipe = FluxPipeline.from_pretrained(
    MODEL_ID,
    transformer=transformer,
    torch_dtype=torch.bfloat16
).to("cuda")
logger.info("FLUX pipeline loaded successfully")


def find_nearest_valid_dimensions(width: float, height: float) -> tuple:
    """Find nearest dimensions: multiples of 8, product divisible by 65536."""
    MAX_DIMENSION = 8192
    MIN_DIMENSION = 64
    MAX_PIXELS = 1024 * 1024

    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ValueError(f"Dimensions too large: {width}x{height}. Max {MAX_DIMENSION}x{MAX_DIMENSION}")
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        raise ValueError(f"Dimensions too small: {width}x{height}. Min {MIN_DIMENSION}x{MIN_DIMENSION}")

    start_w = round(width)
    start_h = round(height)

    current_pixels = start_w * start_h
    if current_pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / current_pixels) ** 0.5
        start_w = round(start_w * scale)
        start_h = round(start_h * scale)

    def is_valid(w, h):
        return w % 8 == 0 and h % 8 == 0 and (w * h) % 65536 == 0

    nearest_w = round(start_w / 8) * 8
    nearest_h = round(start_h / 8) * 8

    offset = 0
    while offset < 100:
        for w in range(nearest_w - offset * 8, nearest_w + offset * 8 + 1, 8):
            if w <= 0:
                continue
            for h in range(nearest_h - offset * 8, nearest_h + offset * 8 + 1, 8):
                if h <= 0:
                    continue
                if is_valid(w, h):
                    return w, h
        offset += 1

    return nearest_w, nearest_h


def handler(job):
    """RunPod handler. Input/output matches existing /generate API."""
    job_input = job["input"]

    prompts = job_input.get("prompts", ["a photo of an astronaut riding a horse on mars"])
    width = job_input.get("width", 1024)
    height = job_input.get("height", 1024)
    steps = job_input.get("steps", 4)
    seed = job_input.get("seed")

    if seed is None:
        seed = int.from_bytes(os.urandom(2), "big")

    logger.info(f"Generating: {prompts[0][:80]}... {width}x{height} seed={seed}")

    width, height = find_nearest_valid_dimensions(width, height)
    generator = torch.Generator("cuda").manual_seed(seed)

    with torch.inference_mode():
        output = pipe(
            prompt=prompts[0],
            generator=generator,
            width=width,
            height=height,
            num_inference_steps=steps,
        )

    image = output.images[0]
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format="JPEG", quality=95)
    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode("utf-8")

    # Return same format as existing FastAPI /generate endpoint
    return [{
        "image": img_base64,
        "has_nsfw_concept": False,
        "concept": [],
        "width": width,
        "height": height,
        "seed": seed,
        "prompt": prompts[0],
    }]


runpod.serverless.start({"handler": handler})
```

- [ ] **Step 2: Commit**

```bash
git add image.pollinations.ai/runpod/flux/handler.py
git commit -m "add runpod flux handler wrapping nunchaku inference"
```

---

### Task 2: Create RunPod Flux Dockerfile

Adapts the existing `nunchaku/Dockerfile` for RunPod. Key differences: adds `runpod` pip package, removes heartbeat/FastAPI code, entry point is `handler.py` instead of `server.py`.

**Files:**
- Create: `image.pollinations.ai/runpod/flux/Dockerfile`
- Reference: `image.pollinations.ai/nunchaku/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
# RunPod Serverless - Flux Schnell with Nunchaku FP4
#
# Build:
#   docker build --platform linux/amd64 -t pollinations/runpod-flux:v1.0.0 .
#
# The nunchaku library must be compiled for the target GPU arch.
# RTX 4090 = SM 8.9. RunPod 4090 PRO uses the same chip.

FROM nvidia/cuda:12.8.0-devel-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    python3-pip \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

ENV PATH=/usr/local/cuda-12.8/bin:$PATH
ENV CUDA_HOME=/usr/local/cuda-12.8
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH

WORKDIR /app
RUN python3.12 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --upgrade pip

# PyTorch with CUDA 12.8
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128

# Python deps (same as nunchaku/requirements.txt + runpod)
COPY requirements.txt .
RUN pip install -r requirements.txt

# Build nunchaku for SM 8.9 (RTX 4090 / 4090 PRO)
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV NUNCHAKU_INSTALL_SM="89"
RUN git clone --recursive https://github.com/mit-han-lab/nunchaku.git /app/nunchaku && \
    cd /app/nunchaku && \
    pip install ninja && \
    sed -i 's/sm_targets = get_sm_targets()/sm_targets = ["89"]/' setup.py && \
    pip install --no-build-isolation -e .

COPY handler.py .

CMD ["python", "handler.py"]
```

- [ ] **Step 2: Create requirements.txt**

```txt
# Same deps as nunchaku server + runpod SDK
accelerate>=1.9
diffusers>=0.35
transformers>=4.50
safetensors
sentencepiece
protobuf
peft
einops
pillow
numpy
tqdm
requests
huggingface-hub
runpod
```

- [ ] **Step 3: Commit**

```bash
git add image.pollinations.ai/runpod/flux/Dockerfile image.pollinations.ai/runpod/flux/requirements.txt
git commit -m "add runpod flux dockerfile based on nunchaku build"
```

---

## Phase 2: Gateway Integration (TypeScript)

### Task 3: Create RunPod dispatch module

This module calls RunPod's `/runsync` endpoint and returns a standard `Response` object matching what `fetchFromLeastBusyServer` returns, so `createAndReturnImages.ts` needs minimal changes.

**Files:**
- Create: `image.pollinations.ai/src/runpodDispatch.ts`

- [ ] **Step 1: Write the dispatch module**

```typescript
// image.pollinations.ai/src/runpodDispatch.ts
import debug from "debug";

const log = debug("pollinations:runpod");

// Env vars:
//   RUNPOD_API_KEY          - RunPod API key
//   RUNPOD_FLUX_ENDPOINT_ID - Endpoint ID for Flux worker
//   RUNPOD_ZIMAGE_ENDPOINT_ID - Endpoint ID for Z-Image worker

type RunPodEndpointType = "flux" | "zimage";

function getEndpointId(type: RunPodEndpointType): string {
    const envKey = type === "flux"
        ? "RUNPOD_FLUX_ENDPOINT_ID"
        : "RUNPOD_ZIMAGE_ENDPOINT_ID";
    const id = process.env[envKey];
    if (!id) {
        throw new Error(`${envKey} not set`);
    }
    return id;
}

function getApiKey(): string {
    const key = process.env.RUNPOD_API_KEY;
    if (!key) {
        throw new Error("RUNPOD_API_KEY not set");
    }
    return key;
}

/**
 * Calls a RunPod serverless endpoint via /runsync.
 * Accepts the same RequestInit as fetchFromLeastBusyServer (body is JSON string
 * with prompts, width, height, seed, steps, etc.).
 * Returns a Response with the same JSON body format as the Vast.ai /generate endpoint.
 */
export async function fetchFromRunPod(
    type: RunPodEndpointType,
    options: RequestInit,
): Promise<Response> {
    const endpointId = getEndpointId(type);
    const apiKey = getApiKey();
    const url = `https://api.runpod.ai/v2/${endpointId}/runsync`;

    // Parse the body to wrap it in RunPod's { input: ... } envelope
    const body = JSON.parse(options.body as string);

    log("Calling RunPod %s endpoint %s", type, endpointId);

    const startTime = Date.now();

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: body }),
    });

    const elapsed = Date.now() - startTime;
    log("RunPod %s responded in %dms (status %d)", type, elapsed, response.status);

    if (!response.ok) {
        const errorText = await response.text();
        log("RunPod error: %s", errorText.substring(0, 500));
        return new Response(errorText, {
            status: response.status,
            statusText: response.statusText,
        });
    }

    // RunPod wraps output: { id, status, output: <handler return value> }
    const result = await response.json();

    if (result.status === "FAILED") {
        log("RunPod job failed: %s", JSON.stringify(result));
        return new Response(JSON.stringify({ error: result.error || "RunPod job failed" }), {
            status: 500,
        });
    }

    // result.output is the array returned by handler.py -- same format as /generate
    return new Response(JSON.stringify(result.output), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

export const fetchFromRunPodFlux = (options: RequestInit) =>
    fetchFromRunPod("flux", options);

export const fetchFromRunPodZImage = (options: RequestInit) =>
    fetchFromRunPod("zimage", options);
```

- [ ] **Step 2: Commit**

```bash
git add image.pollinations.ai/src/runpodDispatch.ts
git commit -m "add runpod dispatch module for serverless API calls"
```

---

### Task 4: Wire RunPod dispatch into image routing

Modify `createAndReturnImages.ts` to route through RunPod instead of Vast.ai pools. The switch is controlled by `RUNPOD_API_KEY` env var: if set, use RunPod; if not, fall back to Vast.ai heartbeat pools (keeps Vast.ai code functional but unplugged).

**Files:**
- Modify: `image.pollinations.ai/src/createAndReturnImages.ts` (lines 1-8 imports, lines 206-222 routing)

- [ ] **Step 1: Add RunPod import**

At `image.pollinations.ai/src/createAndReturnImages.ts`, add import after line 8:

```typescript
import {
    fetchFromRunPodFlux,
    fetchFromRunPodZImage,
} from "./runpodDispatch.ts";
```

- [ ] **Step 2: Replace routing logic**

Replace the routing block (lines ~206-222) from:

```typescript
            // Route to appropriate server pool based on model
            const fetchFunction =
                safeParams.model === "zimage"
                    ? (opts: RequestInit) =>
                          fetchFromLeastBusyServer("zimage", opts)
                    : fetchFromLeastBusyFluxServer;
            response = await fetchFunction({
```

To:

```typescript
            // Route to RunPod serverless if configured, otherwise Vast.ai pools
            const useRunPod = !!process.env.RUNPOD_API_KEY;
            let fetchFunction: (opts: RequestInit) => Promise<Response>;

            if (useRunPod) {
                fetchFunction = safeParams.model === "zimage"
                    ? fetchFromRunPodZImage
                    : fetchFromRunPodFlux;
            } else {
                fetchFunction = safeParams.model === "zimage"
                    ? (opts: RequestInit) => fetchFromLeastBusyServer("zimage", opts)
                    : fetchFromLeastBusyFluxServer;
            }

            response = await fetchFunction({
```

- [ ] **Step 3: Run biome check**

```bash
cd image.pollinations.ai && npx biome check --write src/createAndReturnImages.ts src/runpodDispatch.ts
```

- [ ] **Step 4: Commit**

```bash
git add image.pollinations.ai/src/createAndReturnImages.ts
git commit -m "route flux/zimage to runpod when RUNPOD_API_KEY is set"
```

---

### Task 5: Write tests for RunPod dispatch

**Files:**
- Create: `image.pollinations.ai/test/runpodDispatch.test.ts`

- [ ] **Step 1: Write test file**

```typescript
// image.pollinations.ai/test/runpodDispatch.test.ts
import { describe, it, expect } from "vitest";

// These tests hit the real RunPod endpoint -- skip if no API key
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_FLUX_ENDPOINT_ID = process.env.RUNPOD_FLUX_ENDPOINT_ID;

describe.skipIf(!RUNPOD_API_KEY || !RUNPOD_FLUX_ENDPOINT_ID)(
    "RunPod Flux endpoint (live)",
    () => {
        it("generates an image via /runsync", async () => {
            const url = `https://api.runpod.ai/v2/${RUNPOD_FLUX_ENDPOINT_ID}/runsync`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${RUNPOD_API_KEY}`,
                },
                body: JSON.stringify({
                    input: {
                        prompts: ["a red circle on white background"],
                        width: 512,
                        height: 512,
                        steps: 4,
                        seed: 42,
                    },
                }),
            });

            expect(response.ok).toBe(true);
            const result = await response.json();
            expect(result.status).toBe("COMPLETED");
            expect(Array.isArray(result.output)).toBe(true);
            expect(result.output[0].image).toBeTruthy();
            expect(result.output[0].width).toBe(512);
            expect(result.output[0].height).toBe(512);
            expect(result.output[0].seed).toBe(42);
        }, 120_000); // 2 min timeout for cold start
    },
);
```

- [ ] **Step 2: Commit**

```bash
git add image.pollinations.ai/test/runpodDispatch.test.ts
git commit -m "add live integration test for runpod flux endpoint"
```

---

## Phase 3: Deploy and Validate Flux

### Task 6: Build and push Flux Docker image to Docker Hub

**Files:**
- Reference: `image.pollinations.ai/runpod/flux/Dockerfile`

- [ ] **Step 1: Build the Docker image**

```bash
cd image.pollinations.ai/runpod/flux
docker build --platform linux/amd64 -t pollinations/runpod-flux:v1.0.0 .
```

Note: This will take 15-20 minutes (nunchaku compilation). Requires NVIDIA Docker runtime for local testing.

- [ ] **Step 2: Push to Docker Hub**

```bash
docker push pollinations/runpod-flux:v1.0.0
```

- [ ] **Step 3: Create RunPod serverless endpoint**

In RunPod console (runpod.io/console/serverless):
1. Create new endpoint
2. Docker image: `pollinations/runpod-flux:v1.0.0`
3. GPU: RTX 4090 (24GB)
4. Min workers: 1 (always warm)
5. Max workers: 4
6. Idle timeout: 60s
7. Set `HF_TOKEN` env var for model downloads
8. Note the endpoint ID for use as `RUNPOD_FLUX_ENDPOINT_ID`

- [ ] **Step 4: Test the endpoint**

```bash
# Set env vars
export RUNPOD_API_KEY="your-key"
export RUNPOD_FLUX_ENDPOINT_ID="your-endpoint-id"

# Test directly
curl -s "https://api.runpod.ai/v2/$RUNPOD_FLUX_ENDPOINT_ID/runsync" \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"prompts":["a red circle"],"width":512,"height":512,"steps":4,"seed":42}}' | jq .status

# Expected: "COMPLETED"
```

- [ ] **Step 5: Run integration test**

```bash
cd image.pollinations.ai
RUNPOD_API_KEY="..." RUNPOD_FLUX_ENDPOINT_ID="..." npx vitest run test/runpodDispatch.test.ts
```

---

### Task 7: Deploy Flux to production

- [ ] **Step 1: Add env vars to EC2**

On the EC2 instance running image.pollinations.ai, add to the environment:

```bash
RUNPOD_API_KEY=your-key
RUNPOD_FLUX_ENDPOINT_ID=your-endpoint-id
```

- [ ] **Step 2: Deploy updated code to EC2**

Deploy the updated `image.pollinations.ai` with the RunPod dispatch code.

- [ ] **Step 3: Verify traffic flows through RunPod**

Monitor RunPod dashboard for incoming requests. Check EC2 logs for `pollinations:runpod` debug output:

```bash
DEBUG=pollinations:runpod node dist/index.js
```

- [ ] **Step 4: Turn off Vast.ai Flux instances**

Once RunPod is handling all Flux traffic successfully, stop the Vast.ai Flux GPU instances. The heartbeat-based code remains in the codebase but servers will simply time out after 45s with no heartbeats.

---

## Phase 4: Z-Image (after Flux is stable)

### Task 8: Create RunPod Z-Image handler

Same pattern as Flux. Wraps `z-image/server.py` inference + SPAN upscaler into RunPod handler format.

**Files:**
- Create: `image.pollinations.ai/runpod/zimage/handler.py`

- [ ] **Step 1: Create the handler file**

```python
# image.pollinations.ai/runpod/zimage/handler.py
import os
import sys
import io
import base64
import logging
import math
import torch
import numpy as np
import runpod
from PIL import Image
from diffusers import ZImagePipeline
from spandrel import ImageModelDescriptor, ModelLoader

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
SPAN_MODEL_PATH = "model_cache/span/2xNomosUni_span_multijpg.safetensors"
UPSCALE_FACTOR = 2
MAX_GEN_PIXELS = 768 * 768
MAX_FINAL_PIXELS = 768 * 768 * 4

# --- Model loading (runs once at container start) ---

logger.info("Loading Z-Image pipeline...")
pipe = ZImagePipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
    cache_dir=MODEL_CACHE,
    low_cpu_mem_usage=False,
).to("cuda")

logger.info("Loading SPAN upscaler...")
upscaler = ModelLoader().load_from_file(SPAN_MODEL_PATH)
assert isinstance(upscaler, ImageModelDescriptor)
upscaler.cuda().eval()
logger.info(f"Models loaded. SPAN scale={upscaler.scale}x")


def calculate_generation_dimensions(requested_width, requested_height):
    final_w, final_h = requested_width, requested_height
    total_pixels = final_w * final_h

    if total_pixels > MAX_FINAL_PIXELS:
        scale = math.sqrt(MAX_FINAL_PIXELS / total_pixels)
        final_w = round(final_w * scale)
        final_h = round(final_h * scale)

    final_pixels = final_w * final_h
    should_upscale = final_pixels > MAX_GEN_PIXELS

    if should_upscale:
        gen_w = final_w // UPSCALE_FACTOR
        gen_h = final_h // UPSCALE_FACTOR
    else:
        gen_w, gen_h = final_w, final_h

    gen_w = round(gen_w / 16) * 16
    gen_h = round(gen_h / 16) * 16
    gen_w = max(gen_w, 256)
    gen_h = max(gen_h, 256)

    if should_upscale:
        final_w = gen_w * UPSCALE_FACTOR
        final_h = gen_h * UPSCALE_FACTOR
    else:
        final_w, final_h = gen_w, gen_h

    return gen_w, gen_h, final_w, final_h, should_upscale


def upscale_with_span(image_np):
    img_float = image_np.astype(np.float32) / 255.0
    tensor = torch.from_numpy(img_float).permute(2, 0, 1).unsqueeze(0).cuda()
    with torch.no_grad():
        output = upscaler(tensor)
    result = output.squeeze(0).permute(1, 2, 0).cpu().numpy()
    result = np.clip(result * 255, 0, 255).astype(np.uint8)
    return result


def handler(job):
    job_input = job["input"]

    prompts = job_input.get("prompts", ["a photo of an astronaut riding a horse on mars"])
    width = job_input.get("width", 1024)
    height = job_input.get("height", 1024)
    seed = job_input.get("seed")

    if seed is None:
        seed = int.from_bytes(os.urandom(8), "big")

    logger.info(f"Generating: {prompts[0][:80]}... {width}x{height} seed={seed}")

    gen_w, gen_h, final_w, final_h, should_upscale = calculate_generation_dimensions(width, height)
    generator = torch.Generator("cuda").manual_seed(seed)

    with torch.inference_mode():
        output = pipe(
            prompt=prompts[0],
            generator=generator,
            width=gen_w,
            height=gen_h,
            num_inference_steps=9,
            guidance_scale=0.0,
        )

    image = output.images[0]
    image_np = np.array(image)

    if should_upscale:
        logger.info(f"Upscaling {gen_w}x{gen_h} -> {gen_w*UPSCALE_FACTOR}x{gen_h*UPSCALE_FACTOR}")
        result = upscale_with_span(image_np)
    else:
        result = image_np

    upscaled_image = Image.fromarray(result)
    img_byte_arr = io.BytesIO()
    upscaled_image.save(img_byte_arr, format="JPEG", quality=95)
    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode("utf-8")

    return [{
        "image": img_base64,
        "has_nsfw_concept": False,
        "concept": [],
        "width": upscaled_image.width,
        "height": upscaled_image.height,
        "seed": seed,
        "prompt": prompts[0],
    }]


runpod.serverless.start({"handler": handler})
```

- [ ] **Step 2: Commit**

```bash
git add image.pollinations.ai/runpod/zimage/handler.py
git commit -m "add runpod zimage handler with span upscaler"
```

---

### Task 9: Create RunPod Z-Image Dockerfile

**Files:**
- Create: `image.pollinations.ai/runpod/zimage/Dockerfile`
- Create: `image.pollinations.ai/runpod/zimage/requirements.txt`

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
# RunPod Serverless - Z-Image Turbo with SPAN 2x upscaler
#
# Build:
#   docker build --platform linux/amd64 -t pollinations/runpod-zimage:v1.0.0 .

FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-venv \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

ENV PATH=/usr/local/cuda-12.4/bin:$PATH
ENV CUDA_HOME=/usr/local/cuda-12.4
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.4/lib64:$LD_LIBRARY_PATH
ENV CUDA_VISIBLE_DEVICES=0

WORKDIR /app
RUN python3.12 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir wheel ninja && \
    pip install --no-cache-dir https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-cp312-cp312-linux_x86_64.whl 2>/dev/null || true

COPY handler.py .
RUN mkdir -p /app/model_cache

CMD ["python", "handler.py"]
```

- [ ] **Step 2: Create requirements.txt**

```txt
diffusers
accelerate
transformers
safetensors
huggingface-hub
pillow
requests
spandrel
numpy
runpod
```

- [ ] **Step 3: Commit**

```bash
git add image.pollinations.ai/runpod/zimage/Dockerfile image.pollinations.ai/runpod/zimage/requirements.txt
git commit -m "add runpod zimage dockerfile with flash-attention support"
```

---

### Task 10: Deploy Z-Image to RunPod and cut over

Follow same pattern as Task 6-7 but for Z-Image:

- [ ] **Step 1: Build and push Docker image**

```bash
cd image.pollinations.ai/runpod/zimage
docker build --platform linux/amd64 -t pollinations/runpod-zimage:v1.0.0 .
docker push pollinations/runpod-zimage:v1.0.0
```

- [ ] **Step 2: Create RunPod endpoint**

In RunPod console:
1. Docker image: `pollinations/runpod-zimage:v1.0.0`
2. GPU: L40S (48GB)
3. Min workers: 2 (always warm)
4. Max workers: 6
5. Set `HF_TOKEN` env var
6. Note endpoint ID for use as `RUNPOD_ZIMAGE_ENDPOINT_ID`

- [ ] **Step 3: Test and validate**

```bash
curl -s "https://api.runpod.ai/v2/$RUNPOD_ZIMAGE_ENDPOINT_ID/runsync" \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"prompts":["a red circle"],"width":1024,"height":1024,"seed":42}}' | jq .status
```

- [ ] **Step 4: Add RUNPOD_ZIMAGE_ENDPOINT_ID to EC2 env and deploy**

- [ ] **Step 5: Turn off Vast.ai Z-Image instances**

---

## Environment Variables Summary

Add these to the EC2 instance running `image.pollinations.ai`:

| Variable | Description |
|----------|-------------|
| `RUNPOD_API_KEY` | RunPod API key (enables RunPod routing) |
| `RUNPOD_FLUX_ENDPOINT_ID` | RunPod endpoint ID for Flux worker |
| `RUNPOD_ZIMAGE_ENDPOINT_ID` | RunPod endpoint ID for Z-Image worker |

When `RUNPOD_API_KEY` is not set, the system falls back to Vast.ai heartbeat pools automatically.
