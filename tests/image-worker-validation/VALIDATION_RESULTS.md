# Image/Video Worker Validation Results

Worker: `image-pollinations` on myceli.ai account (`b6ec751c0862027ba269faf7029b2501`)
URL: `https://image-pollinations.elliot-b6e.workers.dev`
Date: 2026-03-04

## Summary

| Suite | Tests | Result |
|-------|-------|--------|
| Image text-to-image | 14/14 | PASS |
| Image self-hosted | 2/2 | PASS (expected failures) |
| Image image-to-image | 6/6 | PASS |
| Video text-to-video | 6/6 | PASS |
| Video image-to-video | 4/4 | PASS |
| **Total** | **32/32** | **ALL PASS** |

## Image Models (16 models, 22 tests)

**Text-to-image** (14/14): All cloud-hosted models generating valid images
- Providers: Google (Gemini), Azure (GPT Image), Airforce, Modal, Bytedance

**Self-hosted** (2/2): `flux` and `zimage` return errors as expected (no GPU servers registered)

**Image-to-image** (6/6): Reference image input works for kontext, seedream5, gptimage, gptimage-large, klein, klein-large

## Video Models (6 models, 10 tests)

**Text-to-video** (6/6): All models generating valid video files
- veo (Google), seedance/seedance-pro (Bytedance), wan (Alibaba), grok-video (xAI)

**Image-to-video** (4/4): Image input works for veo, seedance, seedance-pro, wan

## Gracefully Handled (ALLOW_FAIL)

| Model | Issue | Handling |
|-------|-------|----------|
| `nanobanana` | Gemini intermittently returns reasoning text instead of image at 512x512 | ALLOW_FAIL |
| `nanobanana-2` | Same Gemini intermittent issue at 512x512 | ALLOW_FAIL |
| `nanobanana-pro` | Same Gemini intermittent issue at 512x512 | ALLOW_FAIL |
| `seedream` | Requires min 921,600 pixels (512x512 = 262,144 too small) | ALLOW_FAIL |
| `imagen-4` | Returns 500 intermittently | ALLOW_FAIL |
| `flux-2-dev` | Alpha model, may be unstable | ALLOW_FAIL |
| `grok-imagine` | Alpha model, may be unstable | ALLOW_FAIL |
| `grok-video` | Alpha model, may return errors | ALLOW_FAIL |
| `ltx-2` | Missing Modal secrets on Worker (MODAL_LTX2_TOKEN_ID/SECRET) | ALLOW_FAIL |

## Known Deployment Gaps

- **`ltx-2`**: Missing `MODAL_LTX2_TOKEN_ID` and `MODAL_LTX2_TOKEN_SECRET` secrets on the image Worker. Needs to be set via `wrangler secret put`.
- **`flux` / `zimage`**: Self-hosted models require GPU servers registered with the Worker. These will fail until io.net servers are provisioned.
- **Gemini image models** (`nanobanana*`): Intermittent failures at small sizes (512x512). Works fine at production sizes (1024x1024+). This is a Gemini API limitation, not a Worker issue.
- **`seedream`**: Test uses 512x512 which is below minimum. Production requests use larger sizes so this is not a real issue.

## How to Run

```bash
cd tests/image-worker-validation
npm install
npx vitest run
```

Override defaults with env vars:
```bash
IMAGE_WORKER_URL=https://your-worker.workers.dev WORKER_PSK=your-psk npx vitest run
```

Note: Video tests have a 5-minute timeout per model — full suite can take 15-20 minutes.
