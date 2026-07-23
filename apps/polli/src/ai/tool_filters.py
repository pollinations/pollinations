"""Tool visibility rules — which tools each caller may use."""

from ..utils.regex import re
from .tools import (
    CODE_SEARCH_TOOL,
    DATA_VIZ_TOOL,
    DISCORD_SEARCH_TOOL,
    GITHUB_TOOLS,
    RENDER_VISUAL_TOOL,
    WEB_SCRAPE_TOOL,
    WEB_SEARCH_TOOL,
)

def get_tools_with_embeddings(base_tools: list, code_search_enabled: bool) -> list:
    """Build the tool list, including code_search only when it is configured."""
    tools = base_tools.copy()

    # NOTE: Native Gemini tools (google_search, code_execution, url_context) are disabled
    # because current model (Kimi) doesn't support them. Use web_search instead.
    # tools.append(NATIVE_GOOGLE_SEARCH)
    # tools.append(NATIVE_CODE_EXECUTION)
    # tools.append(NATIVE_URL_CONTEXT)

    # Custom tools (our implementations)
    tools.append(WEB_SEARCH_TOOL)
    tools.append(WEB_SCRAPE_TOOL)
    tools.append(DISCORD_SEARCH_TOOL)
    tools.append(DATA_VIZ_TOOL)

    if code_search_enabled:
        tools.append(CODE_SEARCH_TOOL)

    return tools


# =============================================================================
# ADMIN ACTION FILTERING - Hide admin actions from non-admin users
# =============================================================================

# Admin actions per tool - these lines will be removed from descriptions for non-admins
ADMIN_ACTIONS = {
    "github_issue": {
        "close",
        "reopen",
        "edit",
        "label",
        "unlabel",
        "assign",
        "unassign",
        "milestone",
        "lock",
        "link",
        "create_sub_issue",
        "add_sub_issue",
        "remove_sub_issue",
    },
    "github_pr": {
        "request_review",
        "remove_reviewer",
        "approve",
        "request_changes",
        "merge",
        "update",
        "create",
        "convert_to_draft",
        "ready_for_review",
        "update_branch",
        "inline_comment",
        "suggest",
        "resolve_thread",
        "unresolve_thread",
        "enable_auto_merge",
        "disable_auto_merge",
        "close",
        "reopen",
    },
    "github_project": {"add", "remove", "set_status", "set_field"},
}


def _filter_tool_actions(
    tools: list,
    restricted_actions: dict[str, set],
    excluded_tools: set | None = None,
) -> list:
    """
    Shared helper — strips restricted actions from tool descriptions and enums.

    Removes:
    1. Tools in excluded_tools entirely
    2. Description lines mentioning any restricted action name
    3. Restricted actions from the action enum

    Args:
        tools: List of tool definitions
        restricted_actions: {tool_name: {action1, action2, ...}} to block
        excluded_tools: Tool names to remove entirely (optional)
    """
    import copy

    filtered_tools = []

    for tool in tools:
        tool_name = tool.get("function", {}).get("name", "")

        if excluded_tools and tool_name in excluded_tools:
            continue

        if tool_name not in restricted_actions:
            filtered_tools.append(tool)
            continue

        blocked = restricted_actions[tool_name]
        tool_copy = copy.deepcopy(tool)
        description = tool_copy["function"]["description"]

        # Remove description lines that mention any blocked action
        lines = description.split("\n")
        filtered_lines = [
            line
            for line in lines
            if not any(f"- {action}" in line.lower() or f" {action}:" in line.lower() for action in blocked)
            and "[admin]" not in line.lower()
        ]
        tool_copy["function"]["description"] = "\n".join(filtered_lines)

        # Filter the action enum
        params = tool_copy["function"].get("parameters", {})
        props = params.get("properties", {})
        action_prop = props.get("action", {})

        if "enum" in action_prop:
            action_prop["enum"] = [a for a in action_prop["enum"] if a not in blocked]

        filtered_tools.append(tool_copy)

    return filtered_tools


# Actions that collaborators CAN do (matches GitHub collaborator permissions)
COLLABORATOR_ALLOWED_ACTIONS = {
    "github_issue": {"close", "reopen", "label", "unlabel", "assign", "unassign"},
}

# Actions hidden from collaborators (admin-only stuff they can't do)
COLLABORATOR_RESTRICTED_ACTIONS = {
    "github_issue": ADMIN_ACTIONS["github_issue"] - COLLABORATOR_ALLOWED_ACTIONS.get("github_issue", set()),
    "github_pr": ADMIN_ACTIONS["github_pr"],
    "github_project": ADMIN_ACTIONS["github_project"],
}


def filter_admin_actions_from_tools(tools: list, is_admin: bool, is_collaborator: bool = False) -> list:
    """Filter admin actions from tool descriptions for non-admin Discord users.

    Collaborators see a subset of admin actions (close, reopen, label, assign).
    """
    if is_admin:
        return tools
    if is_collaborator:
        return _filter_tool_actions(tools, COLLABORATOR_RESTRICTED_ACTIONS)
    return _filter_tool_actions(tools, ADMIN_ACTIONS)


# =============================================================================
# API TOOL FILTERING - Stricter than Discord non-admin
# =============================================================================

# Actions blocked for API users (superset of ADMIN_ACTIONS — also blocks PR comment/review)
API_RESTRICTED_ACTIONS = {
    "github_issue": ADMIN_ACTIONS["github_issue"],
    "github_pr": ADMIN_ACTIONS["github_pr"] | {"comment", "review"},
    "github_project": ADMIN_ACTIONS["github_project"],
}

# Tools entirely excluded from API mode
API_EXCLUDED_TOOLS = {
    "github_custom",
    "subscribe_issue",
    "unsubscribe_issue",
    "unsubscribe_all",
    "list_subscriptions",
    "render_visual",
}


def filter_api_tools(tools: list) -> list:
    """Filter tools for API mode — stricter than Discord non-admin."""
    return _filter_tool_actions(tools, API_RESTRICTED_ACTIONS, API_EXCLUDED_TOOLS)


# Risky actions - AI uses judgment but these are hints for high-risk ops
# The AI decides contextually what needs confirmation based on impact
RISKY_ACTIONS = {
    "merge": "merge this PR",
    "close": "close this",
    "delete_branch": "delete this branch",
    "lock": "lock this issue",
    # AI can also confirm other high-impact ops like bulk edits, force push, etc.
}

# =============================================================================
# SMART TOOL FILTERING - Match user intent to relevant tools
# =============================================================================

# Keywords that indicate which tool(s) to use
# Compiled regex patterns for fast matching
# Note: Use word boundaries but allow plurals with optional 's'
TOOL_KEYWORDS = {
    "github_issue": re.compile(
        r"\b(issues?|bugs?|reports?|#\d+|problems?|errors?|feature requests?|enhancements?|"
        r"subscrib\w*|labels?|assign\w*|close[ds]?|reopen\w*|milestones?|"
        r"sub.?issues?|child|parent|my issues|duplicates?|similar|ticket)\b",
        re.IGNORECASE,
    ),
    "github_pr": re.compile(
        r"\b(prs?|pull\s*requests?|merge[ds]?|review\w*|approv\w*|diffs?|"
        r"checks?|ci|workflow|drafts?|auto.?merge)\b",
        re.IGNORECASE,
    ),
    "github_project": re.compile(
        r"\b(projects?\s*(board)?|boards?|kanban|sprint|columns?|todo|in\s*progress|done|backlog)\b",
        re.IGNORECASE,
    ),
    "github_custom": re.compile(
        r"\b(stats?|statistics?|activit\w*|stale|spam|health|contributors?|history|"
        r"commits?|changelog|releases?|tags?|branch(es)?|blame|recent\s+changes)\b",
        re.IGNORECASE,
    ),
    # Also matches plain aggregate questions ("how many open issues?"), which previously
    # fell through to a web search even though this tool answers them in one call.
    "github_overview": re.compile(
        r"\b(overview|summary|show\s*(me\s*)?(the\s*)?repo|what.*(issues|labels|milestones).*exist|"
        r"whats?\s*(in\s*)?the\s*repo|repo\s*(status|info)|"
        r"how\s*many\s*(open|closed)?\s*(issues?|prs?|pull\s*requests?|labels?|milestones?)|"
        r"(issue|pr)\s*count|count\s*of\s*(issues?|prs?))\b",
        re.IGNORECASE,
    ),
    "web_scrape": re.compile(
        r"\b(scrape|scraping|crawl|fetch\s+(this\s+)?(page|url|website|site|link)|"
        r"read\s+(this\s+)?(page|url|website|article|doc)|"
        r"get\s+(the\s+)?(content|text|data)\s+(from|of)\s+(this\s+)?(url|page|site)|"
        r"extract\s+(from|data)|whats?\s+(on|at)\s+(this\s+)?(url|page|site|link))\b",
        re.IGNORECASE,
    ),
    "render_visual": re.compile(
        r"\b(charts?|graphs?|plots?|visualiz\w*|bar\s*chart|line\s*chart|pie\s*chart|"
        r"donut|scatter|heatmap|radar|histogram|diagram|infographic|dashboard|tables?|"
        r"comparison|matrix|distribut\w*|"
        # Asking to be shown something is a request for a picture as often as for prose.
        r"draw|sketch|flow\s*chart|flowchart|sequence|gantt|timeline|mindmap|"
        r"architecture|pipeline|state\s*machine|topology)\b",
        re.IGNORECASE,
    ),
    # NOTE: web_search and code_search are NOT filtered by keywords
    # AI decides when to use them based on context - they're always available
}

# Sent when nothing matches. Between them these answer almost any open-ended question:
# the repo, the web, this server, and a repo summary for "how many/what is there" asks.
# Anything more specific (PRs, projects, charts) trips a keyword and gets added back.
DEFAULT_TOOLS = {
    "code_search",
    "web_search",
    "web_scrape",
    "discord_search",
    "github_overview",
    "github_issue",
}


def filter_tools_by_intent(user_message: str, all_tools: list[dict], is_admin: bool = False) -> list[dict]:
    """
    Filter tools based on user intent keywords.
    Fast regex matching - no API calls.

    Args:
        user_message: The user's message
        all_tools: Full list of tool definitions
        is_admin: Whether user is admin

    Returns:
        Filtered list of relevant tools, or all tools if no match
    """
    matched_tools = set()
    message_lower = user_message.lower()

    # Check each tool's keywords against the message
    for tool_name, pattern in TOOL_KEYWORDS.items():
        if pattern.search(message_lower):
            matched_tools.add(tool_name)

    # No keyword hit does not mean no tool is needed — plenty of real questions ("laguna is
    # from openrouter right?") match nothing yet still want a lookup. Send the tools that
    # answer open-ended questions rather than the whole set: it is cheaper on every
    # iteration, and a shorter list is easier to choose from correctly.
    if not matched_tools:
        fallback = [
            tool
            for tool in all_tools
            if tool.get("function", {}).get("name") in DEFAULT_TOOLS
        ]
        return fallback or all_tools

    # Always include github_issue if user mentions a number like #123
    if re.search(r"#\d+", user_message):
        matched_tools.add("github_issue")
        # Could be PR too - add if not already filtering for something specific
        if len(matched_tools) == 1:
            matched_tools.add("github_pr")

    # Always include these tools - AI decides when to use them
    AI_CONTROLLED_TOOLS = {"web_search", "code_search", "discord_search"}

    # Filter tools list
    filtered = [
        tool
        for tool in all_tools
        if tool.get("function", {}).get("name") in matched_tools
        or tool.get("function", {}).get("name") in AI_CONTROLLED_TOOLS
    ]

    # Return filtered if we got matches, otherwise all (safety)
    return filtered if filtered else all_tools


# =============================================================================
# TOOL-BASED SYSTEM PROMPT - AI has FULL AUTONOMY
# =============================================================================

