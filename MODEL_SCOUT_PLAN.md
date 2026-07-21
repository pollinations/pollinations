# Pollinations Model Scout Plan

Last updated: 2026-07-21

This is the durable decision log for model additions, provider-route changes, model-version replacements, billing corrections, and inference experiments. It is a plan, not approval to edit a registry or deploy infrastructure.

## Implementation plan

Implement updates before additions. Each update bullet below is one separate pull request. Every model keeps exactly one selected provider route; no PR adds runtime failover.

### 1. Updates

- **PR 1 — Gemini 3.6 default and search migration:** Move `gemini` and `gemini-search-large` from Gemini 3.5 Flash to Gemini 3.6 Flash on Google Vertex AI after global-endpoint, search/tool, field-parity, and sampling-parameter tests pass.
- **PR 2 — Azure GPT billing corrections:** Correct long-context and cache-write billing for GPT-5.4, GPT-5.5, GPT-5.6 Sol, GPT-5.6 Terra, and GPT-5.6 Luna; normalize the Azure price multiplier to `0.75` for all five models.
- **PR 3 — Grok Video Pro provider migration:** Move Grok Video Pro from xAI to Replicate only if one blocking POST returns the completed media without status polling and confirms request-field parity, billing accuracy, and P95 completion within 120 seconds.
- **PR 4 — Qwen TTS version consolidation:** Upgrade Qwen3-TTS Flash and Qwen3-TTS Instruct to Qwen-Audio 3.0 TTS Flash on Alibaba Model Studio after WebSocket, voice, instruction, and latency parity are verified.
- **PR 5 — Default music alias:** After the Lyria 3 Clip addition lands, route prompt-only default music generation to Lyria 3 Clip on Google Vertex AI while retaining ElevenMusic for reference-audio and inpainting requests.

The first four update PRs land before additions. PR 5 is intentionally deferred until its Lyria 3 Clip dependency exists. Kie routing, DeepSeek on Azure, GPT-OSS on OVHcloud, Qwen3.7 pricing, Stable Audio, and TRELLIS self-hosting remain research or verification work and do not get implementation PRs yet.

### 2. Additions

- **Addition PR 1 — Gemini 3.5 Flash-Lite:** Add through Google Vertex AI global after exact model-ID, tool, and vision parity checks.
- **Addition PR 2 — LongCat 2.0:** Add through LongCat's direct OpenAI-compatible API after tool-calling, reliability, advertised context-window, billing, and burst tests. Direct has the same promotional model rate as OpenRouter without OpenRouter's pay-as-you-go platform fee.
- **Addition PR 3 — Inkling:** Add through Vercel AI Gateway with Baseten pinned after multimodal, tool, latency, and billing validation.
- **Addition PR 4 — Mistral OCR 4:** Add through Azure AI Foundry only after document schema, limits, latency, and the account-billed rate are verified; Azure credits must make it economically preferable to Mistral's direct $4/1K-page route.
- **Addition PR 5 — MAI-Image-2.5-Flash:** Add through Azure AI Foundry after image-field parity, safety behavior, billing, and P95 latency checks.
- **Addition PR 6 — Recraft V4.1 Vector:** Add through Recraft's direct API after SVG sanitization, MIME, dimensions, billing, and latency checks.
- **Addition PR 7 — CSM-1B:** Add through OpenRouter with DeepInfra pinned only after checking whether the authenticated DeepInfra catalog offers the same model directly at a lower effective price, then validating audio-output compatibility, billing, and latency on the selected route.
- **Addition PR 8 — Lyria 3 Clip:** Add prompt-only music generation through Google Vertex AI after audio-output, billing, regional availability, and P95 latency checks.
- **Addition PR 9 — Grok Voice Think Fast 1.0:** Add through xAI's realtime API after WebSocket compatibility, audio billing, concurrency, and latency validation.
- **Addition PR 10 — Grok Imagine Video 1.5:** Add through Replicate only if one blocking POST returns completed media without status polling, proves P95 completion within 120 seconds, and confirms field and billing parity.
- **Conditional Addition PR 11 — MAI-Image-2.5:** Add through Azure AI Foundry only if it materially beats the Flash variant enough to justify the extra cost or latency.
- **Conditional Addition PR 12 — Lyria 3 Pro:** Add through Google Vertex AI only if completed media reliably returns within 120 seconds and its quality gain over Clip is material.

## Decision rules

- Prefer managed serverless inference with normal completion within 90 seconds and a hard limit of 120 seconds. Streaming text and realtime WebSocket audio are acceptable; media APIs that require asynchronous polling are not.
- Pollinations-operated GPU deployment is out of scope for the current implementation plan; Stable Audio and TRELLIS remain benchmark-only.
- `paidOnly` is `true` except when the selected registry provider is Azure or Fireworks.
- `priceMultiplier` is `1` except when the selected registry provider is Azure, where it is `0.75`.
- Every model has exactly one provider and one primary inference route. Automatic failover is not configured.
- Any other provider benchmark is offline replacement research only and must never be wired as simultaneous routing.
- No model implementation starts until its canonical name, aliases, registry provider, upstream model ID, primary route, paid status, multiplier, and GPU ownership are explicitly confirmed.
- Provider catalog presence is discovery evidence, not proof of availability. Before implementation, make a real request and verify modalities, parameters, latency, usage fields, billing, error paths, and burst behavior.

## Models to add

| Model | Proposed provider | Input | Output | Paid only | Multiplier | Inference availability | Reason and gate |
|---|---|---|---|---:|---:|---|---|
| Inkling | Vercel AI Gateway to Baseten | Text, image, audio | Text | Yes | 1 | GA serverless streaming | **ADD** after live multimodal/tool/latency validation; distinctive 975B MoE with 41B active parameters |
| Gemini 3.5 Flash-Lite | Google Vertex AI global | Text, image, video, audio, PDF | Text | Yes | 1 | Stable GA synchronous/streaming, released 2026-07-21 | **ADD** as an exact model first; test deprecated sampling-parameter behavior and benchmark before changing the existing Flash-Lite default because it costs more than 3.1 |
| LongCat 2.0 | LongCat direct | Text | Text | Yes | 1 | Serverless OpenAI-compatible streaming | **ADD after TEST** for tool calling, reliability, billing, and 1M-context behavior; use direct because its promotional model rate matches OpenRouter without OpenRouter's pay-as-you-go platform fee |
| Mistral OCR 4 | Azure Foundry | Document, image | Structured text | No | 0.75 | Azure managed preview | **ADD** only if Azure credits make the account-billed rate preferable to Mistral direct at $4/1K pages; test the 30-page/30MB Azure limits and response schema |
| MAI-Image-2.5-Flash | Azure Foundry | Text, image | Image | No | 0.75 | Global Standard managed preview | **ADD after TEST**; credit-funded fast generation and editing, but two Microsoft pages disagree on image-output price and initial quota can be only 2 RPM |
| MAI-Image-2.5 | Azure Foundry | Text, image | Image | No | 0.75 | Global Standard managed preview | **TEST**, then add only if it materially beats Flash/current image models on quality |
| Recraft V4.1 Vector | Recraft direct | Text | SVG/vector image | Yes | 1 | Managed REST API | **ADD** after blocking-response, MIME, SVG-safety, and latency validation; fills the editable-vector gap |
| Grok Imagine Video 1.5 | Replicate | Image | Video with audio | Yes | 1 | Candidate blocking managed request; not yet verified | **ADD** only if one POST returns the completed media without follow-up polling, end-to-end P95 is below 90 seconds, and every job finishes before 120 seconds |
| Lyria 3 Clip | Google Vertex AI global | Text, image | Audio/music | Yes | 1 | Managed preview, synchronous Interactions API | **ADD** first; fixed 30-second output is a good fit for the timeout and costs $0.04/request |
| Lyria 3 Pro | Google Vertex AI global | Text, image | Audio/music | Yes | 1 | Managed preview, synchronous Interactions API | **TEST**; add only if a full song consistently completes before 120 seconds |
| CSM-1B | OpenRouter to DeepInfra candidate; direct DeepInfra price check pending | Text | Audio/speech | Yes | 1 | Managed synchronous raw-audio stream; one upstream provider | **TEST, THEN ADD** if the selected single route has the best verified effective price, P95 is below 90 seconds, and all requests finish before 120 seconds. It is a highly popular conversational TTS model, but the route has little traffic telemetry, supports English only, and exposes the base model rather than Sesame's fine-tuned demo |
| Grok Voice Think Fast 1.0 | xAI | Text, audio | Text, audio | Yes | 1 | Managed realtime WebSocket | **ADD** after voice, interruption, tool, and billing validation |

## Models to update

| Model | Target provider | Input | Output | Paid only | Multiplier | Update and reason |
|---|---|---|---|---:|---:|---|
| Gemini default (`gemini`) | Google | Text, image, video, audio, PDF | Text | Yes | 1 | Move 3.5 Flash to 3.6 Flash after live parity. Official launch pricing is $1.50/M input and $7.50/M output, down from $9/M output, while Google reports better coding, knowledge-work, and token efficiency |
| Gemini Search Large | Google | Text, image, video, audio, PDF | Text | Yes | 1 | Move its 3.5 base to 3.6 after search/tool and sampling-parameter parity; output-token pricing falls to $7.50/M while the existing Gemini 3 grounding rule remains subject to billed verification |
| Grok 4.5 | OpenRouter | Text, image | Text | Yes | 1 | Already present through OpenRouter. Kie posts 60% lower rates, but keep OpenRouter as the sole route unless a deliberate provider switch is approved after provenance, data policy, long-context billing, tools, and reliability tests |
| Gemini 3.5 Flash exact route | Google Vertex AI global | Text, image, video, audio, PDF | Text | Yes | 1 | Keep Google as the sole route. Kie posts 70% lower token rates, but any test is offline replacement research only because 3.6 is now the preferred default and Kie retains logs for two months |
| GPT-5.4 | Azure | Text, image | Text | No | 0.75 | Keep Azure credits; add long-context billing. Do not move to Kie solely for its lower posted cash price |
| GPT-5.5 | Azure | Text, image | Text | No | 0.75 | Keep Azure credits; add long-context billing. The volatile `chat-latest` alias is not a replacement |
| GPT-5.6 Sol | Azure | Text, image | Text | No | 0.75 | Keep Azure; add long-context/cache-write billing and correct the registry multiplier from 0.5 to 0.75 |
| GPT-5.6 Terra | Azure | Text, image | Text | No | 0.75 | Keep Azure; add long-context/cache-write billing and correct the registry multiplier from 0.5 to 0.75 |
| GPT-5.6 Luna | Azure | Text, image | Text | No | 0.75 | Keep Azure; add long-context/cache-write billing and correct the registry multiplier from 0.5 to 0.75 |
| DeepSeek V4 Pro | Fireworks | Text | Text | No | 1 | Keep Fireworks as the full-capability route. Azure can be benchmarked only for no-tool requests because its catalog explicitly says tool calling is unsupported; do not trade away the current tool capability for credits |
| GPT-OSS 20B | OpenRouter candidate | Text | Text | Yes | 1 | Benchmark against OVHcloud; switch only after provider pinning, precision, credit balance, and parity tests |
| Qwen3.7 Max | OpenRouter | Text, image | Text | Yes | 1 | Verify the account-billed price and correct registry cost if necessary; public promotional pricing is insufficient |
| Grok Video Pro | Replicate candidate | Text, image | Video | Yes | 1 | Benchmark against xAI; switch only if behavior, parameters, price, and latency match |
| Qwen3-TTS Flash | Alibaba | Text | Audio | Yes | 1 | Replace with Qwen-Audio 3.0 TTS Flash after WebSocket, voice, and latency validation |
| Qwen3-TTS Instruct | Alibaba | Text | Audio | Yes | 1 | Consolidate onto Qwen-Audio 3.0 TTS Flash only where instruction behavior is preserved |
| Default music alias | Google Lyria 3 Clip | Text, image | Audio/music | Yes | 1 | Use Lyria for prompt-only music after latency/quality testing; retain ElevenMusic for reference audio and inpainting |
| Stable Audio 3 Medium | RunPod H200 candidate | Text, audio | Audio/music | Yes | 1 | Benchmark only; no GPU deployment until license clearance and sustained demand exceeds break-even |
| TRELLIS.2 Low | InferencePort | Image | 3D GLB | Yes | 1 | Keep the single managed route; evaluate self-hosting only as a deliberate replacement if demand and quality justify it |
| TRELLIS.2 Medium | InferencePort | Image | 3D GLB | Yes | 1 | Keep the single managed route; evaluate self-hosting only as a deliberate replacement if demand and quality justify it |
| TRELLIS.2 High | InferencePort | Image | 3D GLB | Yes | 1 | Keep the single managed route; this tier is least suitable for the hard timeout, so do not self-host without demand proof |

## Requested-model verdicts

| Requested name | What it resolves to | Pollinations coverage | Verdict |
|---|---|---|---|
| Grok 4.5 | `grok-4.5` | Already present through OpenRouter as `grok-4.5` / `grok-4-5` | **UPDATE/TEST ROUTE**, not a new model |
| Gemini 3.6 suite | Only `gemini-3.6-flash` is currently in the official 3.6 family | Missing; Google made it stable GA on 2026-07-21 | **UPDATE DEFAULT NOW AFTER LIVE TEST** |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | Missing; distinct from the current 3.1 Flash-Lite | **ADD AFTER LIVE TEST** |
| DeepGen | Interpreted as `deepgenteam/DeepGen-1.0`, an image generation/editing model | Missing | **WATCH**: Apache-2.0 and only 5B, but no inference provider and too little demand evidence for a Pollinations GPU |
| LongCat 2.0 | `LongCat-2.0` / `meituan/longcat-2.0` | Missing | **ADD AFTER TEST** through LongCat direct; OpenRouter reaches the same Meituan service at the same model rate but adds a pay-as-you-go platform fee |
| MAI image models | `MAI-Image-2.5-Flash` and `MAI-Image-2.5` | Missing | **TEST/ADD FLASH**, then add full 2.5 only if quality warrants it |
| GPT chat models | OpenAI `chat-latest`; Azure lists `gpt-chat-latest` | Missing as an alias, but behavior overlaps existing GPT-5.5/5.6 | **NO ADD FOR NOW**: OpenAI says the backing snapshot changes and recommends GPT-5.6 for production |
| CSM-1B | Sesame `sesame/csm-1b`, a conversational speech-generation model | Missing from the audio, text, and realtime registries | **TEST, THEN ADD** through OpenRouter/DeepInfra; this is an old 2025 model newly available through a synchronous managed route, not a new model release |

## Selected provider routes and posted prices

This comparison covers Pollinations' integrated providers plus the official labs, OpenRouter, Vercel AI Gateway, fal, Replicate, and Kie. It verifies public list prices, not private discounts, sponsored-credit balances, or actual invoice behavior. Any row marked **UNVERIFIED** remains blocked until an account-billed request confirms it.

Price-audit conclusion:

- **Lowest posted cash price or tied:** Inkling, LongCat 2.0, Recraft V4.1 Vector, Grok Voice, and the publicly priced Grok video routes.
- **Only exact eligible managed route found:** Gemini 3.6 Flash, Gemini 3.5 Flash-Lite, Lyria 3, and Qwen-Audio 3.0 TTS Flash. This means no cheaper exact route was found in the checked provider catalogs; it does not prove that an unpublished private price cannot exist.
- **Not verified cheapest:** Azure GPT is selected for credits rather than lowest cash price; Azure Mistral OCR 4 and MAI-Image-2.5-Flash lack reliable public billed pricing; Replicate media needs a billed blocking-response test; CSM-1B still needs an authenticated direct DeepInfra catalog and price check.

| Model | Selected provider route | Posted price | Comparison and price status |
|---|---|---|---|
| Gemini 3.6 Flash | Google Vertex AI global | $1.50 input, $0.15 cached, $7.50 output per 1M tokens | **BEST ELIGIBLE/ONLY EXACT ROUTE FOUND.** Google launch pricing; neither OpenRouter nor Vercel had the exact 3.6 ID during this check. A billed Vertex request must still confirm propagation |
| Gemini 3.5 Flash-Lite | Google Vertex AI global | $0.30 input, $0.03 cached, $2.50 output per 1M tokens | **BEST ELIGIBLE/ONLY EXACT ROUTE FOUND.** A billed Vertex request must confirm propagation |
| Azure GPT-5.4/5.5/5.6 family | Azure | Account-specific Azure rate; Azure credits available | **CREDIT-PREFERRED, NOT CASH-CHEAPEST.** Kie posts lower cash rates for several exact models, but Azure remains economically preferred while credits cover usage |
| Inkling | Vercel AI Gateway pinned to Baseten | $1 input, $0.17 cached, $4.05 output per 1M tokens | **BEST PRICE, TIED.** Vercel charges no model markup and matches Baseten direct; Vercel also lists Together at the same model price |
| LongCat 2.0 | LongCat direct | Promotional $0.30 input, $0.006 cached, $1.20 output per 1M tokens | **LOWEST POSTED CASH ROUTE.** OpenRouter lists the same model rate but charges a 5.5% pay-as-you-go platform fee on purchased credits |
| Mistral OCR 4 | Azure Foundry managed preview | Azure public table does not expose the price; Mistral direct is $4/1K pages | **UNVERIFIED/CREDIT-PREFERRED.** Do not approve until the Azure account-billed rate and credit eligibility are known |
| MAI-Image-2.5-Flash | Azure Foundry Global Standard preview | $1.75/M text and image input; Microsoft sources conflict between $19.50/M and $33/M image output | **UNVERIFIED.** Azure is the only exact Flash API route found, but the billed output meter must resolve the first-party pricing conflict |
| MAI-Image-2.5 | Azure Foundry Global Standard preview | $5/M text input, $8/M image input, $47/M image output | **BEST EFFECTIVE ROUTE WITH AZURE CREDITS.** OpenRouter exposes the same Azure backend at the same list rate |
| Recraft V4.1 Vector | Recraft direct API | $0.08/image | **BEST PRICE, TIED.** Recraft direct, fal, and OpenRouter all post $0.08/image; direct keeps the exact SVG API and avoids a gateway layer |
| Grok Video Pro | Replicate candidate | Base model: $0.05/sec at 480p or $0.07/sec at 720p | **PRICE TIED, PROVIDER SWITCH UNVERIFIED.** xAI and fal post the same rates; approve Replicate only if one billed POST returns completed media without follow-up polling and meets the timeout |
| Grok Imagine Video 1.5 | Replicate | $0.08/sec at 480p or $0.14/sec at 720p, plus $0.01/input image | **PRICE TIED, BILLING UNVERIFIED.** xAI and fal post the same rates and Replicate examples align; Kie is cheaper but requires asynchronous task polling and is therefore ineligible. Replicate must return completed media from one POST without follow-up polling |
| Lyria 3 Clip / Pro | Google Vertex AI global | $0.04 per 30-second Clip; $0.08 per full Pro song | **BEST ELIGIBLE/ONLY EXACT ROUTE FOUND.** Still requires a billed Vertex request and latency check |
| Qwen-Audio 3.0 TTS Flash | Alibaba Model Studio Singapore | $0.15/10K characters | **ONLY EXACT MANAGED ROUTE FOUND; NOT A SAVINGS UPDATE.** It costs more than the current Qwen3-TTS Flash ($0.10/10K) and Instruct ($0.115/10K), so upgrade only for material capability gains |
| CSM-1B | OpenRouter pinned to DeepInfra, pending direct-route check | $0.007/1K characters before OpenRouter's pay-as-you-go credit fee | **BEST PUBLISHED ELIGIBLE ROUTE FOUND; DIRECT DEEPINFRA UNVERIFIED.** fal charges $0.03/1K characters. Query the authenticated DeepInfra catalog and account price before approval because DeepInfra is the actual upstream and OpenRouter charges a pay-as-you-go platform fee |
| Grok Voice Think Fast 1.0 | xAI direct | $0.05/minute ($3/hour) | **BEST PRICE, TIED.** Vercel AI Gateway exposes the same xAI route at the same price; direct avoids an experimental gateway dependency |

### CSM-1B hosting and implementation note

- **Why it is worth testing:** the official repository has 14.7k stars, while the official Hugging Face model page shows 2.41k likes and roughly 250k downloads in the last month. Its differentiator is conversational prosody conditioned on dialogue context; no independent benchmark found in this pass proves superiority over Pollinations' current ElevenLabs or Qwen TTS routes.
- **Route fit:** OpenRouter added `sesame/csm-1b` in April 2026 and exposes a synchronous, streamable OpenAI-compatible speech endpoint backed only by DeepInfra. First query DeepInfra's authenticated catalog and account price: a direct DeepInfra route would avoid OpenRouter's pay-as-you-go credit fee if the exact model is available there. The public OpenRouter catalog currently has too little traffic to show latency or uptime, so a billed P50/P95, cold-start, voice, format, maximum-length, usage, and error-path test is mandatory on whichever single route is selected.
- **Self-hosting:** Apache-2.0; the official stack is PyTorch/Transformers (`CsmForConditionalGeneration` landed in Transformers 4.52.1) on CUDA, and the official checkpoint page reports 2B F32 parameters. Sesame documents CUDA 12.4/12.6; Replicate demonstrates the model on an L40S. Do not provision a Pollinations GPU: the managed OpenRouter route is already cheap and actual Pollinations demand is unknown.
- **Implementation surface:** add the model definition and billing in `shared/registry/audio.ts`, then add an OpenRouter raw-audio streaming branch plus request/voice validation in `gen.pollinations.ai/src/routes/audio.ts` and its source OpenAPI schema. No realtime or text-registry entry is needed because CSM-1B generates speech but is not a conversational LLM.
- **Risks:** English only; the open checkpoint has no fixed voices; best quality requires conversational audio context that the recommended OpenRouter route does not expose; one upstream provider; voice-cloning/impersonation safeguards; and no independent quality benchmark located. **Verdict: TEST, THEN ADD; paid-only; multiplier 1; no Pollinations GPU.**

## Kie.ai evaluation

Kie is a credible **price-test provider for synchronous chat**, not a usable media provider under Pollinations' current contract.

| Kie chat route | Kie posted price per 1M tokens | Current/official comparison | Decision |
|---|---:|---:|---|
| Grok 4.5 | $0.80 input / $0.20 cached / $2.40 output | $2 / $0.50 / $6 | **TEST FIRST**; potential 60% cash saving |
| Gemini 3.5 Flash | $0.45 input / $2.70 output | $1.50 / $9 | **TEST LEGACY EXACT MODEL**; potential 70% saving, but 3.6 should become the default |
| GPT-5.5 | $1.40 input / $0.14 cached / $8.40 output | $5 / $0.50 / $30 | **WATCH**, because Azure credits dominate current cash economics |
| GPT-5.6 Sol | $1.40 input / $0.14 cached / $8.40 output | $5 / $0.50 / $30 | **WATCH**, keep Azure |
| GPT-5.6 Terra | $0.70 input / $0.07 cached / $4.20 output | $2.50 / $0.25 / $15 | **WATCH**, keep Azure |
| GPT-5.6 Luna | $0.28 input / $0.028 cached / $1.68 output | $1 / $0.10 / $6 | **WATCH**, keep Azure |

- Kie's chat endpoints stream synchronously, so they can fit the text API. Kie's general generation docs say **all media generation tasks are asynchronous** and require a webhook or polling; that rules out its image, video, music, and similar media routes today.
- The apparent media discounts are large—for example Grok Imagine Video 1.5 is posted at $0.008/sec for 480p and $0.015/sec for 720p—but the API returns only a task ID.
- Kie now lists Grok Imagine Video 1.5, but its media contract still requires a task ID plus polling or a callback. Kie does not currently list Gemini 3.6 Flash, Gemini 3.5 Flash-Lite, LongCat 2.0, DeepGen 1.0, MAI-Image, Inkling, OCR 4, Lyria 3, Recraft V4.1 Vector, or Grok Voice.
- Before any Kie switch, verify exact upstream identity, long-context tiers, cache accounting, tool/image parity, P50/P95, burst limits, refunds, retention/DPA, routing transparency, and billed credit conversion. Kie documents 14-day media retention, two-month log/metadata retention, and slightly lower stability than official providers.

## Key evidence

- Google released [Gemini 3.6 Flash and Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/changelog) as stable GA on 2026-07-21. [Pricing](https://ai.google.dev/gemini-api/docs/pricing).
- Pollinations already has Grok 4.5 in `shared/registry/text.ts` and routes it through OpenRouter in `gen.pollinations.ai/src/text/configs/modelConfigs.ts`. [xAI route and pricing](https://docs.x.ai/developers/grok-4-5).
- LongCat provides an [official API and pricing page](https://longcat.chat/platform/docs/Pricing/LongCat-2.0.html); [OpenRouter](https://openrouter.ai/meituan/longcat-2.0) exposes the same canonical model but applies a [5.5% pay-as-you-go platform fee](https://openrouter.ai/pricing) when credits are purchased.
- DeepGen's [official model card](https://huggingface.co/deepgenteam/DeepGen-1.0) says Apache-2.0, 5B parameters, and no deployed inference provider.
- Azure documents the [MAI image endpoints](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai) and lists [Foundry models sold directly by Azure](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure). Microsoft's [MAI announcement](https://microsoft.ai/news/introducing-mai-image-2-5/) and its [Azure announcement](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/new-mai-models-in-microsoft-foundry-across-text-image-voice-and-speech/4524632) currently disagree on Flash image-output pricing.
- Mistral posts [OCR 4 at $4/1K pages](https://docs.mistral.ai/models/model-cards/ocr-4-0), while [Azure's public Mistral pricing table](https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/mistral-ai/) does not expose a numeric rate. Recraft posts [V4.1 Vector at $0.08/image](https://www.recraft.ai/pricing?tab=api), matching [fal](https://fal.ai/models/fal-ai/recraft/v4.1/text-to-vector).
- Google documents [Lyria 3](https://ai.google.dev/gemini-api/docs/music-generation) and its request pricing on the [Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing).
- Sesame released [CSM-1B](https://huggingface.co/sesame/csm-1b) on 2025-03-13 under Apache-2.0; the [official repository](https://github.com/SesameAILabs/csm) documents its CUDA/Transformers stack. [OpenRouter](https://openrouter.ai/sesame/csm-1b/providers) exposes a synchronous $7/M-character route through DeepInfra, versus [fal at $0.03/1K characters](https://fal.ai/models/fal-ai/csm-1b); exact direct DeepInfra availability is not public and remains an account-catalog check.
- [Baseten](https://www.baseten.co/pricing/) and [Vercel AI Gateway](https://vercel.com/ai-gateway/models) post the same Inkling model price; Vercel says the gateway has [zero model markup](https://vercel.com/docs/ai-gateway/pricing).
- Alibaba's [Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing) lists Qwen-Audio 3.0 TTS Flash at $0.15/10K characters, above the current Qwen3-TTS Flash and Instruct routes.
- xAI posts [Grok video and realtime voice pricing](https://x.ai/api); [fal's Grok Imagine Video 1.5 route](https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video) matches xAI's video rate. Replicate remains a candidate only until its single-request completion behavior and billed rate are verified.
- OpenAI documents [`chat-latest`](https://developers.openai.com/api/docs/models/chat-latest) as a regularly updated alias and recommends GPT-5.6 for production.
- Kie documents its [asynchronous generation contract, retention, and stability tradeoff](https://docs.kie.ai/) and publishes its current [pricing catalog](https://kie.ai/pricing).

## Today's actions

1. Make one billed request to Gemini 3.6 Flash and Gemini 3.5 Flash-Lite through Vertex global; if an ID has not propagated, keep that model blocked rather than selecting another route.
2. Run Kie chat-only parity tests for Grok 4.5 and the exact Gemini 3.5 Flash model. Do not integrate Kie media.
3. Check the Azure account for MAI-Image-2.5-Flash, MAI-Image-2.5, Mistral OCR 4, and DeepSeek V4 Pro deployment access, quota, portal price, and sponsorship eligibility. Treat DeepSeek as no-tool benchmark traffic only.
4. Test LongCat 2.0 through its direct API, including tools, structured output, streaming usage, 1M-context boundaries, billed price, burst capacity, and failure behavior.
5. Query the authenticated DeepInfra catalog and account price for CSM-1B. Select exactly one route, then make billed requests across every advertised voice and MP3/PCM output; measure warm/cold P50/P95, maximum practical text length, total completion time, response headers, and voice consistency against ElevenLabs Flash and Qwen TTS.
6. Complete the GPT long-context billing corrections; these remain the highest-confidence economic update.

## Required confirmation before implementation

Every approved model or provider change must get a complete row with no inherited or blank values:

| Canonical name | Aliases | Price multiplier | Paid only | Pollinations GPU | Registry provider | Primary route and model ID |
|---|---|---:|---:|---:|---|---|
| To be confirmed | To be confirmed | To be confirmed | To be confirmed | To be confirmed | To be confirmed | To be confirmed |

## Source-of-truth files

- `shared/registry/text.ts`
- `shared/registry/image.ts`
- `shared/registry/audio.ts`
- `shared/registry/embeddings.ts`
- `shared/registry/realtime.ts`
- `shared/registry/model3d.ts`
- `gen.pollinations.ai/src/text/configs/modelConfigs.ts`
- Image, video, audio, realtime, and 3D handlers under `gen.pollinations.ai/src/`

## Change log

- 2026-07-21: Removed the out-of-scope GPU migration from the active plan; updated Gemini 3.6 to the official launch price of $7.50/M output, selected LongCat direct, added provider-price confidence gates, and marked direct DeepInfra pricing as unresolved for CSM-1B.
- 2026-07-21: Started Update PR 1 on `codex/gemini-3-6-default`. Live Vertex tests passed text, image, audio, video, streaming, tools, code execution, grounded search, sampling parameters, concurrency, usage headers, and Tinybird billing. Shipping remains blocked until Gemini 3.6 returns cached tokens through the gateway; implicit and explicit cache probes currently report zero cache hits.
- 2026-07-21: Clarified that no fallback means one upstream route, not removal of public aliases. The Gemini 3.6 migration preserves the Gemini 3.5 aliases and routes the retired full Gemini 2.5 Flash identifiers to the upgraded `gemini` service; Flash-Lite and search aliases remain on their distinct services.
- 2026-07-21: Added the top-level implementation sequence, grouped updates into separate pull requests, and ordered additions.
- 2026-07-21: Removed every proposed secondary route. Each model now has one selected provider and primary route with no runtime failover.
- 2026-07-21: Added CSM-1B as **TEST, THEN ADD** through the new synchronous OpenRouter/DeepInfra speech route; documented economics, limitations, implementation surface, and the decision not to provision a Pollinations GPU.
- 2026-07-21: Added verified routing decisions for Kie, Grok 4.5, Gemini 3.6 Flash, Gemini 3.5 Flash-Lite, DeepGen 1.0, LongCat 2.0, MAI-Image 2.5, and `chat-latest`; promoted Azure for OCR 4 if parity passes, but rejected Azure as a full DeepSeek V4 Pro replacement because it lacks tool calling.
- 2026-07-21: Created from the merged model-discovery and price-scout recommendations. Removal recommendations remain intentionally out of scope.
