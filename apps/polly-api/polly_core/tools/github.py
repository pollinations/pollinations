"""GitHub Issue, Project, Overview, and Custom tool handlers.

Issue: read + create (auto-labeled 'polly-external') + comment.
PR: handled in github_pr.py.
Project/Overview/Custom: read-only.
"""

import logging
from typing import Optional

import aiohttp

from ..config import config
from . import github_auth
from .github_graphql import github_graphql

logger = logging.getLogger(__name__)

API_TIMEOUT = 60
MAX_ERROR_LENGTH = 200


class GitHubIssueManager:
    """GitHub Issue operations - search, create, comment."""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._connector: Optional[aiohttp.TCPConnector] = None

    @property
    def repo(self) -> str:
        return config.github_repo

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._connector = aiohttp.TCPConnector(
                limit=50,
                limit_per_host=30,
                keepalive_timeout=60,
                enable_cleanup_closed=True,
                ttl_dns_cache=300,
                use_dns_cache=True,
            )
            self._session = aiohttp.ClientSession(
                connector=self._connector,
                timeout=aiohttp.ClientTimeout(total=60, connect=10),
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
        if self._connector:
            await self._connector.close()
            self._connector = None

    async def _get_token(self) -> Optional[str]:
        if github_auth.github_app_auth:
            token = await github_auth.github_app_auth.get_token()
            if token:
                return token
        return config.github_token if config.github_token else None

    def _has_auth(self) -> bool:
        return github_auth.github_app_auth is not None or bool(config.github_token)

    async def _get_headers(self) -> Optional[dict]:
        token = await self._get_token()
        if not token:
            return None
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def create_issue(self, title: str, description: str) -> dict:
        """Create a GitHub issue. Auto-labeled with 'polly-external'."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        if not config.github_repo:
            return {"success": False, "error": "GitHub repository not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues"
        payload = {
            "title": title,
            "body": description,
            "labels": ["polly-external"],
        }

        try:
            session = await self.get_session()
            async with session.post(
                url,
                json=payload,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=API_TIMEOUT),
            ) as response:
                if response.status == 201:
                    data = await response.json()
                    issue_number = data["number"]
                    issue_url = data["html_url"]
                    logger.info(f"Issue created: #{issue_number} - {title}")
                    return {
                        "success": True,
                        "issue_url": issue_url,
                        "issue_number": issue_number,
                    }
                else:
                    error_text = await response.text()
                    logger.error(
                        f"GitHub API error: {response.status} - {error_text[:MAX_ERROR_LENGTH]}"
                    )
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except aiohttp.ClientError as e:
            logger.error(f"Network error creating issue: {e}")
            return {"success": False, "error": "Network error - please try again"}
        except Exception as e:
            logger.error(f"Error creating issue: {e}")
            return {"success": False, "error": str(e)}

    async def add_comment(self, issue_number: int, comment: str) -> dict:
        """Add a comment to an existing issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/comments"

        try:
            session = await self.get_session()
            async with session.post(
                url,
                json={"body": comment},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 201:
                    logger.info(f"Comment added to issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                elif response.status == 404:
                    return {
                        "success": False,
                        "error": f"Issue #{issue_number} not found",
                    }
                else:
                    error_text = await response.text()
                    logger.error(
                        f"Error adding comment: {response.status} - {error_text[:200]}"
                    )
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error adding comment: {e}")
            return {"success": False, "error": str(e)}

    async def list_labels(self) -> list[dict]:
        try:
            result = await github_graphql._fetch_labels()
            if result.get("error"):
                logger.error(f"Error fetching labels: {result['error']}")
                return []
            return result.get("items", [])
        except Exception as e:
            logger.error(f"Error fetching labels: {e}")
            return []

    async def list_milestones(self, state: str = "open") -> list[dict]:
        try:
            result = await github_graphql._fetch_milestones(state=state)
            if result.get("error"):
                logger.error(f"Error fetching milestones: {result['error']}")
                return []
            return result.get("items", [])
        except Exception as e:
            logger.error(f"Error fetching milestones: {e}")
            return []


# Singleton
github_manager = GitHubIssueManager()


# =============================================================================
# TOOL HANDLERS
# =============================================================================


async def tool_github_issue(
    action: str,
    issue_number: int = None,
    keywords: str = None,
    state: str = "open",
    title: str = None,
    description: str = None,
    comment: str = None,
    include_comments: bool = False,
    limit: int = 10,
    labels: list[str] = None,
    edit_index: int = None,
    _context: dict = None,
    **kwargs,
) -> dict:
    """Issue tool — read + create + comment."""
    action = action.lower()

    if action == "get":
        if not issue_number:
            return {"error": "issue_number required"}
        issue = await github_graphql.get_issue_full(
            issue_number=issue_number, comments_count=5 if include_comments else 0
        )
        if not issue:
            return {"error": f"Issue #{issue_number} not found", "not_found": True}
        result = {"issue": issue}
        if include_comments and "comments" in issue:
            result["comments"] = issue.pop("comments")
        return result

    elif action == "get_history":
        if not issue_number:
            return {"error": "issue_number required"}
        return await github_graphql.get_edit_history(
            number=issue_number, is_pr=False, limit=limit or 10, edit_index=edit_index
        )

    elif action == "search":
        if not keywords:
            return {"error": "keywords required"}
        issues = await github_graphql.search_issues_full(
            keywords=keywords, state=state, limit=limit
        )
        return {
            "issues": issues,
            "count": len(issues),
            "query": keywords,
            "state": state,
        }

    elif action == "find_similar":
        if not keywords:
            return {"error": "keywords required"}
        issues = await github_graphql.find_similar_issues(
            keywords=keywords, limit=limit or 5
        )
        return {
            "similar_issues": issues,
            "count": len(issues),
            "keywords": keywords,
            "hint": "If any match, suggest adding a comment instead of creating a duplicate.",
        }

    elif action == "list_labels":
        labels_list = await github_manager.list_labels()
        return {"labels": labels_list, "count": len(labels_list)}

    elif action == "list_milestones":
        milestones = await github_manager.list_milestones(state=state)
        return {"milestones": milestones, "count": len(milestones), "state": state}

    # CREATE + COMMENT (allowed for public API)
    elif action == "create":
        if not title or not description:
            return {"error": "title and description required"}
        return await github_manager.create_issue(title=title, description=description)

    elif action == "comment":
        if not issue_number or not comment:
            return {"error": "issue_number and comment required"}
        return await github_manager.add_comment(
            issue_number=issue_number, comment=comment
        )

    # SUB-ISSUE READ ACTIONS
    elif action == "get_sub_issues":
        if not issue_number:
            return {"error": "issue_number required"}
        issue = await github_graphql.get_issue_full(
            issue_number=issue_number, comments_count=0
        )
        if not issue or issue.get("error"):
            return issue or {"error": f"Issue #{issue_number} not found"}
        sub_issues = issue.get("sub_issues", [])
        return {
            "parent_issue": {"number": issue["number"], "title": issue["title"]},
            "sub_issues": sub_issues,
            "count": len(sub_issues),
        }

    elif action == "get_parent":
        if not issue_number:
            return {"error": "issue_number required"}
        issue = await github_graphql.get_issue_full(
            issue_number=issue_number, comments_count=0
        )
        if not issue or issue.get("error"):
            return issue or {"error": f"Issue #{issue_number} not found"}
        parent = issue.get("parent_issue")
        if parent:
            return {
                "issue": {"number": issue["number"], "title": issue["title"]},
                "parent_issue": parent,
            }
        return {
            "issue": {"number": issue["number"], "title": issue["title"]},
            "parent_issue": None,
            "message": f"Issue #{issue_number} has no parent",
        }

    else:
        return {
            "error": f"Unknown action: {action}",
            "valid_actions": [
                "get", "get_history", "search", "find_similar", "list_labels",
                "list_milestones", "create", "comment", "get_sub_issues", "get_parent",
            ],
        }


async def tool_github_project(
    action: str,
    project_number: int = None,
    issue_number: int = None,
    status: str = None,
    limit: int = 50,
    _context: dict = None,
    **kwargs,
) -> dict:
    """Project tool — view boards and items."""
    action = action.lower()

    if action == "list":
        return await github_graphql.list_projects(limit=limit)

    if not project_number:
        return {"error": f"project_number required for '{action}' action. Use action='list' to see all projects."}

    if action == "view":
        result = await github_graphql.get_project_view(project_number)
        if result.get("error"):
            return {"error": result["error"], "not_found": True}
        return result

    elif action == "list_items":
        result = await github_graphql.list_project_items(
            project_number=project_number, status=status, limit=limit
        )
        if result.get("error"):
            return {"error": result["error"], "not_found": True}
        return result

    elif action == "get_item":
        if not issue_number:
            return {"error": "issue_number required"}
        return await github_graphql.get_project_item(
            project_number=project_number, issue_number=issue_number
        )

    else:
        return {
            "error": f"Unknown action: {action}",
            "valid_actions": ["list", "view", "list_items", "get_item"],
        }


async def tool_github_custom(
    request: str = None,
    graphql_query: str = None,
    rest_endpoint: str = None,
    include_body: bool = False,
    limit: int = 50,
    _context: dict = None,
    **kwargs,
) -> dict:
    """Custom GitHub data fetching - read-only."""
    return await github_graphql.execute_custom_request(
        request=request or "",
        include_body=include_body,
        limit=limit,
        graphql_query=graphql_query,
        rest_endpoint=rest_endpoint,
    )


async def tool_github_overview(
    issues_limit: int = 10,
    include_projects: bool = True,
    _context: dict = None,
    **kwargs,
) -> dict:
    """Repository overview - issues, labels, milestones, projects."""
    return await github_graphql.get_repo_overview(
        issues_limit=min(issues_limit, 50), include_projects=include_projects
    )
