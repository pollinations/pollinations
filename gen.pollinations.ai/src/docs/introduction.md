> Generate text, images, video, audio, realtime voice, and embeddings with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.

**Base URL:** `https://gen.pollinations.ai`

**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai/keys)

**Model catalog migration:** model IDs now use `publisher/model` names. Existing aliases remain valid in requests; match catalog entries against both their canonical ID and `aliases` when restoring saved selections. Catalog metadata uses `publisher` (for example, `OpenAI`) instead of `brand`; update clients reading that field. `publisher` identifies the model publisher, not the inference provider. The existing `brand_url` logo field is unchanged. See the [live model catalog](https://gen.pollinations.ai/models) for current IDs and aliases.

**Integrations:** [Connect User Wallets](/docs#tag/connect-user-wallets) · [Publish a Model](/docs#tag/publish-a-model) · [Publish an Agent](/docs#tag/publish-an-agent) · [MCP Servers](/docs#tag/mcp-servers) · [CLI](/docs#tag/cli)
