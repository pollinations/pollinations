# Service Providers

**Last updated: 2026-10-09**

This page describes services identified in Pollinations' configuration and operational inventory, including infrastructure, inference, and hosted tools. Which services receive data depends on the selected route and its fallbacks. It is a provider disclosure, not a Data Processing Addendum or a certification of supplier contractual coverage.

Contracting entities, applicable processing terms, account-specific retention/training settings, and transfer safeguards have not been verified for every listed route. A service name, headquarters, or endpoint hostname alone does not establish a processing country. Contact **hello@pollinations.ai** before using a route that requires a specific processing agreement, residency restriction, or retention guarantee.

## Shared infrastructure

| Service | Purpose and data potentially processed | Location evidence and outstanding verification |
| --- | --- | --- |
| Cloudflare | Edge routing, Workers, databases, object storage, media delivery, and containers for the Computer and FFmpeg tools; request content, files, shell commands, tool results, cached outputs, uploaded media, account and technical data as applicable. | Distributed infrastructure. Confirm the contracted entity, actual storage/processing settings and countries, retention, and transfer terms. No EEA-only commitment is established. |
| Tinybird | Usage and billing analytics; request/account identifiers, usage and payment-event metadata as described in the Privacy Policy. | Configured API host is Europe West 2 (London, UK). Confirm dataset residency, other processing locations, entity, retention and safeguards; the host alone is insufficient. |
| Vast.ai and the selected GPU host operator | Pollinations-operated GPU inference; prompts, input media, outputs, and technical request data. | Locations vary by rented host. Verify both the marketplace's role and the host operator's identity, access, agreements, and processing country; record changes before routing personal data. |

The text gateway defaults to a Pollinations-operated Portkey endpoint. Using open-source gateway software does not establish that Portkey's hosted service receives data. Confirm the live gateway host and any external telemetry before adding a hosted gateway supplier.

## Model and inference services

These service names appear in the model registry or inference configuration. The selected model, actual primary route, intermediary, and all fallbacks determine which receive a request. They may receive prompts, messages, instructions, tools/results, input files or media, generated outputs, and request metadata. Model publisher names alone do not identify the processor.

**For every row below, the contracted legal entity, applicable processing terms, provider retention/training settings, downstream processing countries, and applicable transfer safeguards remain to be verified.** A listed service is not an assertion that every request reaches it or that every configured route is active in production.

| Service | Configured role / location evidence |
| --- | --- |
| Microsoft Azure | Text, image, audio, and embedding inference. Configurations include East US (United States) and Sweden Central (Sweden); verify each deployment and service's processing geography. |
| Google Cloud / Vertex AI | Text, image, video, audio, and embedding inference; country depends on the configured service, deployment, and any global routing. |
| Amazon Bedrock | Text inference and prompt-safety screening, including on image and audio routes. The configured entry region defaults to US East (Northern Virginia); configured global inference profiles can process requests in supported commercial AWS regions worldwide. This is not a US-only processing commitment. See the retention note below. |
| OpenAI | Direct text inference on configured routes; distinct from OpenAI models served through Microsoft Azure or intermediaries. |
| Alibaba Cloud / DashScope | Text, image, video, and audio inference; international endpoint configuration is not proof of processing country. |
| Mistral AI | Direct text inference on configured routes; distinct from Mistral models hosted by Azure or intermediaries. |
| OVHcloud | Text and audio inference on configured routes; verify selected deployment region. |
| Fireworks AI | Text inference. |
| DeepInfra | Text, image, audio, and embedding inference. |
| Novita AI | Text inference. |
| Perplexity | Search/text inference. |
| OpenRouter | Inference routing; identify the selected downstream providers and fallback policy as well as OpenRouter itself. |
| Vercel AI Gateway | Inference routing; identify downstream inference providers and their locations. |
| InferencePort | Image and 3D generation from prompts and input images, including model routing; confirm its operator, hosting, downstream providers, and processing locations. |
| fal.ai | Image, video, and audio inference and configured fallbacks. |
| Replicate | Image and video inference. |
| xAI | Text, image, and audio inference on configured routes. |
| ElevenLabs | Audio inference. |
| AssemblyAI | Audio transcription. |
| Stability AI | Audio inference. |

### Configured downstream provider tags

Pinned OpenRouter text routes also identify the following downstream services. These are routing identifiers, not verified contracting entities or proof of processing locations: **AkashML, Anthropic, CoreWeave, Friendli, Inception, MiniMax, Moonshot AI, Nex AGI, Parasail, Phala, StreamLake, Together AI, Xiaomi, and Z.ai**, alongside Alibaba, DeepInfra, Google AI Studio / Vertex AI, Novita, and xAI already listed above. **TypeSafe (System One / Jev)** also receives text inputs through configured OpenRouter and Vercel AI Gateway routes. Their entities, countries, onward processors, and applicable terms must be verified for the selected route. Unpinned gateway routes require confirmation of the actual served provider as well.

### Bedrock retention

AWS's [current retention policy](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html) says models requiring AWS review, including Claude Fable 5 and 5.1, can retain inputs and outputs for up to 30 days within AWS. The legacy `provider_data_share` setting does not currently send content to model providers. This describes AWS's policy; our live account setting and each route's effective retention still require verification. [Global inference](https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html) can also change the processing and retention region.

### Currently documented examples

- **zimage / tongyi-mai/z-image-turbo:** Pollinations-operated Vast GPU. The latest recorded production replacement on 2026-09-26 is in **Florida, United States**. fal.ai can also process requests through the configured fallback; its processing country and terms require confirmation.
- **openai/gpt-5.4-nano:** the configured direct route uses **Microsoft Azure East US, United States**. The model's OpenAI publisher identity does not establish direct processing by OpenAI.

These are configuration/inventory observations, not binding region restrictions. Confirm live routing and every fallback before agreeing to a customer's residency requirements.

## Tools and sandbox services

These services can receive customer request data when the corresponding API or hosted tool is used. Their processing terms, retention, countries, and transfer safeguards are subject to the same limitations described above.

| Service | Configured role and data potentially processed |
| --- | --- |
| E2B | Code execution and sandboxes through Pollinations' E2B account; sandbox files, commands, code, outputs, and technical metadata. Some sandbox traffic goes directly from the client to E2B. |
| Exa | Hosted web search and page retrieval; queries, requested URLs, retrieved page content, and tool metadata. |
| Composio | Pollinations' hosted connector service for user-connected accounts; account identifiers, connection credentials, tool inputs, connected-account content, and results. The connected services also receive the actions the customer authorises. |

Composio is part of the hosted tool service, even though the customer chooses which accounts to connect. Its [standard-plan documentation](https://docs.composio.dev/kb/guide/platform-compliance-data-handling) does not promise end-to-end zero retention or no training and directs customers needing contractual DPA terms to its Enterprise offering. Customer-selected destination services have their own terms as well.

## Independent services and controller processing

- **Externally hosted community endpoints:** independently operated services described in the Privacy Policy. Their routing and fallback providers must be disclosed separately. Their data practices and processing terms are not verified by this inventory. Pollinations remains responsible for its own processing and for providers it engages as sub-processors.
- **Stripe:** payment processing and invoice delivery. Pollinations processes account, billing, and fraud records as controller; Stripe's applicable role and terms must be assessed separately. Listing it here does not make payment processing part of API inference.
- **Buffer:** social-media scheduling and publishing. Receives post text, media links, and connected social-channel information; it is not used to deliver API inference. Confirm its contracting entity, locations, and applicable terms separately from API processing.
- **GitHub, Discord, and email providers:** account/community/support channels, with their own applicable roles and policies. Do not submit customer request data in public support channels.
- **Customer-authorised apps and tools:** selected by the Customer; their own processing arrangements may be required.

## Changes and enquiries

We give at least **14 days' prior notice** of material sub-processor changes, as stated in the Terms and Privacy Policy. Changing a region, host operator, downstream provider, or fallback may change the data-processing arrangement even if a public model name stays the same. Updating this page alone is not customer notice.

Contact **hello@pollinations.ai** for route-specific information or a data-protection enquiry. This inventory does not replace the processing terms or transfer safeguards required for personal data.

Sources: [model and tool registries](https://github.com/pollinations/pollinations/tree/main/shared/registry), [inference configuration](https://github.com/pollinations/pollinations/blob/main/gen.pollinations.ai/src/text/configs/modelConfigs.ts), and [GPU inventory](https://github.com/pollinations/pollinations/blob/main/operations/infrastructure/gpu/GPU_INSTANCES.md).
