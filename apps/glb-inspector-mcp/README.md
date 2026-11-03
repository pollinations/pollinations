# GLB Inspector MCP

A stateless Streamable HTTP Model Context Protocol server for **Pollinations-generated GLB 2.0 assets**. Free metadata-only inspection. No API calls to language models and no persistent storage.

## Tools

- `inspect_glb({url})` — SHA-256, file size, GLB structure and reference checks, mesh/primitive/declared triangle counts, materials, images, animations, and declared mesh-local POSITION accessor bounds when available.
- `validate_glb({url, max_triangles?, max_meshes?, max_file_bytes?, require_materials?, require_self_contained?})` — deterministic `passed` flag and explicit policy violations. `require_self_contained` defaults to true. Fail closed on an incomplete triangle count when a triangle budget is specified.

URLs must use HTTPS on exactly `media.pollinations.ai`. Other hosts, userinfo, nondefault ports and redirects are rejected. The server caps downloads at 32 MiB, JSON chunk size at 4 MiB and fetch time at 20 seconds. Caller bearer tokens are **never forwarded** to asset URLs.

## Develop

```bash
npm ci
npm test
npm run check
npx wrangler dev
```

Use a bearer token from your Pollinations account when connecting an MCP client to the local endpoint at `http://localhost:8787`. The worker itself only checks the bearer header's presence; Gen authenticates real Pollinations API keys when proxying requests.

## Scope

The inspection is **not** a full Khronos glTF conformance validator. It does not render meshes, decode Draco/meshopt geometry, resolve external files, inspect materials visually, or measure transformed world-space dimensions. Counts and bounds come from GLB metadata. Only public assets from Pollinations Media can be inspected. No private URLs are supported.

The production Worker has no public `workers.dev` URL; Pollinations Gen calls it using a Cloudflare service binding. No secrets, new provider credentials or paid compute services are required.

Quest: [#17689](https://github.com/pollinations/pollinations/issues/17689).
