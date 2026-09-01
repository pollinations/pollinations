Pollinations exposes hosted MCP servers over
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
You can connect any compatible MCP client directly; creating a Pollinations
agent is not required.

## Discover servers

List the available servers, their connection URLs, and current pricing:

```bash
curl https://gen.pollinations.ai/mcp
```

Each item has a stable `id` and a `url` such as
`https://gen.pollinations.ai/mcp/pollinations`. Use the returned URL as the MCP
endpoint. Tool definitions are discovered from that endpoint through MCP's
standard `tools/list` request.

## Authentication

Create an API key in [API key settings](https://enter.pollinations.ai/keys),
then send it as a bearer token on every MCP request:

```http
Authorization: Bearer YOUR_API_KEY
```

Use an `sk_` key for server-side applications. A `pk_` key is suitable for
public clients and uses the normal publishable-key rate limits. Key permissions
and spending limits also apply to MCP calls. Do not put the key in the endpoint
URL.

## Connect from a client

In an MCP client, choose **Streamable HTTP**, enter a server URL returned by
`GET /mcp`, and add the `Authorization` header above. Client configuration
formats differ, but the endpoint and header are the same.

For example, with the official TypeScript client:

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
const result = await client.callTool({
  name: "listModels",
  arguments: { type: "text" },
});
```

The client performs MCP initialization and adds the required protocol headers.
Use a standard MCP client rather than manually implementing the JSON-RPC
lifecycle.

## Billing

MCP calls use the same Pollinations wallet as model calls. `GET /mcp` returns
the public pricing for each server. Some tools have a fixed or usage-based
price; tools that call Pollinations models use the selected model's listed
rate. Discovery tools can be free.

## Local stdio server

The Pollinations MCP is also available as a local stdio package:

```bash
POLLINATIONS_API_KEY=YOUR_API_KEY npx @pollinations/mcp
```

See the
[package documentation](https://github.com/pollinations/pollinations/tree/main/packages/mcp)
for local installation and development details.
