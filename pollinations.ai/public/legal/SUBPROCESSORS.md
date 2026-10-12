# Service Providers

**Last updated: 2026-10-12**

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

## Model providers

The model you choose, or its fallback, decides which of these receives your request. OpenRouter and Vercel AI Gateway pass requests on to the model's host.

Alibaba Cloud, Amazon Bedrock, AssemblyAI, DeepInfra, ElevenLabs, fal.ai, Fireworks AI, Google, InferencePort, Microsoft Azure, Mistral AI, Novita AI, OpenAI, OpenRouter, OVHcloud, Perplexity, Replicate, Stability AI, Vast.ai, Vercel AI Gateway, xAI.

Grok 4.7 uses Microsoft Azure for primary inference and OpenRouter to route fallback requests to xAI’s ZDR endpoint. These routes receive message text, supplied images or image URLs, tool definitions/results, generation settings, outputs, and usage metadata. Azure Global Standard can process outside the resource region; this route does not guarantee a fixed processing location.

Questions, including which host serves a specific model: **hello@pollinations.ai**
