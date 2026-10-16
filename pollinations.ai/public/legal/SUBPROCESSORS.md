# Service Providers

**Last updated: 2026-10-16**

These providers process personal data for us. Some process it outside the EEA, including in the United States; see the [Privacy Policy](/privacy) for transfer safeguards.

## Infrastructure and tools

| Provider | Purpose |
| --- | --- |
| Cloudflare | Hosting, storage, caching, and tool containers |
| Tinybird | Usage and billing analytics |
| Amazon Bedrock | Prompt safety checks |
| Stripe | Payments and invoices |
| Google Workspace | Support email |
| E2B | Code sandboxes |
| Exa | Web search |
| Composio | Connected-account tools |

## Public data services

When you use the OSV tools, [OSV.dev](https://osv.dev/) receives the package
ecosystem, name and version, or the advisory ID you request. Pagination tokens
are sent back to OSV when you continue a query. Pollinations API keys and
account cookies are not forwarded.

## Model providers

The model you choose, or its fallback, decides which of these receives your request. OpenRouter, Vercel AI Gateway and InferencePort pass requests on to the model's host.

Alibaba Cloud, Amazon Bedrock, Anthropic, AssemblyAI, DeepInfra, ElevenLabs, fal.ai, Fireworks AI, Google, InferencePort, Microsoft Azure, Mistral AI, Novita AI, OpenAI, OpenRouter, OVHcloud, Perplexity, Replicate, Stability AI, Vast.ai, Vercel AI Gateway, xAI.

Questions, including which host serves a specific model: **hello@pollinations.ai**
