"""Tool schemas exposed to the AI for function calling."""

from pathlib import Path


# Repo context injected into the system prompt.
_REPO_INFO_PATH = Path(__file__).resolve().parent.parent / "context" / "repo_info.txt"
REPO_INFO = (
    _REPO_INFO_PATH.read_text(encoding="utf-8")
    if _REPO_INFO_PATH.exists()
    else "Pollinations.AI - AI media generation platform with image and text generation APIs."
)

# =============================================================================
# TOOL DEFINITIONS FOR FUNCTION CALLING
# =============================================================================

GITHUB_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "github_issue",
            "description": """Issue operations.

Actions:
- get: Get issue (issue_number, include_comments)
- get_history: Get edit history - title changes and body edits (issue_number, edit_index=N for full diff of specific edit)
- search: General issue search with filters (keywords, state, labels)
- search_user: User's issues by discord username (discord_username, state)
- find_similar: Find potential DUPLICATES before creating new issue (keywords, limit)
- list_labels / list_milestones: List available
- create: New issue (title, description)
- comment: Add comment WITHOUT closing (issue_number, comment) - don't use if closing!
- edit_comment / delete_comment: Modify bot's comments (comment_id)
- close: Close WITH comment in ONE call (issue_number, reason, comment) - includes the comment! [admin]
- reopen: Reopen issue (issue_number, comment) [admin]
- edit: Edit title/body (issue_number, title, body) [admin]
- label/unlabel: Manage labels (issue_number, labels) [admin]
- assign/unassign: Manage assignees (issue_number, assignees) [admin]
- milestone: Set milestone (issue_number, milestone) [admin]
- lock: Lock/unlock (issue_number, lock, reason) [admin]
- link: Link issues (issue_number, related_issues, relationship) [admin]
- subscribe/unsubscribe/unsubscribe_all/list_subscriptions: Notifications
- get_sub_issues/get_parent: Sub-issue hierarchy
- create_sub_issue/add_sub_issue/remove_sub_issue: Manage sub-issues [admin]""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "The action to perform (get, search, create, close, comment, etc.)",
                    },
                    "issue_number": {
                        "type": "integer",
                        "description": "Issue number (for get, close, comment, edit, label, assign, etc.)",
                    },
                    "keywords": {
                        "type": "string",
                        "description": "Search terms (for search, find_similar)",
                    },
                    "state": {
                        "type": "string",
                        "enum": ["open", "closed", "all"],
                        "description": "Filter state (for search actions)",
                    },
                    "title": {
                        "type": "string",
                        "description": "Issue title (for create, edit)",
                    },
                    "description": {
                        "type": "string",
                        "description": "Issue body/description (for create)",
                    },
                    "body": {
                        "type": "string",
                        "description": "New body text (for edit)",
                    },
                    "comment": {
                        "type": "string",
                        "description": "Comment text (for comment, close, reopen)",
                    },
                    "reason": {
                        "type": "string",
                        "enum": ["completed", "not_planned", "duplicate"],
                        "description": "Close reason (for close)",
                    },
                    "labels": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Labels (for label, unlabel, search)",
                    },
                    "assignees": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "GitHub usernames (for assign, unassign)",
                    },
                    "milestone": {
                        "type": "string",
                        "description": "Milestone name or 'none' (for milestone)",
                    },
                    "lock": {
                        "type": "boolean",
                        "description": "True to lock, false to unlock (for lock)",
                    },
                    "related_issues": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Related issue numbers (for link)",
                    },
                    "relationship": {
                        "type": "string",
                        "enum": [
                            "duplicate",
                            "related",
                            "blocks",
                            "blocked_by",
                            "parent",
                            "child",
                        ],
                        "description": "Relationship type (for link)",
                    },
                    "discord_username": {
                        "type": "string",
                        "description": "Discord username (for search_user)",
                    },
                    "include_comments": {
                        "type": "boolean",
                        "description": "Include comments (for get)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (for search, find_similar)",
                    },
                    "child_issue_number": {
                        "type": "integer",
                        "description": "Child/sub-issue number (for add_sub_issue, remove_sub_issue)",
                    },
                    "comment_id": {
                        "type": "integer",
                        "description": "Comment ID (for edit_comment, delete_comment) - get from issue comments",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_project",
            "description": """GitHub Projects V2 operations.

Actions:
- list: List all org projects
- view: View project board (project_number)
- list_items: List items (project_number, status)
- get_item: Get item details (project_number, issue_number)
- add: Add issue to project (project_number, issue_number) [admin]
- remove: Remove from project (project_number, issue_number) [admin]
- set_status: Update column (project_number, issue_number, status) [admin]
- set_field: Set custom field (project_number, issue_number, field_name, field_value) [admin]""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "The action: list, view, list_items, get_item, add, remove, set_status, set_field",
                    },
                    "project_number": {
                        "type": "integer",
                        "description": "Project number from URL (e.g., 20 from projects/20). NOT required for action='list'",
                    },
                    "issue_number": {
                        "type": "integer",
                        "description": "Issue number to add/update",
                    },
                    "status": {
                        "type": "string",
                        "description": "Status/column name (e.g., 'Todo', 'In Progress', 'Done')",
                    },
                    "field_name": {
                        "type": "string",
                        "description": "Custom field name (for set_field)",
                    },
                    "field_value": {
                        "type": "string",
                        "description": "Field value to set (for set_field)",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_overview",
            "description": """Get repo summary in ONE call: issue counts, recent issues, labels, milestones, projects. Use first for context.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "issues_limit": {
                        "type": "integer",
                        "description": "Number of recent issues to include (default 10, max 50)",
                    },
                    "include_projects": {
                        "type": "boolean",
                        "description": "Include projects list (default true)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_custom",
            "description": """Execute any GitHub API request — REST or GraphQL. Full read access to the entire GitHub API.

Modes (use exactly one):
- graphql_query: Write a raw GraphQL query. Variables $owner, $repo, $limit are auto-injected.
- rest_endpoint: REST API path relative to /repos/{owner}/{repo}/ (e.g. "issues/123/timeline", "actions/runs")
- rest_url: Full GitHub API URL for endpoints outside the repo scope (e.g. "https://api.github.com/users/octocat")
- request: Plain English fallback — fetches issues/PRs/commits/stats by keyword matching

Use web_search to look up GitHub API docs if unsure about query structure.
Read-only — mutations are blocked.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "graphql_query": {
                        "type": "string",
                        "description": "Raw GraphQL query. Variables $owner: String!, $repo: String!, $limit: Int! are auto-provided.",
                    },
                    "rest_endpoint": {
                        "type": "string",
                        "description": "REST path relative to /repos/{owner}/{repo}/ (e.g. 'actions/runs', 'issues/123/comments')",
                    },
                    "rest_url": {
                        "type": "string",
                        "description": "Full GitHub API URL for non-repo endpoints (e.g. 'https://api.github.com/users/octocat')",
                    },
                    "request": {
                        "type": "string",
                        "description": "Plain English fallback — describe what data you need",
                    },
                    "include_body": {
                        "type": "boolean",
                        "description": "Include full body text in results (for request mode)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max items (default 50, max 100)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_pr",
            "description": """Pull Request operations.

Actions:
- get: Get PR details (pr_number)
- get_history: Get edit history - title changes and body edits (pr_number, edit_index=N for full diff of specific edit)
- list: List PRs (state, limit, base)
- get_files/get_diff/get_checks/get_commits: PR details (pr_number)
- get_threads/get_review_comments: Review discussions (pr_number)
- get_file_at_ref: Get file content at branch/commit (file_path, ref)
- review: AI code review analyzing bugs/security/perf (pr_number, post_review_to_github=true to post as GitHub comment)
- comment: Add comment (pr_number, comment)
- inline_comment: Comment on line (pr_number, path, line, comment, side) [admin]
- suggest: Code suggestion (pr_number, path, line, suggestion) [admin]
- request_review/remove_reviewer: Manage reviewers (pr_number, reviewers) [admin]
- approve: Approve PR (pr_number, body) [admin]
- request_changes: Request changes (pr_number, body) [admin]
- merge: Merge PR (pr_number, merge_method) [admin, confirm]
- close/reopen: (pr_number) [admin, confirm for close]
- create: New PR (title, head, base, body, draft) [admin]
- update: Edit PR (pr_number, title, body) [admin]
- convert_to_draft/ready_for_review: Draft status (pr_number) [admin]
- update_branch: Sync with base (pr_number) [admin]
- resolve_thread/unresolve_thread: Thread status (thread_id) [admin]
- enable_auto_merge/disable_auto_merge: Auto-merge (pr_number, merge_method) [admin]""",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "The action: get, list, get_files, get_diff, get_checks, get_commits, get_threads, get_review_comments, get_file_at_ref, request_review, remove_reviewer, approve, request_changes, merge, update, close, reopen, create, convert_to_draft, ready_for_review, update_branch, comment, inline_comment, suggest, resolve_thread, unresolve_thread, enable_auto_merge, disable_auto_merge, review",
                    },
                    "pr_number": {
                        "type": "integer",
                        "description": "PR number (for most actions)",
                    },
                    "state": {
                        "type": "string",
                        "enum": ["open", "closed", "merged", "all"],
                        "description": "Filter state (for list)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (for list, default 10)",
                    },
                    "base": {
                        "type": "string",
                        "description": "Base branch filter (for list, create)",
                    },
                    "title": {
                        "type": "string",
                        "description": "PR title (for create, update)",
                    },
                    "body": {
                        "type": "string",
                        "description": "PR body or review comment (for create, update, approve, request_changes)",
                    },
                    "head": {
                        "type": "string",
                        "description": "Head branch name (for create)",
                    },
                    "draft": {
                        "type": "boolean",
                        "description": "Create as draft (for create)",
                    },
                    "reviewers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "GitHub usernames (for request_review, remove_reviewer)",
                    },
                    "team_reviewers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Team slugs (for request_review, remove_reviewer)",
                    },
                    "merge_method": {
                        "type": "string",
                        "enum": ["merge", "squash", "rebase"],
                        "description": "Merge method (for merge, enable_auto_merge)",
                    },
                    "commit_title": {
                        "type": "string",
                        "description": "Custom merge commit title (for merge)",
                    },
                    "commit_message": {
                        "type": "string",
                        "description": "Custom merge commit message (for merge)",
                    },
                    "comment": {
                        "type": "string",
                        "description": "Comment text (for comment, inline_comment, suggest)",
                    },
                    "post_review_to_github": {
                        "type": "boolean",
                        "description": "Post AI review as GitHub comment? (for review action, default false)",
                    },
                    "path": {
                        "type": "string",
                        "description": "File path for inline comment/suggestion (e.g., 'src/main.py')",
                    },
                    "line": {
                        "type": "integer",
                        "description": "Line number for inline comment/suggestion",
                    },
                    "side": {
                        "type": "string",
                        "enum": ["LEFT", "RIGHT"],
                        "description": "Diff side: LEFT=deletions, RIGHT=additions (default RIGHT)",
                    },
                    "suggestion": {
                        "type": "string",
                        "description": "Suggested code replacement (for suggest action)",
                    },
                    "thread_id": {
                        "type": "string",
                        "description": "Review thread ID (for resolve_thread, unresolve_thread)",
                    },
                    "file_path": {
                        "type": "string",
                        "description": "File path for get_file_at_ref (e.g., '.github/workflows/ci.yml', 'src/main.py')",
                    },
                    "ref": {
                        "type": "string",
                        "description": "Git ref (branch name, tag, or commit SHA) for get_file_at_ref",
                    },
                },
                "required": ["action"],
            },
        },
    },
]

# =============================================================================
# CODE SEARCH TOOL (only available when LOCAL_EMBEDDINGS_ENABLED=true)
# =============================================================================

CODE_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "code_search",
        "description": """Search AND explore the full pollinations/pollinations repository.

Three backends behind one tool: a semantic index, a live clone of the repo, and a symbol
graph. Never guess at code — look it up, and call this repeatedly to follow a thread.

Finding things:
- search (default) — semantic + exact search in one call. Start here for any code question.
- grep   — regex/literal search over file contents. Use when you know the exact string:
           a function name, a config key, an error message.
- read   — read a file, optionally a line range. Use after search/grep for full context.
- list   — list tracked files under a path and/or matching a glob.
- tree   — directory layout, to explore an unfamiliar area before drilling in.

Following relationships (symbol graph — pass the symbol name as `query`):
- callers — functions that call this symbol. More precise than grep: it distinguishes a
            real call from an import or a comment mentioning the name.
- callees — functions this symbol calls. Use to understand what something depends on.
- impact  — everything transitively affected by changing this symbol. Reaches files that
            never mention it by name, which grep can never find. Use for "what breaks
            if I change X?" and before suggesting any edit.

- status — current commit of the local clone, and whether the graph is available.

grep vs callers: grep finds every textual mention (including tests, imports, comments);
callers finds actual call relationships. For "where is this string", grep. For "what
actually calls this", callers.

Typical flow: search("how are pollen deductions applied") -> read the top file ->
impact("atomicDeductUserBalance") to see the blast radius.""",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "search",
                        "grep",
                        "read",
                        "list",
                        "tree",
                        "callers",
                        "callees",
                        "impact",
                        "status",
                    ],
                    "description": "Which operation to run. Default: search",
                },
                "query": {
                    "type": "string",
                    "description": (
                        "For action=search: a natural-language question. "
                        "For action=grep: the pattern. "
                        "For action=callers/callees/impact: the exact symbol name."
                    ),
                },
                "path": {
                    "type": "string",
                    "description": "Repo-relative path. Required for read; scopes grep/list/tree "
                    "(e.g. 'enter.pollinations.ai/src').",
                },
                "glob": {
                    "type": "string",
                    "description": "Filename filter, e.g. '*.ts' or '**/*.test.ts'.",
                },
                "top_k": {
                    "type": "integer",
                    "description": "action=search: number of semantic results (default 5, max 10).",
                },
                "start_line": {
                    "type": "integer",
                    "description": "action=read: first line (1-indexed).",
                },
                "end_line": {
                    "type": "integer",
                    "description": "action=read: last line. Omit to read to end (capped at 800 lines).",
                },
                "literal": {
                    "type": "boolean",
                    "description": "action=grep: treat the pattern as a literal string, not a regex.",
                },
                "case_sensitive": {
                    "type": "boolean",
                    "description": "action=grep: match case exactly. Default false.",
                },
                "context_lines": {
                    "type": "integer",
                    "description": "action=grep: lines of surrounding context per match (max 10).",
                },
                "max_results": {
                    "type": "integer",
                    "description": (
                        "action=grep/list: cap on results (default 50, max 100). "
                        "action=callers/callees: cap on results (default 20, max 50)."
                    ),
                },
                "depth": {
                    "type": "integer",
                    "description": (
                        "action=tree: directory levels to show (default 2, max 4). "
                        "action=impact: how many hops to traverse (default 2, max 4)."
                    ),
                },
            },
            "required": [],
        },
    },
}

# =============================================================================
# NATIVE GEMINI TOOLS - Built-in tools that Gemini executes natively (FAST!)
# These are passed with minimal definition - Gemini handles them internally
# =============================================================================

NATIVE_GOOGLE_SEARCH = {
    "type": "function",
    "function": {
        "name": "google_search",
    },
}

NATIVE_CODE_EXECUTION = {
    "type": "function",
    "function": {
        "name": "code_execution",
    },
}

NATIVE_URL_CONTEXT = {
    "type": "function",
    "function": {
        "name": "url_context",
    },
}

# =============================================================================
# WEB SEARCH TOOL - Uses Perplexity models via Pollinations API (for complex queries)
# =============================================================================

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Web search via Perplexity (sonar-pro) — real-time results with citations.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query - be specific for better results",
                },
            },
            "required": ["query"],
        },
    },
}

# =============================================================================
# WEB SCRAPE TOOL - Crawl4AI powered async scraping
# =============================================================================

WEB_SCRAPE_TOOL = {
    "type": "function",
    "function": {
        "name": "web_scrape",
        "description": """Full-powered web scraping with Crawl4AI. Multiple extraction strategies + anti-bot bypass.

Actions:
- scrape: URL → clean markdown
- extract: URL + LLM extraction (smart, flexible)
- css_extract: URL + CSS schema (FAST, structured - 10-100x faster than LLM!)
- semantic: URL + cosine clustering (finds related content blocks)
- regex: URL + pattern extraction (emails, URLs, phones, dates, IPs)
- multi: Multiple URLs concurrently (max 10)
- fetch_file: Fetch + parse Discord attachment (code, json, logs)
- parse_file: Parse raw file content directly

Anti-bot features:
- stealth_mode: Avoid detection (modifies navigator, headers)
- simulate_user: Human-like behavior (delays, mouse movements)
- magic_mode: Auto bypass (combines stealth + simulation)

Page scanning:
- scan_full_page: Scroll entire page to load lazy content
- process_iframes: Extract content from iframes""",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "scrape",
                        "extract",
                        "css_extract",
                        "semantic",
                        "regex",
                        "multi",
                        "fetch_file",
                        "parse_file",
                    ],
                    "description": "Action to perform",
                },
                "url": {
                    "type": "string",
                    "description": "URL to scrape (for URL-based actions)",
                },
                "urls": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of URLs (for multi action, max 10)",
                },
                "extract": {
                    "type": "string",
                    "description": "LLM extraction instruction (e.g., 'Extract product prices and descriptions')",
                },
                "schema": {
                    "type": "object",
                    "description": "CSS extraction schema: {baseSelector: 'div.item', fields: [{name: 'title', selector: 'h2', type: 'text'}]}",
                },
                "semantic_filter": {
                    "type": "string",
                    "description": "Keywords for semantic/cosine filtering (e.g., 'pricing features')",
                },
                "patterns": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Regex patterns: email, url, phone, date, ip, currency, hashtag, twitter, all",
                },
                "content_filter": {
                    "type": "string",
                    "enum": ["bm25", "pruning"],
                    "description": "Pre-filter content (bm25=keyword relevance, pruning=remove boilerplate)",
                },
                "filter_query": {
                    "type": "string",
                    "description": "Query for content filtering",
                },
                "output_format": {
                    "type": "string",
                    "enum": ["markdown", "fit_markdown", "html"],
                    "description": "Output format (fit_markdown=filtered/cleaner)",
                },
                "js_code": {
                    "type": "string",
                    "description": "JavaScript to execute before extraction (e.g., click buttons, scroll)",
                },
                "wait_for": {
                    "type": "string",
                    "description": "CSS selector to wait for before extraction",
                },
                "include_links": {
                    "type": "boolean",
                    "description": "Include page links in result",
                },
                "include_images": {
                    "type": "boolean",
                    "description": "Include image URLs in result",
                },
                "include_tables": {
                    "type": "boolean",
                    "description": "Extract tables as structured data",
                },
                "screenshot": {
                    "type": "boolean",
                    "description": "Capture screenshot of page",
                },
                "stealth_mode": {
                    "type": "boolean",
                    "description": "Enable stealth to avoid bot detection",
                },
                "simulate_user": {
                    "type": "boolean",
                    "description": "Simulate human behavior (delays, movements)",
                },
                "magic_mode": {
                    "type": "boolean",
                    "description": "Auto anti-bot bypass (stealth + simulation combined)",
                },
                "scan_full_page": {
                    "type": "boolean",
                    "description": "Scroll entire page to load lazy/infinite scroll content",
                },
                "process_iframes": {
                    "type": "boolean",
                    "description": "Extract content from iframes",
                },
                "session_id": {
                    "type": "string",
                    "description": "Session ID for browser reuse (faster repeated scrapes)",
                },
                "file_url": {
                    "type": "string",
                    "description": "Discord attachment URL (for fetch_file action)",
                },
                "file_content": {
                    "type": "string",
                    "description": "Raw file content (for parse_file action)",
                },
                "file_type": {
                    "type": "string",
                    "enum": ["text", "code", "json", "yaml", "log"],
                    "description": "File type hint for parsing",
                },
            },
            "required": ["action"],
        },
    },
}


# =============================================================================
# DISCORD SEARCH TOOL - Full guild search capabilities
# =============================================================================

DISCORD_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "discord_search",
        "description": """Search Discord server - messages, members, channels, threads, roles.
Mentions like <@123>, <#456>, <@&789> are AUTO-PARSED to extract IDs.

ACTIONS:
- messages: Search message content (query required). Can search weeks/months back!
- members: Search by name/nickname, or filter by role
- channels: Search by name or type (text, voice, forum, etc.)
- threads: Search threads by name (includes archived)
- roles: Search roles, optionally list members with that role
- history: Recent messages from channel (no query needed)
- context: Messages around a specific message_id
- thread_history: Thread messages with pagination

EXAMPLES:
- "gemini discussion" → finds all messages mentioning gemini
- "gemini in #dev" → channel_name="dev", query="gemini"
- "files from @user" → user_id from mention, has="file"
- "pinned messages" → pinned=true
- "oldest first" → sort_order="asc"
- "links to github" → link_hostname="github.com"
- "pdf files" → attachment_extension="pdf"
- "exclude bots" → author_type="-bot"
- "messages mentioning @user" → mentions="<@123>" (NOT user_id — that means author)
- "who pinged everyone" → mention_everyone=true

Security: Results filtered to channels the user can access.""",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "messages",
                        "members",
                        "channels",
                        "threads",
                        "roles",
                        "history",
                        "context",
                        "thread_history",
                    ],
                    "description": "What to search",
                },
                "query": {
                    "type": "string",
                    "description": "Search text (required for messages). Mentions auto-parsed.",
                },
                "channel_id": {
                    "type": "integer",
                    "description": "Filter to specific channel",
                },
                "channel_name": {
                    "type": "string",
                    "description": "Find channel by name (alternative to channel_id)",
                },
                "user_id": {
                    "type": "integer",
                    "description": "Filter by author or look up member",
                },
                "role_id": {"type": "integer", "description": "Filter members by role"},
                "role_name": {
                    "type": "string",
                    "description": "Find role by name",
                },
                "message_id": {
                    "type": "integer",
                    "description": "Target message for context action",
                },
                "thread_id": {
                    "type": "integer",
                    "description": "Target thread for thread_history",
                },
                "channel_type": {
                    "type": "string",
                    "enum": ["text", "voice", "forum", "category", "news", "stage"],
                    "description": "Filter channels by type",
                },
                "has": {
                    "type": "string",
                    "enum": ["link", "embed", "file", "video", "image", "sound", "sticker", "poll"],
                    "description": "Filter by attachment type",
                },
                "before": {
                    "type": "string",
                    "description": "Messages before this date/snowflake ID",
                },
                "after": {
                    "type": "string",
                    "description": "Messages after this date/snowflake ID",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 25, max 100 for history)",
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["timestamp", "relevance"],
                    "description": "Sort by time (default) or relevance to query",
                },
                "sort_order": {
                    "type": "string",
                    "enum": ["desc", "asc"],
                    "description": "desc=newest first (default), asc=oldest first",
                },
                "author_type": {
                    "type": "string",
                    "enum": ["user", "bot", "webhook", "-bot"],
                    "description": "Filter by author type. -bot excludes bots.",
                },
                "pinned": {
                    "type": "boolean",
                    "description": "Filter to pinned messages only",
                },
                "link_hostname": {
                    "type": "string",
                    "description": "Filter by URL domain (e.g., 'github.com', 'youtube.com')",
                },
                "attachment_extension": {
                    "type": "string",
                    "description": "Filter by file type (e.g., 'pdf', 'png', 'txt')",
                },
                "mentions": {
                    "type": "string",
                    "description": "Find messages that MENTION this user (differs from user_id, "
                    "which filters by who wrote the message). Accepts <@123> or a raw ID.",
                },
                "mention_everyone": {
                    "type": "boolean",
                    "description": "Filter to messages containing @everyone or @here.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Pagination offset (max 9975, use with limit for paging)",
                },
                "include_archived": {
                    "type": "boolean",
                    "description": "Include archived threads (default true)",
                },
                "include_members": {
                    "type": "boolean",
                    "description": "Include member list for roles (default false)",
                },
            },
            "required": ["action"],
        },
    },
}


# =============================================================================
# DATA VISUALIZATION TOOL - Gemini native code_execution
# =============================================================================

RENDER_VISUAL_TOOL = {
    "type": "function",
    "function": {
        "name": "render_visual",
        "description": """Render data as an image attached to your reply, instead of writing a markdown table or describing a chart in text.

Types: table, bar, horizontal_bar (long category names), line, area, scatter, pie/donut (≤8 slices), heatmap, histogram, diagram.
`diagram` is Mermaid — flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, journey, gantt, pie, quadrantChart, requirementDiagram, gitGraph, mindmap, timeline, sankey, xychart, block, packet, kanban, architecture, radar, treemap, C4Context.

For a diagram you usually do not need this tool: a ```mermaid fence in your reply is rendered inline automatically. Use `type: "diagram"` only for a standalone attachment.

Data shape:
- table:   {"headers": ["A","B"], "rows": [["1","2"], ...]}
- charts:  {"labels": [...], "datasets": [{"label": "Series", "values": [n, ...]}]}
- heatmap: `datasets` rows form the matrix, `labels` are columns
- diagram: Mermaid source as a string, starting with the diagram keyword, e.g.
  "flowchart TD\\n A[Request] --> B{Has balance?}\\n B -->|yes| C[Deduct]\\n B -->|no| D[402]"
  Invalid syntax returns the parser error instead of an image — fix the reported line and retry.

Callable multiple times per turn; each call attaches one image (Discord caps at 10). The image is auto-attached, so do NOT write `![](...)` tags. Table cells support `**bold**`, `*italic*`, `` `code` ``.""",
        "parameters": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": [
                        "table",
                        "bar",
                        "horizontal_bar",
                        "line",
                        "area",
                        "scatter",
                        "pie",
                        "donut",
                        "heatmap",
                        "histogram",
                        "diagram",
                    ],
                    "description": "Visual type. Pick from the enum.",
                },
                "title": {
                    "type": "string",
                    "description": "Title shown above the visual. Keep under 60 chars.",
                },
                "data": {
                    "description": (
                        "Structured data for tables/charts; Mermaid source (a string) for diagram."
                    ),
                },
                "options": {
                    "type": "object",
                    "description": "Optional rendering hints.",
                    "properties": {
                        "x_label": {"type": "string"},
                        "y_label": {"type": "string"},
                        "caption": {"type": "string", "description": "Short note below the chart."},
                        "sort": {"type": "boolean", "description": "Sort bars descending (single-series bar only)."},
                        "stacked": {"type": "boolean", "description": "Stack series for bar charts."},
                    },
                },
            },
            "required": ["type", "title", "data"],
        },
    },
}

# Backward-compat alias — keep the old name pointing at the new schema so
# any cached AI conversations or stale prompts that reference it still work.
DATA_VIZ_TOOL = RENDER_VISUAL_TOOL

