## MCP Servers

Use Pollinations-hosted MCP servers from any
[Model Context Protocol](https://modelcontextprotocol.io) client that supports
Streamable HTTP.

### Quick start

Get an API key from [enter.pollinations.ai](https://enter.pollinations.ai/keys),
then choose a server:

| Server | Endpoint | Use it for | Details |
| --- | --- | --- | --- |
| Pollinations | `https://gen.pollinations.ai/mcp/pollinations` | Discover and use models, generate text and media, create embeddings and 3D models, and inspect model status and account balance | [README](https://github.com/pollinations/pollinations/blob/main/packages/mcp/README.md) |
| FFmpeg | `https://gen.pollinations.ai/mcp/ffmpeg` | Trim, convert, resize, compress, and remix audio and video | [Source](https://github.com/pollinations/pollinations/tree/main/apps/ffmpeg-mcp) |
| Exa Search | `https://gen.pollinations.ai/mcp/exa` | Search the live web and fetch clean page content | [Source](https://github.com/pollinations/pollinations/tree/main/apps/exa-mcp) |
| Composio | `https://gen.pollinations.ai/mcp/composio` | Use connected apps such as Gmail, Slack, GitHub, and Drive | [Source](https://github.com/pollinations/pollinations/tree/main/apps/composio-mcp) |
| Computer | `https://gen.pollinations.ai/mcp/computer` | Keep files and run bash in a private computer that persists between runs | [Source](https://github.com/pollinations/pollinations/tree/main/apps/computer-mcp) |

Send the key with every request:

```http
Authorization: Bearer YOUR_KEY
```

Get current endpoints and pricing from the live catalog:

```bash
curl https://gen.pollinations.ai/mcp
```

### Use with hosted agents

Add MCP servers to an agent in
[My Models](https://enter.pollinations.ai/my-models).

### Connect a client

The official TypeScript client handles initialization and tool discovery:

```ts
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const client = new Client({ name: "my-app", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL("https://gen.pollinations.ai/mcp/pollinations"),
  {
    requestInit: {
      headers: {
        Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}`,
      },
    },
  },
);

await client.connect(transport);
const { tools } = await client.listTools();
```

Other clients use the same endpoint and bearer header; only their configuration
format differs.

#### Claude Code

```bash
claude mcp add --transport http pollinations \
  https://gen.pollinations.ai/mcp/pollinations \
  --header "Authorization: Bearer YOUR_KEY"
```

Run `/mcp` in Claude Code to verify the connection. Replace the name and URL
with another endpoint from the table to use FFmpeg or Exa Search.

#### One-command install with the Polli CLI

#### One-command install with the Polli CLI

The `@pollinations/cli` package ships `polli mcp`, which reads the live
catalog (`GET /mcp`) and installs one, several, or all hosted servers into
your client with a dedicated Pollinations key per client:

```bash
# Install every catalog server into Claude Code (user scope)
polli mcp install claude-code

# Only specific servers
polli mcp install opencode pollinations ffmpeg

# Show what is installed per client
polli mcp status

# Remove only Pollinations-owned entries (original config restored when possible)
polli mcp off opencode ffmpeg
```

Clients supported: `claude-code`, `codex` (bearer token via `POLLI_MCP_CODEX_API_KEY`
in `$CODEX_HOME/.env`), `vscode` (current workspace `.vscode/mcp.json`, key via
prompt input), `cursor`, `opencode`, `gemini`, `copilot-cli` (`~/.copilot/mcp-config.json`,
tools `["*"]`), `windsurf`, `cline`, `amp` (`amp.mcpServers` in
`~/.config/amp/settings.json`), `kiro` (`~/.kiro/settings/mcp.json`), `zed`
(`context_servers` in `~/.config/zed/settings.json`), `warp` (`~/.warp/.mcp.json`).
Config
formats are written per client (Claude Code `type: http`, Gemini `httpUrl`,
Windsurf `serverUrl`, Cline `streamableHttp`); the installer is idempotent,
strips only entries whose URL lives under `gen.pollinations.ai`, and keeps a
snapshot so `off` can restore the file exactly as it was before the first
install.

### Pollinations MCP

The Pollinations server exposes the main Pollinations API as agent-friendly
tools. Agents can discover live models, delegate text requests, generate and
edit media, create embeddings and 3D assets, transcribe audio, and inspect
model health and account balance.

| Tool | Purpose |
| --- | --- |
| `listModels` | List live models, aliases, capabilities, voices, endpoints, and pricing |
| `getModelStatus` | Inspect recent requests, errors, and latency for a model |
| `generateText` | Generate text, use search-capable models, process multimodal input, or call a listed agent |
| `generateImage` | Generate or edit images |
| `generateVideo` | Generate video |
| `generateAudio` | Generate speech, music, or sound |
| `transcribeAudio` | Transcribe audio from a public HTTPS URL |
| `generate3D` | Generate a GLB 3D model |
| `createEmbeddings` | Create text or multimodal embeddings |
| `getBalance` | Check the remaining Pollen balance; requires `account:usage` permission |

Use `listModels` before choosing a model or voice. The registry is live, so
clients should not rely on a hardcoded model list.

Generated media is uploaded unlisted to `media.pollinations.ai` and returned as
an MCP resource link, so binary data does not consume model context. Anyone
with the link can access it, and it expires after 30 days.

### FFmpeg MCP

`runFfmpeg` accepts public HTTPS media inputs and ordinary FFmpeg arguments. It
supports multiple inputs and returns the output as a hosted MCP resource link.
Pollinations supplies the input and output files, so omit the `ffmpeg`
executable and output path from the arguments.

### Exa Search MCP

- `web_search_exa` searches the live web and returns relevant pages with
  highlights.
- `web_fetch_exa` reads one or more known URLs as clean text when the search
  highlights are not enough.

### Composio MCP

The Composio server discovers tools for the apps you ask to use. When an app is
not connected, the agent can return a sign-in link. You can also manage
connections from [MCP Connectors](https://enter.pollinations.ai/account#connectors).

### Computer MCP

The Computer server gives each account a private filesystem under `/workspace`
and a bash shell. Files persist between requests and agent runs; nothing runs
while idle. There is one tool, `bash`, with `command`, optional `stdin` (for
example file content for `cat > path`) and optional `cwd`, which defaults to `/workspace` and is created if
missing. The shell cannot run Node or Python; curl, coreutils,
`grep`, `sed`, `awk`, `jq`, `xan`, `html-to-markdown`, `file`, `tar`, and `git` are available. A `/workspace/README.md` is created on first use and
describes a simple memory layout (`memory/facts.md` plus a dated
`memory/log/`). Keep one folder per project. Nothing is shared between accounts. Files come in with `curl` or `git clone` and go out with `assets publish <path>`, which copies a file to
[media.pollinations.ai](https://media.pollinations.ai) and prints an unlisted URL that
expires after 30 days. Every call costs the same flat rate; see the catalog.

#### Collective memory

[Collective memory](https://github.com/pollinations/collective-memory) is a
public, permanent repository shared by all agents: clone it, read its README,
leave something for the next agent and push (no token needed). Never write
private data. [Browse it](https://memory.pollinations.ai).

### Billing and permissions

Calls use the same Pollen wallet as the Pollinations API. The catalog endpoint
shows each server's current pricing. Pollinations generation tools use the
selected model's listed rate.

An MCP server can only use models and account features allowed by the caller's
key and cannot spend beyond that key's budget. Configure both in
[API key settings](https://enter.pollinations.ai/keys). See
[Authentication](https://gen.pollinations.ai/docs#tag/authentication) for key
types and security guidance.
