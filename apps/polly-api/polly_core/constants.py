"""Tool definitions and system prompts for Polly API.

Only tools and actions the model can actually use. Nothing blocked,
nothing hidden — if it's here, the model can call it.
"""

import re
from datetime import datetime, timezone

# =============================================================================
# GITHUB TOOLS
# =============================================================================

GITHUB_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "github_issue",
            "description": """GitHub issue operations.

Actions:
- get: Get issue details (issue_number, include_comments)
- get_history: Get edit history (issue_number, edit_index for diff)
- search: Search issues (keywords, state, limit)
- find_similar: Find duplicates before creating (keywords, limit)
- list_labels: List available labels
- list_milestones: List milestones (state)
- create: Create new issue (title, description) — auto-labeled 'polly-external'
- comment: Add comment to issue (issue_number, comment)
- get_sub_issues: Get child issues (issue_number)
- get_parent: Get parent issue (issue_number)""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["get", "get_history", "search", "find_similar", "list_labels", "list_milestones", "create", "comment", "get_sub_issues", "get_parent"],
                    },
                    "issue_number": {"type": "integer"},
                    "keywords": {"type": "string"},
                    "state": {"type": "string", "enum": ["open", "closed", "all"]},
                    "title": {"type": "string", "description": "Issue title (for create)"},
                    "description": {"type": "string", "description": "Issue body markdown (for create)"},
                    "comment": {"type": "string", "description": "Comment text (for comment)"},
                    "include_comments": {"type": "boolean"},
                    "limit": {"type": "integer"},
                    "labels": {"type": "array", "items": {"type": "string"}, "description": "Filter by labels (for search)"},
                    "edit_index": {"type": "integer", "description": "Specific edit index (for get_history)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_pr",
            "description": """Pull request operations.

Actions:
- get: Get PR details (pr_number)
- get_history: Get edit history (pr_number, edit_index)
- list: List PRs (state, limit, base)
- get_files: Changed files (pr_number)
- get_diff: Full diff (pr_number)
- get_checks: CI/test status (pr_number)
- get_commits: Commit history (pr_number)
- get_threads: Review discussions (pr_number)
- get_review_comments: Inline review comments (pr_number)
- get_file_at_ref: File content at branch/commit (file_path, ref)
- review: AI code review (pr_number)
- comment: Add comment (pr_number, comment)""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["get", "get_history", "list", "get_files", "get_diff", "get_checks", "get_commits", "get_threads", "get_review_comments", "get_file_at_ref", "review", "comment"],
                    },
                    "pr_number": {"type": "integer"},
                    "state": {"type": "string", "enum": ["open", "closed", "merged", "all"]},
                    "limit": {"type": "integer"},
                    "base": {"type": "string", "description": "Base branch filter (for list)"},
                    "comment": {"type": "string"},
                    "file_path": {"type": "string"},
                    "ref": {"type": "string", "description": "Branch, tag, or commit SHA"},
                    "edit_index": {"type": "integer"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_project",
            "description": """GitHub Projects V2 — view project boards.

Actions:
- list: List all projects
- view: Project board details (project_number)
- list_items: Items in project (project_number, status filter)
- get_item: Specific item (project_number, issue_number)""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list", "view", "list_items", "get_item"],
                    },
                    "project_number": {"type": "integer"},
                    "issue_number": {"type": "integer"},
                    "status": {"type": "string"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_overview",
            "description": "Repository summary: issue counts, recent issues, labels, milestones, projects.",
            "parameters": {
                "type": "object",
                "properties": {
                    "issues_limit": {"type": "integer", "description": "Recent issues count (default 10, max 50)"},
                    "include_projects": {"type": "boolean"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_custom",
            "description": "Fetch raw GitHub data: commit history, contributor stats, activity metrics, repository health.",
            "parameters": {
                "type": "object",
                "properties": {
                    "request": {"type": "string", "description": "What data you need in plain English"},
                    "include_body": {"type": "boolean"},
                    "limit": {"type": "integer", "description": "Max items (default 50)"},
                },
                "required": ["request"],
            },
        },
    },
]

# =============================================================================
# SEARCH & WEB TOOLS
# =============================================================================

CODE_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "code_search",
        "description": "Semantic code search across the Pollinations repository. Returns code snippets with file paths and line numbers.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language query"},
                "top_k": {"type": "integer", "description": "Results count (default 5)"},
            },
            "required": ["query"],
        },
    },
}

DOC_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "doc_search",
        "description": "Search Pollinations documentation (enter.pollinations.ai, guides). Returns excerpts with URLs.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "top_k": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
}

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Real-time web search. Models: gemini-search (fast), perplexity-fast (balanced, default), perplexity-reasoning (deep).",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "model": {
                    "type": "string",
                    "enum": ["gemini-search", "perplexity-fast", "perplexity-reasoning"],
                },
            },
            "required": ["query"],
        },
    },
}

WEB_SCRAPE_TOOL = {
    "type": "function",
    "function": {
        "name": "web_scrape",
        "description": "Fetch and parse web pages with Crawl4AI. Actions: scrape (markdown), extract (LLM), css_extract, semantic, regex, multi (concurrent).",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["scrape", "extract", "css_extract", "semantic", "regex", "multi"],
                },
                "url": {"type": "string"},
                "urls": {"type": "array", "items": {"type": "string"}, "description": "For multi (max 10)"},
                "extract": {"type": "string", "description": "LLM extraction instruction"},
                "schema": {"type": "object", "description": "CSS extraction schema"},
                "semantic_filter": {"type": "string"},
                "patterns": {"type": "array", "items": {"type": "string"}, "description": "Regex: email, url, phone, date, ip, all"},
                "output_format": {"type": "string", "enum": ["markdown", "fit_markdown", "html"]},
                "stealth_mode": {"type": "boolean", "description": "Avoid bot detection"},
                "magic_mode": {"type": "boolean", "description": "Auto anti-bot bypass"},
                "scan_full_page": {"type": "boolean", "description": "Scroll to load lazy content"},
            },
            "required": ["action"],
        },
    },
}

DISCORD_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "discord_search",
        "description": "Search Pollinations Discord server (public channels only).",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["messages", "members", "channels", "threads", "roles", "history"],
                },
                "query": {"type": "string", "description": "Search text (required for messages)"},
                "channel_id": {"type": "integer"},
                "user_id": {"type": "integer"},
                "limit": {"type": "integer"},
                "has": {"type": "string", "enum": ["link", "embed", "file", "video", "image", "sound"]},
            },
            "required": ["action"],
        },
    },
}

WEB_TOOL = {
    "type": "function",
    "function": {
        "name": "web",
        "description": "Deep research via nomnom (search + scrape + code execution). Slow but thorough. Prefer web_search for simple queries.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
}

# =============================================================================
# TOOL ASSEMBLY
# =============================================================================


def get_tools_with_embeddings(
    local_embeddings_enabled: bool = False,
    doc_embeddings_enabled: bool = False,
    discord_search_enabled: bool = False,
) -> list:
    """Assemble tool list based on enabled features."""
    tools = GITHUB_TOOLS.copy()
    tools.append(WEB_SEARCH_TOOL)
    tools.append(WEB_SCRAPE_TOOL)
    tools.append(WEB_TOOL)

    if local_embeddings_enabled:
        tools.append(CODE_SEARCH_TOOL)
    if doc_embeddings_enabled:
        tools.append(DOC_SEARCH_TOOL)
    if discord_search_enabled:
        tools.append(DISCORD_SEARCH_TOOL)

    return tools


# =============================================================================
# SMART TOOL FILTERING
# =============================================================================

TOOL_KEYWORDS = {
    "github_issue": re.compile(
        r"\b(issues?|bugs?|reports?|#\d+|problems?|errors?|feature requests?|"
        r"labels?|milestones?|duplicates?|similar|create issue|report|ticket)\b",
        re.IGNORECASE,
    ),
    "github_pr": re.compile(
        r"\b(prs?|pull\s*requests?|merge[ds]?|review\w*|diffs?|checks?|ci|workflow)\b",
        re.IGNORECASE,
    ),
    "github_project": re.compile(
        r"\b(projects?\s*(board)?|boards?|kanban|columns?|backlog)\b",
        re.IGNORECASE,
    ),
    "github_custom": re.compile(
        r"\b(stats?|statistics?|activit\w*|contributors?|history|commits?)\b",
        re.IGNORECASE,
    ),
    "github_overview": re.compile(
        r"\b(overview|summary|repo|what.*(issues|labels|milestones).*exist)\b",
        re.IGNORECASE,
    ),
    "web_scrape": re.compile(
        r"\b(scrape|fetch\s+(page|url|website|site)|read\s+(page|url)|get\s+content\s+(from|of)\s+url)\b",
        re.IGNORECASE,
    ),
}


def filter_tools_by_intent(user_message: str, all_tools: list[dict]) -> list[dict]:
    """Filter tools based on user intent keywords. AI-controlled tools always pass."""
    matched_tools = set()

    for tool_name, pattern in TOOL_KEYWORDS.items():
        if pattern.search(user_message.lower()):
            matched_tools.add(tool_name)

    if re.search(r"#\d+", user_message):
        matched_tools.add("github_issue")
        matched_tools.add("github_pr")

    AI_CONTROLLED_TOOLS = {"web_search", "code_search", "doc_search", "discord_search", "web"}

    filtered = [
        tool
        for tool in all_tools
        if tool.get("function", {}).get("name") in matched_tools
        or tool.get("function", {}).get("name") in AI_CONTROLLED_TOOLS
    ]

    return filtered if filtered else all_tools


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

POLLY_API_SYSTEM_PROMPT = """You are Polly, a Mixture-of-Agents AI model by Pollinations. You combine multiple specialized AI models and tools into a single unified intelligence — routing queries to the right expert automatically.

## Current Time
{current_utc}

## Your Architecture

You are a compound AI system (MoE/MoA):
- **Reasoning core**: powered by top-tier language models via Pollinations
- **GitHub agent**: read access to pollinations/pollinations repo + create issues + comment
- **Code search agent**: semantic search across the Pollinations codebase
- **Documentation agent**: indexed Pollinations docs (enter.pollinations.ai, guides)
- **Web search agent**: real-time web via Gemini Search / Perplexity
- **Web scrape agent**: fetch and parse any URL (Crawl4AI)
- **Deep research agent**: nomnom — multi-step search + scrape + code execution

You don't just answer from memory. You **actively retrieve** live data through your tool agents.

## Tool Routing (use fastest first)

**For Pollinations questions:**
1. `doc_search` — indexed documentation (fastest)
2. `code_search` — semantic code search
3. `github_issue` / `github_pr` — issues, PRs, project boards
4. `github_overview` — repo summary at a glance
5. `github_custom` — contributors, stats, history

**For web/current events:**
1. `web_search(model="gemini-search")` — quick factual
2. `web_search(model="perplexity-fast")` — balanced (default)
3. `web_search(model="perplexity-reasoning")` — deep analysis
4. `web` — nomnom deep research (slow, use sparingly)
5. `web_scrape` — fetch specific URLs

**GitHub tools > web_scrape** for any GitHub data. Always.

## Core Behavior

**1. Tools > Memory**
Your training data is stale. For ANYTHING about Pollinations, current events, or live data — USE TOOLS.
If you catch yourself saying "usually", "typically", "I believe" — STOP. Route to a tool.

**2. Be Concise**
- Simple questions: 1-2 sentences
- Complex topics: structured, tight, no fluff
- Provide sources and links

**3. Issue Creation**
When users want to report bugs or request features:
- `github_issue(action="find_similar")` FIRST to check duplicates
- `github_issue(action="create")` with clean markdown body
- Issues are auto-labeled `polly-external`

**4. Pollinations API Reference**
- Endpoint: `gen.pollinations.ai` (API keys from enter.pollinations.ai)
- Text: POST `/v1/chat/completions` (OpenAI compatible)
- Image: GET `/image/{{prompt}}?model=flux`
- Audio: GET `/audio/{{text}}?voice=nova`
- Models: `/text/models` or `/image/models`
- Docs: https://enter.pollinations.ai/api/docs

## Response Style
- Direct, factual, tool-grounded
- Cite sources when available
- Admit uncertainty — then go find the answer
"""


def get_tool_system_prompt() -> str:
    """Get system prompt with current UTC time."""
    current_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return POLLY_API_SYSTEM_PROMPT.format(current_utc=current_utc)
