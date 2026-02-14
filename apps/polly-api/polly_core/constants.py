"""Tool definitions and system prompts for Polly API.

Read-only + create/comment only. Auto-labels created issues with 'polly-external'.
"""

import re
from datetime import datetime, timezone

# API Configuration
API_TIMEOUT = 60
POLLINATIONS_API_BASE = "https://gen.pollinations.ai"
MAX_MESSAGE_LENGTH = 2000
MAX_TITLE_LENGTH = 80
MAX_ERROR_LENGTH = 200
DEFAULT_REPO = "pollinations/pollinations"

# =============================================================================
# GITHUB TOOLS - READ-ONLY + CREATE/COMMENT
# =============================================================================

GITHUB_TOOLS_READONLY = [
    {
        "type": "function",
        "function": {
            "name": "github_issue",
            "description": """Issue operations (read + create/comment only).

Actions:
- get: Get issue details (issue_number, include_comments)
- get_history: Get edit history (issue_number, edit_index for diff)
- search: Search issues (keywords, state, labels, limit)
- find_similar: Find duplicates before creating (keywords, limit)
- list_labels: List available labels
- list_milestones: List available milestones
- create: Create new issue - auto-labeled with 'polly-external' (title, description)
- comment: Add comment to existing issue (issue_number, comment)
- get_sub_issues: Get child issues (issue_number)
- get_parent: Get parent issue (issue_number)

Note: Issues created via API are automatically tagged with 'polly-external' label.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["get", "get_history", "search", "find_similar", "list_labels", "list_milestones", "create", "comment", "get_sub_issues", "get_parent"],
                        "description": "The action to perform"
                    },
                    "issue_number": {
                        "type": "integer",
                        "description": "Issue number (for get, get_history, comment, get_sub_issues, get_parent)"
                    },
                    "keywords": {
                        "type": "string",
                        "description": "Search terms (for search, find_similar)"
                    },
                    "state": {
                        "type": "string",
                        "enum": ["open", "closed", "all"],
                        "description": "Filter by state (default: open)"
                    },
                    "title": {
                        "type": "string",
                        "description": "Issue title (for create, max 80 chars)"
                    },
                    "description": {
                        "type": "string",
                        "description": "Issue body (for create) - clean markdown, no footer needed"
                    },
                    "comment": {
                        "type": "string",
                        "description": "Comment text (for comment action)"
                    },
                    "include_comments": {
                        "type": "boolean",
                        "description": "Include comments in response (for get)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (for search, find_similar)"
                    },
                    "labels": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by labels (for search)"
                    },
                    "edit_index": {
                        "type": "integer",
                        "description": "Edit index for full diff (for get_history)"
                    }
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_pr",
            "description": """Pull Request operations (read-only + comment).

Actions:
- get: Get PR details (pr_number)
- get_history: Get edit history (pr_number, edit_index for diff)
- list: List PRs (state, limit, base)
- get_files: Get changed files (pr_number)
- get_diff: Get full diff (pr_number)
- get_checks: Get CI/test status (pr_number)
- get_commits: Get commit history (pr_number)
- get_threads: Get review discussions (pr_number)
- get_review_comments: Get inline comments (pr_number)
- get_file_at_ref: Get file content at branch/commit (file_path, ref)
- review: AI code review (pr_number) - analyzes code but doesn't post to GitHub
- comment: Add general comment (pr_number, comment)""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["get", "get_history", "list", "get_files", "get_diff", "get_checks", "get_commits", "get_threads", "get_review_comments", "get_file_at_ref", "review", "comment"],
                        "description": "The action to perform"
                    },
                    "pr_number": {
                        "type": "integer",
                        "description": "PR number"
                    },
                    "state": {
                        "type": "string",
                        "enum": ["open", "closed", "merged", "all"],
                        "description": "Filter by state (for list)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (for list, default 10)"
                    },
                    "base": {
                        "type": "string",
                        "description": "Base branch filter (for list)"
                    },
                    "comment": {
                        "type": "string",
                        "description": "Comment text (for comment action)"
                    },
                    "file_path": {
                        "type": "string",
                        "description": "File path (for get_file_at_ref)"
                    },
                    "ref": {
                        "type": "string",
                        "description": "Git ref - branch, tag, or commit SHA (for get_file_at_ref)"
                    },
                    "edit_index": {
                        "type": "integer",
                        "description": "Edit index for full diff (for get_history)"
                    }
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_project",
            "description": """GitHub Projects V2 operations (read-only).

Actions:
- list: List all organization projects
- view: View project board details (project_number)
- list_items: List project items (project_number, status)
- get_item: Get specific item details (project_number, issue_number)""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list", "view", "list_items", "get_item"],
                        "description": "The action to perform"
                    },
                    "project_number": {
                        "type": "integer",
                        "description": "Project number from URL (not required for list)"
                    },
                    "issue_number": {
                        "type": "integer",
                        "description": "Issue number (for get_item)"
                    },
                    "status": {
                        "type": "string",
                        "description": "Filter by status/column (for list_items)"
                    }
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_overview",
            "description": """Get repository summary: issue counts, recent issues, labels, milestones, projects. Great for initial context.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "issues_limit": {
                        "type": "integer",
                        "description": "Number of recent issues (default 10, max 50)"
                    },
                    "include_projects": {
                        "type": "boolean",
                        "description": "Include projects list (default true)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_custom",
            "description": """Fetch raw GitHub data for custom analysis.

Use for: commit history, contributor stats, activity metrics, stale issues, repository health.
NOT for: creating/editing (use github_issue/github_pr).""",
            "parameters": {
                "type": "object",
                "properties": {
                    "request": {
                        "type": "string",
                        "description": "What data you need in plain English"
                    },
                    "include_body": {
                        "type": "boolean",
                        "description": "Include full body text?"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max items (default 50, max 100)"
                    }
                },
                "required": ["request"]
            }
        }
    }
]

# =============================================================================
# SEARCH TOOLS
# =============================================================================

CODE_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "code_search",
        "description": """Semantic code search across repository. Returns code snippets with file paths and line numbers.""",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language query describing what code you're looking for"},
                "top_k": {"type": "integer", "description": "Number of results (default 5, max 10)"}
            },
            "required": ["query"]
        }
    }
}

DOC_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "doc_search",
        "description": """Search Pollinations documentation (enter.pollinations.ai, kpi.myceli.ai, gsoc.pollinations.ai). Returns excerpts with URLs.""",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language query for documentation"},
                "top_k": {"type": "integer", "description": "Number of results (default 5, max 10)"}
            },
            "required": ["query"]
        }
    }
}

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": """Web search. Models: gemini-search (fast factual), perplexity-fast (balanced, DEFAULT), perplexity-reasoning (deep analysis).""",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "model": {"type": "string", "enum": ["gemini-search", "perplexity-fast", "perplexity-reasoning"], "description": "Search model (default: perplexity-fast)"}
            },
            "required": ["query"]
        }
    }
}

WEB_SCRAPE_TOOL = {
    "type": "function",
    "function": {
        "name": "web_scrape",
        "description": """Web scraping with Crawl4AI. Actions: scrape (URL to markdown), extract (LLM extraction), css_extract (CSS schema), semantic (cosine clustering), regex (pattern matching), multi (concurrent URLs).""",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["scrape", "extract", "css_extract", "semantic", "regex", "multi"], "description": "Action to perform"},
                "url": {"type": "string", "description": "URL to scrape"},
                "urls": {"type": "array", "items": {"type": "string"}, "description": "URLs for multi (max 10)"},
                "extract": {"type": "string", "description": "LLM extraction instruction"},
                "schema": {"type": "object", "description": "CSS extraction schema"},
                "semantic_filter": {"type": "string", "description": "Keywords for semantic filtering"},
                "patterns": {"type": "array", "items": {"type": "string"}, "description": "Regex patterns: email, url, phone, date, ip, all"},
                "output_format": {"type": "string", "enum": ["markdown", "fit_markdown", "html"], "description": "Output format"},
                "stealth_mode": {"type": "boolean", "description": "Avoid bot detection"},
                "magic_mode": {"type": "boolean", "description": "Auto anti-bot bypass"},
                "scan_full_page": {"type": "boolean", "description": "Scroll to load lazy content"}
            },
            "required": ["action"]
        }
    }
}

DISCORD_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "discord_search",
        "description": """Search Discord server - messages, members, channels, threads, roles, history, context, thread_history.""",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["messages", "members", "channels", "threads", "roles", "history", "context", "thread_history"], "description": "What to search"},
                "query": {"type": "string", "description": "Search text (required for messages)"},
                "channel_id": {"type": "integer", "description": "Filter to specific channel"},
                "user_id": {"type": "integer", "description": "Filter by author"},
                "limit": {"type": "integer", "description": "Max results (default 25, max 100)"},
                "has": {"type": "string", "enum": ["link", "embed", "file", "video", "image", "sound"], "description": "Filter by attachment type"}
            },
            "required": ["action"]
        }
    }
}

WEB_TOOL = {
    "type": "function",
    "function": {
        "name": "web",
        "description": """Deep web research using nomnom model (search + scrape + crawl + code execution). For complex multi-source tasks. Prefer web_search/web_scrape for simple tasks.""",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language research request"}
            },
            "required": ["query"]
        }
    }
}

# =============================================================================
# TOOL ASSEMBLY
# =============================================================================

def get_tools_with_embeddings(
    local_embeddings_enabled: bool = False,
    doc_embeddings_enabled: bool = False,
    discord_search_enabled: bool = False
) -> list:
    """Get tool list with optional features."""
    tools = GITHUB_TOOLS_READONLY.copy()
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
        re.IGNORECASE
    ),
    "github_pr": re.compile(
        r"\b(prs?|pull\s*requests?|merge[ds]?|review\w*|diffs?|checks?|ci|workflow)\b",
        re.IGNORECASE
    ),
    "github_project": re.compile(
        r"\b(projects?\s*(board)?|boards?|kanban|columns?|backlog)\b",
        re.IGNORECASE
    ),
    "github_custom": re.compile(
        r"\b(stats?|statistics?|activit\w*|contributors?|history|commits?)\b",
        re.IGNORECASE
    ),
    "github_overview": re.compile(
        r"\b(overview|summary|repo|what.*(issues|labels|milestones).*exist)\b",
        re.IGNORECASE
    ),
    "web_scrape": re.compile(
        r"\b(scrape|fetch\s+(page|url|website|site)|read\s+(page|url)|get\s+content\s+(from|of)\s+url)\b",
        re.IGNORECASE
    ),
}


def filter_tools_by_intent(user_message: str, all_tools: list[dict], is_admin: bool = False) -> list[dict]:
    """Filter tools based on user intent keywords."""
    matched_tools = set()

    for tool_name, pattern in TOOL_KEYWORDS.items():
        if pattern.search(user_message.lower()):
            matched_tools.add(tool_name)

    if re.search(r"#\d+", user_message):
        matched_tools.add("github_issue")
        matched_tools.add("github_pr")

    AI_CONTROLLED_TOOLS = {"web_search", "code_search", "doc_search", "discord_search", "web"}

    filtered = [
        tool for tool in all_tools
        if tool.get("function", {}).get("name") in matched_tools
        or tool.get("function", {}).get("name") in AI_CONTROLLED_TOOLS
    ]

    return filtered if filtered else all_tools


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

POLLY_API_SYSTEM_PROMPT = """You are Polly, an AI assistant with GitHub, code search, and web research capabilities.

## Current Time
{current_utc}

## Available Tools

**GitHub (Read + Create/Comment):**
- github_overview: Repository summary
- github_issue: Search, read, create (auto-labeled 'polly-external'), comment
- github_pr: Search, read, review, comment
- github_project: View project boards
- github_custom: Stats, history, contributors

**Search:**
- code_search: Semantic code search
- doc_search: Pollinations documentation
- web_search: Real-time web search (Gemini/Perplexity)
- web_scrape: Fetch and parse web pages
- discord_search: Search Discord servers (if enabled)
- web: Deep research (nomnom)

## Critical Rules

**1. Tools > Your Knowledge**
Your training data is OLD. For ANYTHING Pollinations-related, USE TOOLS:
- Documentation: `doc_search` FIRST
- Code: `code_search` the repository
- GitHub: `github_issue`, `github_pr` for issues/PRs
- Current events: `web_search`

**If you catch yourself saying** "usually", "typically", "I believe" - STOP. USE A TOOL.

**2. Be Concise**
- Simple questions: 1-2 sentences
- Complex issues: Break it down, keep each point tight
- No fluff, no unnecessary explanations

**3. Creating Issues**
When creating issues via `github_issue` action='create':
- Clean markdown body, no footer needed
- Issues are automatically labeled with 'polly-external'
- Check for duplicates with find_similar first

**4. Tool Hierarchy (Use fastest first)**

Documentation: `doc_search` > `code_search`

Web Search (fast to slow):
1. `web_search(model="gemini-search")` - Quick factual
2. `web_search(model="perplexity-fast")` - Balanced (DEFAULT)
3. `web_search(model="perplexity-reasoning")` - Deep analysis
4. `web` - nomnom (SLOW, use sparingly)

**5. GitHub Tools > web_scrape**
ALWAYS use github_issue/github_pr for GitHub data. web_scrape is slow and may truncate.

**6. Pollinations API Info**
- `gen.pollinations.ai` requires API keys (get at enter.pollinations.ai)
- Text: POST /v1/chat/completions (OpenAI compatible)
- Image: GET /image/{{prompt}}?model=flux
- Audio: GET /audio/{{text}}?voice=nova
- Models: /text/models or /image/models
- Docs: https://enter.pollinations.ai/api/docs

## Response Style
- Direct and helpful
- Use tools to verify before answering
- Provide sources and links
- Admit when uncertain
"""


def get_tool_system_prompt(is_admin: bool = False) -> str:
    """Get system prompt with current UTC time."""
    current_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return POLLY_API_SYSTEM_PROMPT.format(current_utc=current_utc)
