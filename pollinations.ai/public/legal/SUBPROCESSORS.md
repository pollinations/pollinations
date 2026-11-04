# Service Providers

**Last updated: 2026-10-18**

These providers process personal data for us. Some process it outside the EEA, including in the United States; see the [Privacy Policy](/privacy) for transfer safeguards.

## Infrastructure and tools

| Provider | Purpose |
| --- | --- |
| Cloudflare | Hosting, storage, caching, tool containers, and account email delivery |
| Tinybird | Usage and billing analytics |
| Amazon Bedrock | Prompt safety checks |
| Stripe | Payments and invoices |
| Google Workspace | Support email |
| E2B | Code sandboxes |
| Exa | Web search |
| Composio | Connected-account tools |

## Model providers

The model you choose, or its fallback, decides which of these receives your request. OpenRouter, Vercel AI Gateway and InferencePort pass requests on to the model's host.

Alibaba Cloud, Amazon Bedrock, Anthropic, AssemblyAI, DeepInfra, ElevenLabs, fal.ai, Fireworks AI, Google, InferencePort, Microsoft Azure, Mistral AI, Novita AI, OpenAI, OpenRouter, OVHcloud, Perplexity, Replicate, Stability AI, Vast.ai, Vercel AI Gateway, vLLM Semantic Router, xAI.

The [vLLM Semantic Router Decision API](https://decision.vllm-sr.ai/docs#logging) may log requests and outputs and use them for model training. Do not send confidential data to this provider.

Questions, including which host serves a specific model: **hello@pollinations.ai**
