# Web Search Setup for Claude Code

This project is configured with web search capabilities via MCP servers and skills.

## Quick Start

### Get the Perplexity API Key

The key is in `text.pollinations.ai/secrets/env.json`. Extract it with:

```bash
cd text.pollinations.ai && sops -d secrets/env.json | jq -r '.PERPLEXITY_API_KEY'
```

### Set the Environment Variable

Add to your `~/.zshrc`:

```bash
export PERPLEXITY_API_KEY="pplx-xxx..."  # paste key here
```

Then: `source ~/.zshrc` and restart Claude Code.

## What's Configured

### MCP Server: Perplexity (`.mcp.json`)

The project includes a `.mcp.json` that configures the Perplexity MCP server. It uses `${PERPLEXITY_API_KEY}` environment variable expansion, so the actual key is never committed.

**Available tools:**
- `perplexity_search` - Direct web search with ranked results
- `perplexity_ask` - Conversational AI with real-time web search
- `perplexity_research` - Deep research with citations
- `perplexity_reason` - Advanced reasoning and problem-solving

### Skill: web-research (`.claude/skills/web-research/`)

A skill that provides structured research workflows:
- Multi-source research strategy
- Parallel subagent spawning
- Citation and verification guidelines

### Subagent: web-researcher (`.claude/agents/web-researcher.md`)

A specialized subagent for research tasks that can be invoked with:
```
Use the web-researcher subagent to research [topic]
```

## Usage Examples

### Quick search
```
Search the web for latest Claude Code best practices
```

### Deep research
```
Research how to implement semantic caching with Cloudflare Vectorize
```

### Using the subagent
```
Use the web-researcher subagent to investigate Bedrock web search support
```

## Troubleshooting

### "PERPLEXITY_API_KEY not set"

Make sure the environment variable is set in your shell:
```bash
echo $PERPLEXITY_API_KEY
```

### MCP server not loading

Check MCP status:
```
/mcp
```

Restart Claude Code after setting environment variables.

### Bedrock users

Note: Anthropic's built-in `WebSearch` tool is **not available on Bedrock**. The Perplexity MCP server is the recommended alternative for web search capabilities.

## Getting a Perplexity API Key

1. Go to https://www.perplexity.ai/account/api/group
2. Create an API group if you don't have one
3. Generate a new API key
4. Set it as `PERPLEXITY_API_KEY` environment variable
