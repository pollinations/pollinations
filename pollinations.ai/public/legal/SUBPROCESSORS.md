# Sub-processor Register

**Updated: 2026-10-09 — Draft inventory; verification pending.**

This register accompanies the [Data Processing Addendum](/dpa). It records services identified in the repository; it is not yet a verified list of approved legal entities. Before publication, confirm each contracted entity, role, processing countries, downstream providers, retention/training terms, signed processing agreement, and transfer safeguard against the live deployment and supplier contract. A provider's headquarters or endpoint hostname alone does not establish where it processes data.

## Shared infrastructure

| Service | Purpose and data potentially processed | Location evidence and outstanding verification |
| --- | --- | --- |
| Cloudflare | Edge routing, Workers, databases, object storage, and media delivery; request content, cached outputs, uploaded media, account and technical data as applicable. | Distributed infrastructure. Confirm the contracted entity, actual storage/processing settings and countries, retention, and transfer terms. No EEA-only commitment is established. |
| Amazon Web Services | Hosted operational services and configured Bedrock inference; request content and operational data where those services are used. | Bedrock config defaults to US East (Northern Virginia); other service locations and cross-region inference require deployment verification. Confirm entity and agreements. |
| Tinybird | Usage and billing analytics; request/account identifiers, usage and payment-event metadata as described in the Privacy Policy. | Configured API host is Europe West 2 (London, UK). Confirm dataset residency, other processing locations, entity, retention and safeguards; the host alone is insufficient. |
| Vast.ai and the selected GPU host operator | Pollinations-operated GPU inference; prompts, input media, outputs, and technical request data. | Locations vary by rented host. Verify both the marketplace's role and the host operator's identity, access, agreements, and processing country; record changes before routing personal data. |

The text gateway defaults to a Pollinations-operated Portkey endpoint. Using open-source gateway software does not establish that Portkey's hosted service receives data. Confirm the live gateway host and any external telemetry before adding a hosted gateway supplier.

## Model and inference services

These service names appear in the model registry or inference configuration. The selected model, actual primary route, intermediary, and all fallbacks determine which receive a request. They may receive prompts, messages, instructions, tools/results, input files or media, generated outputs, and request metadata. Model publisher names alone do not identify the processor.

**For every row below, the contracted legal entity, executed DPA, provider retention/training settings, downstream processing countries, and applicable transfer safeguards remain to be verified.** A listed service is not an assertion that every request reaches it or that every configured route is active in production.

| Service | Configured role / location evidence |
| --- | --- |
| Microsoft Azure | Text, image, and audio inference. Configurations include East US (United States) and Sweden Central (Sweden); verify each deployment and service's processing geography. |
| Google Cloud / Vertex AI | Text, image, video, and audio inference; country depends on the configured service, deployment, and any global routing. |
| Amazon Bedrock | Text inference; default region US East (Northern Virginia), subject to live configuration and cross-region routing. |
| OpenAI | Direct text inference on configured routes; distinct from OpenAI models served through Microsoft Azure or intermediaries. |
| Alibaba Cloud / DashScope | Text, image, video, and audio inference; international endpoint configuration is not proof of processing country. |
| Mistral AI | Direct text inference on configured routes; distinct from Mistral models hosted by Azure or intermediaries. |
| OVHcloud | Text and audio inference on configured routes; verify selected deployment region. |
| Fireworks AI | Text inference. |
| DeepInfra | Text, image, and audio inference. |
| Novita AI | Text inference. |
| Perplexity | Search/text inference. |
| OpenRouter | Inference routing; identify the selected downstream providers and fallback policy as well as OpenRouter itself. |
| Vercel AI Gateway | Inference routing; identify downstream inference providers and their locations. |
| fal.ai | Image, video, and audio inference and configured fallbacks. |
| Replicate | Image and video inference. |
| xAI | Text, image, and audio inference on configured routes. |
| ElevenLabs | Audio inference. |
| AssemblyAI | Audio transcription. |
| Stability AI | Audio inference. |

### Configured downstream provider tags

Pinned OpenRouter text routes also identify the following downstream services. These are routing identifiers, not verified contracting entities or proof of processing locations: **AkashML, Anthropic, CoreWeave, Friendli, Inception, MiniMax, Moonshot AI, Nex AGI, Parasail, Phala, StreamLake, Together AI, Xiaomi, and Z.ai**, alongside Alibaba, DeepInfra, Google AI Studio / Vertex AI, Novita, and xAI already listed above. Their entities, countries, onward processors, and applicable terms must be verified for the selected route. Unpinned gateway routes require confirmation of the actual served provider as well.

### Currently documented examples

- **zimage / tongyi-mai/z-image-turbo:** Pollinations-operated Vast GPU. The latest recorded production replacement on 2026-09-26 is in **Florida, United States**. fal.ai can also process requests through the configured fallback; its processing country and terms require confirmation.
- **openai/gpt-5.4-nano:** the configured direct route uses **Microsoft Azure East US, United States**. The model's OpenAI publisher identity does not establish direct processing by OpenAI.

These are configuration/inventory observations, not binding region restrictions. Confirm live routing and every fallback before agreeing to a customer's residency requirements.

## Independent services and controller processing

- **Externally hosted community endpoints, including InferencePort:** independently operated services described in the Privacy Policy. Their routing and fallback providers must be disclosed separately. This draft does not verify their data practices or authorise them as Pollinations sub-processors for personal-data processing under the DPA.
- **Stripe:** payment processing and invoice delivery. Pollinations processes account, billing, and fraud records as controller; Stripe's applicable role and terms must be assessed separately. Listing it here does not make payment processing part of API inference.
- **GitHub, Discord, and email providers:** account/community/support channels, with their own applicable roles and policies. Do not submit Customer Data in public support channels.
- **Customer-authorised apps and tools:** selected by the Customer; their own processing arrangements may be required.

## Changes and enquiries

For verified sub-processors, additions or replacements require at least **14 days' prior notice** to affected Customers and the objection process in the DPA. Changing a region, host operator, downstream provider, or fallback may change the data-processing arrangement even if a public model name stays the same.

Contact **hello@pollinations.ai** for route-specific information, supplier terms, or a data-protection objection. Unverified entries must be resolved before this register is published as an approved list or supplied as evidence of compliance.
