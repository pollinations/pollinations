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
with a funded staging API key. The server exposes one tool, `code`. Pass an
async JavaScript function as its `code` string. For example, this function
looks up image models and compares up to three with the same prompt:

```js
async () => {
    const models = await pollinations.listModels({ type: "image" });
    const selected = models.filter(model => {
        const rate = Number(model.pricing?.completionImageTokens);
        return rate > 0 && rate <= 0.01;
    }).slice(0, 3);
    return Promise.all(selected.map(async ({ name }) => {
        try {
            const image = await pollinations.generateImage({
                model: name, prompt: "A sunflower drawn in blue ink", seed: 42,
            });
            return { model: name, url: image.data[0].url };
        } catch (error) {
            return { model: name, error: error.message };
        }
    }));
}
```

`listModels` returns the live catalog array. The example filters on the listed
image rate; final charges follow the selected models' billing rules.
`generateImage` returns the image API's JSON response. A script gets four
tool attempts, including failed or parallel calls. The sandbox has no direct
network access. Each run allows 100 ms of sandbox CPU time and up to three
minutes of elapsed time. The gateway allows ten executions per key per minute
at each Cloudflare location. Pollinations covers sandbox execution during the pilot and
charges each billable generation to the calling key.

If a client disconnects after dispatch, submit the same model, prompt, seed,
and options to rejoin an identical image request or retrieve its cached result.
Keep those inputs when retrying; a fresh discovery step can pick different
models. A failed script can still have completed billable image requests.

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
