# Packages

This folder is the home for the small, reusable pieces of Pollinations that live outside the main services.

Everything here is meant to be picked up and used on its own. You shouldn't need to understand the rest of the repo to make sense of any single package.

## What's inside

### [sdk/](./sdk) — the official SDK

A friendly toolkit for developers who want to add Pollinations to a website or app. Instead of figuring out the API by hand, you install the SDK and call simple functions like "generate an image" or "generate text." It works in browsers, in Node.js, and ships React hooks for the common cases.

**Who it's for:** developers building apps, sites, or prototypes that need AI-generated media or text.

### [mcp/](./mcp) — the MCP server

A bridge that lets AI assistants (like Claude, Cursor, and other tools that speak the Model Context Protocol) use Pollinations directly. Once it's installed, the assistant can generate images, audio, video, or text on your behalf without you ever leaving the chat.

**Who it's for:** anyone using an MCP-compatible AI assistant who wants it to be able to create media.

### [polli-cli/](./polli-cli) — the `polli` command-line tool

A terminal app for using Pollinations without writing any code. Type a prompt, get an image, audio clip, video, or text reply. Useful for quick experiments, scripting, demos, and for AI agents that prefer to work through the shell.

**Who it's for:** people comfortable in a terminal — humans testing things quickly, and AI agents driving workflows.

### [n8n/](./n8n) — n8n tunnel setup

A small set of helper scripts for exposing a self-hosted [n8n](https://n8n.io) automation instance through a Cloudflare tunnel. Not a Pollinations library — it's infrastructure used by the team to run automation workflows that talk to Pollinations.

**Who it's for:** the Pollinations team and self-hosters running n8n alongside Pollinations.

## How they relate

- **SDK** and **CLI** are two different doorways into the same Pollinations API — one for code, one for terminals.
- **MCP** is a third doorway, designed for AI assistants rather than people.
- **n8n** is operational tooling, not something end users install.

If you're new and just want to try Pollinations, the fastest paths are the [CLI](./polli-cli) (no code) or the [SDK](./sdk) (a few lines of code).

## Contributing

Each package has its own README with setup, usage, and contribution notes. Start there. For the bigger picture of how Pollinations is built and how submissions/reviews work, see the repo-level [AGENTS.md](../AGENTS.md).
