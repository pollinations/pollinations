# pollinations.ai MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
Pollinations models and API capabilities as agent tools.

## Connect

Connect a Streamable HTTP client to:

```text
https://gen.pollinations.ai/mcp/pollinations
```

Send a Pollinations API key with every request:

```http
Authorization: Bearer YOUR_KEY
```

Get a key from [enter.pollinations.ai](https://enter.pollinations.ai/keys).
Calls use that key's wallet, permissions, and budget.

### Staging pilot for external agents

Connect a Streamable HTTP client to `https://staging.gen.pollinations.ai/mcp/pollinations-code`
with a funded [staging key](https://staging.enter.pollinations.ai/keys). Pass an async JavaScript
function to the `code` tool. For example, look up three image models and their prices:

```js
async () => {
    const models = await pollinations.listModels({ type: "image", limit: 3 });
    return models.map(({ name, pricing }) => ({ name, pricing }));
}
```

To generate an image, call `pollinations.generateImage({ model, prompt, seed })` and read
`data[0].url`. Keep the model, prompt, seed and options identical when retrying to rejoin
a generation or fetch its cached image. Completed generations are billed even if the script fails.
The [staging replay](../../apps/mcp-code/staging-replay.js) checks three images and their wallet charges.

Each run allows four tool attempts, 100 ms of sandbox CPU and three minutes elapsed, with no direct
network access. Each account gets ten runs per minute at each Cloudflare location.
Pollinations covers sandbox execution during the pilot.

For all Pollinations-hosted MCP servers, see the
[MCP Servers documentation](https://gen.pollinations.ai/docs#tag/mcp-servers).

## Tools

| Tool | Purpose | API route |
| --- | --- | --- |
| `generateText` | Text, search, multimodal input, and tool calling | `/v1/chat/completions` |
| `generateImage` | Generate or edit images | `/v1/images/generations` |
| `generateVideo` | Generate video | `/video/{prompt}` |
| `generateAudio` | Generate speech, music, or sound | `/audio/{text}` |
| `transcribeAudio` | Transcribe a public HTTPS audio URL | `/v1/audio/transcriptions` |
| `isolateSpeech` | Remove background noise from a spoken audio or video URL | `/v1/audio/voice-isolator` |
| `changeVoice` | Transform the speaker identity of an audio URL | `/v1/audio/voice-changer` |
| `generate3D` | Generate a GLB model | `/3d/{prompt}` |
| `createEmbeddings` | Create text or multimodal embeddings | `/v1/embeddings` |
| `listModels` | Search and list live models, capabilities, voices, and pricing; narrow with `query`, `capabilities`, `agent`, `community`, `limit` | Model registry routes |
| `getModelStatus` | Inspect recent requests, errors, and latency | `/models/status` |
| `listMcpServers` | List the other hosted MCP servers, their endpoints and pricing | `/mcp` |
| `getBalance` | Check the remaining balance; requires `account:usage` | `/account/balance` |
| `getUsage` | Request history or daily summary; requires `account:usage` | `/account/usage`, `/account/usage/daily` |
| `getEarnings` | Developer earnings from BYOP apps and community models; requires `account:usage` | `/account/earnings` |
| `listQuests` | Quests with reward and claim state; requires `account:usage` | `/account/quests` |
| `listKeys` | List API keys; requires `account:keys` | `/account/keys` |
| `createKey` | Create a secret or publishable app key; requires `account:keys` | `POST /account/keys` |
| `revokeKey` | Revoke a key by id; requires `account:keys` | `DELETE /account/keys/{id}` |
| `listSites` | Static sites and limits; requires `account:machines` | `/account/sites` |
| `deploySite` | Publish inline files at `https://<name>.pollinations.app`; requires `account:machines` | `PUT /account/sites/{name}` |
| `deleteSite` | Take a site offline; requires `account:machines` | `DELETE /account/sites/{name}` |

Generated media is returned as an MCP resource link using the API's existing
public Media URL. No download or re-upload is needed, and binary data does not
consume model context. Anyone with the link can access it; expired files return 404.

Models, voices, capabilities, and pricing come from the live registry. Use
`listModels` before selecting a model or voice.

Agents (`agent: true`) bill the caller for each model and tool call they make;
`getUsage` lists those charges under the models the agent called. An agent
without `base_model` lists only `currency` in `pricing`.

## Development

Requires Node.js 20 or newer. Run the tests with:

```bash
npm test
```

The hosted Cloudflare Worker lives in [`apps/mcp/`](../../apps/mcp/) and is
routed through Gen.

## Previous stdio server

The discontinued local stdio server is preserved in
[`@pollinations/mcp@2.5.0`](https://www.npmjs.com/package/@pollinations/mcp/v/2.5.0)
and in the
[`packages/mcp` source at its final commit](https://github.com/pollinations/pollinations/tree/f7809a98877e2e34455b0799952ab5267e37e58d/packages/mcp).

Issues: [GitHub](https://github.com/pollinations/pollinations/issues) · License:
MIT
