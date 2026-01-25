---
name: web-research
description: Research a topic using web search, parallel subagents, and multiple sources. Use when asked to research, investigate, find information, or verify facts.
allowed-tools: Task, WebSearch, WebFetch, Grep, Glob, Read, mcp__perplexity__perplexity_search, mcp__perplexity__perplexity_ask, mcp__perplexity__perplexity_research
---

# Web Research Skill

When researching a topic, use this multi-source approach for comprehensive results.

## Available Tools

### Built-in Tools
- **WebSearch**: Find URLs for a topic (Anthropic's search, may not work on Bedrock)
- **WebFetch**: Fetch and analyze content from a specific URL

### MCP Tools (if configured)
- **perplexity_search**: Direct web search with ranked results
- **perplexity_ask**: Conversational AI with real-time web search (sonar-pro)
- **perplexity_research**: Deep research with citations (sonar-deep-research)

## Research Strategy

### Step 1: Quick Search
Use `perplexity_ask` or `WebSearch` for initial exploration:
- Get overview of the topic
- Identify key sources and URLs
- Note important terminology

### Step 2: Deep Dive (if needed)
For complex topics, use `perplexity_research` or spawn parallel subagents:

```
Use Task tool to spawn these subagents in parallel:

1. **Documentation Agent** (subagent_type: general-purpose)
   - Search official documentation
   - Find GitHub repos/issues
   - Look for best practices

2. **Community Agent** (subagent_type: general-purpose)
   - Search Stack Overflow, Reddit discussions
   - Find real-world experiences
   - Note common pitfalls

3. **Codebase Explorer** (subagent_type: Explore)
   - Search existing patterns in this codebase
   - Find related implementations
```

### Step 3: Synthesize
After gathering information:
- Cross-reference multiple sources
- Verify information is current (check dates)
- Prioritize official docs over blog posts
- Note version-specific considerations

## Guidelines

- **Cite sources**: Always include URLs for claims
- **Verify recency**: Check publication dates, prefer recent info
- **Cross-reference**: Don't rely on single source for important facts
- **Be skeptical**: Note when sources conflict
- **Respect rate limits**: Don't spam search APIs

## Example Usage

```
Research the latest best practices for Claude Code web search integration
```

```
Find how other projects implement semantic caching with Cloudflare Vectorize
```

```
Investigate why Bedrock doesn't support Anthropic's web_search tool
```
