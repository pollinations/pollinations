"""GitHub integration for full issue management.

Uses GraphQL for read operations (blazing fast!) and REST for write operations.
Supports both GitHub App (for org repos) and PAT authentication.
"""

import asyncio
import logging
import aiohttp
from typing import Optional
from urllib.parse import quote

from ..config import config
from ..constants import API_TIMEOUT, MAX_ERROR_LENGTH
from .github_graphql import github_graphql
from . import github_auth

logger = logging.getLogger(__name__)


class GitHubManager:
    """Full GitHub Issues management - search, lookup, create, comment."""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._connector: Optional[aiohttp.TCPConnector] = None

    @property
    def repo(self) -> str:
        """Get the configured repository."""
        return config.github_repo

    async def get_session(self) -> aiohttp.ClientSession:
        """Get or create the aiohttp session with connection pooling."""
        if self._session is None or self._session.closed:
            # Connection pooling for faster subsequent requests
            self._connector = aiohttp.TCPConnector(
                limit=50,  # Max total connections
                limit_per_host=30,  # Max per host (GitHub)
                keepalive_timeout=60,  # Keep connections alive longer
                enable_cleanup_closed=True,
                ttl_dns_cache=300,  # Cache DNS for 5 mins
                use_dns_cache=True,
            )
            self._session = aiohttp.ClientSession(
                connector=self._connector,
                timeout=aiohttp.ClientTimeout(total=60, connect=10),
            )
        return self._session

    async def close(self):
        """Close the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
        if self._connector:
            await self._connector.close()
            self._connector = None

    async def _get_token(self) -> Optional[str]:
        """Get GitHub token (from App or PAT)."""
        if github_auth.github_app_auth:
            token = await github_auth.github_app_auth.get_token()
            if token:
                return token
        # Fallback to PAT
        return config.github_token if config.github_token else None

    def _has_auth(self) -> bool:
        """Check if any auth method is available (sync check)."""
        has_app = github_auth.github_app_auth is not None
        has_pat = bool(config.github_token)
        logger.debug(f"_has_auth check: app={has_app}, pat={has_pat}")
        return has_app or has_pat

    async def _get_headers(self) -> Optional[dict]:
        """Get standard GitHub API headers."""
        token = await self._get_token()
        if not token:
            return None
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    # ============================================================
    # SEARCH OPERATIONS
    # ============================================================

    async def search_issues(
        self,
        keywords: str,
        state: str = "open",
        author: Optional[str] = None,
        labels: Optional[list[str]] = None,
        limit: int = 10,
    ) -> list[dict]:
        """
        Search issues with flexible filters.

        Args:
            keywords: Search terms
            state: "open", "closed", or "all"
            author: GitHub username or Discord username (searches body for Discord)
            labels: List of labels to filter by
            limit: Max results (default 10)

        Returns:
            List of issue dicts with number, title, state, url, labels, created_at
        """
        if not self._has_auth():
            return []

        # Build query parts
        query_parts = [f"repo:{config.github_repo}", "is:issue"]

        if keywords.strip():
            query_parts.insert(0, keywords)

        if state != "all":
            query_parts.append(f"is:{state}")

        if author:
            # Could be GitHub username or Discord username in body
            # We'll search body for Discord usernames
            query_parts.append(f'"{author}"')

        if labels:
            for label in labels:
                query_parts.append(f'label:"{label}"')

        query = " ".join(query_parts)
        encoded_query = quote(query, safe="")
        url = f"https://api.github.com/search/issues?q={encoded_query}&per_page={limit}&sort=updated&order=desc"

        try:
            session = await self.get_session()
            async with session.get(
                url,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=15),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._format_issue_list(data.get("items", []))
                else:
                    logger.warning(f"Search API error: {response.status}")
        except Exception as e:
            logger.warning(f"Issue search failed: {e}")

        return []

    async def search_discord_issues(
        self,
        discord_username: Optional[str] = None,
        state: str = "open",
        limit: int = 10,
    ) -> list[dict]:
        """
        Search for issues created via Discord.

        Args:
            discord_username: Filter by Discord author (e.g., "_dr_misterio_")
            state: "open", "closed", or "all"
            limit: Max results

        Returns:
            List of issues created via Discord
        """
        # Search for issues with Discord author marker
        keywords = '"**Author:**"'
        if discord_username:
            keywords += f' "{discord_username}"'

        return await self.search_issues(keywords=keywords, state=state, limit=limit)

    async def search_similar_issues(self, keywords: str, limit: int = 5) -> list[dict]:
        """
        Search for similar issues (used during issue creation).
        Optimized for speed - only open issues.
        """
        return await self.search_issues(keywords=keywords, state="open", limit=limit)

    # ============================================================
    # SINGLE ISSUE OPERATIONS
    # ============================================================

    async def get_issue(self, issue_number: int) -> Optional[dict]:
        """
        Get full details of a single issue.

        Args:
            issue_number: The issue number

        Returns:
            Issue dict with full details, or None if not found
        """
        if not self._has_auth():
            return None

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}"

        try:
            session = await self.get_session()
            async with session.get(
                url,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._format_issue_detail(data)
                elif response.status == 404:
                    return None
                else:
                    logger.warning(f"Get issue API error: {response.status}")
        except Exception as e:
            logger.warning(f"Get issue failed: {e}")

        return None

    async def get_issue_comments(self, issue_number: int, limit: int = 5) -> list[dict]:
        """
        Get recent comments on an issue.

        Args:
            issue_number: The issue number
            limit: Max comments to fetch

        Returns:
            List of comment dicts
        """
        if not self._has_auth():
            return []

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/comments?per_page={limit}"

        try:
            session = await self.get_session()
            async with session.get(
                url,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return [
                        {
                            "id": c["id"],  # Comment ID for edit_comment/delete_comment
                            "author": c["user"]["login"],
                            "body": (
                                c["body"][:500] + "..."
                                if len(c["body"]) > 500
                                else c["body"]
                            ),
                            "created_at": c["created_at"][:10],
                        }
                        for c in data
                    ]
        except Exception as e:
            logger.warning(f"Get comments failed: {e}")

        return []

    # ============================================================
    # WRITE OPERATIONS
    # ============================================================

    async def create_issue(
        self,
        title: str,
        description: str,
        reporter: str,
        participants: Optional[list[str]] = None,
        image_urls: Optional[list[str]] = None,
        user_role_ids: Optional[list[int]] = None,
        reporter_id: Optional[int] = None,
        message_url: Optional[str] = None,
    ) -> dict:
        """
        Create a GitHub issue directly via the API.
        Returns the actual issue number from the API response.

        """

        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        if not config.github_repo:
            return {"success": False, "error": "GitHub repository not configured"}

        body = self._build_issue_body(
            description=description,
            reporter=reporter,
            participants=participants,
            image_urls=image_urls,
            reporter_id=reporter_id,
            message_url=message_url,
        )

        url = f"https://api.github.com/repos/{config.github_repo}/issues"

        # No labels - external workflows handle labeling
        payload = {"title": title, "body": body}

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

    async def add_comment(self, issue_number: int, comment: str, author: str) -> dict:
        """Add a comment to an existing issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/comments"

        body = f"{comment}\n\n---\n**From:** `{author}`\n\n*Added via Discord*"

        try:
            session = await self.get_session()
            async with session.post(
                url,
                json={"body": body},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 201:
                    logger.info(f"Comment added to issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                elif response.status == 403:
                    error_text = await response.text()
                    logger.error(f"403 Forbidden adding comment: {error_text[:200]}")
                    return {
                        "success": False,
                        "error": "Permission denied - check bot's GitHub token permissions",
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

    async def _get_comment(self, comment_id: int) -> dict | None:
        """Fetch a comment by ID to verify ownership."""
        url = f"https://api.github.com/repos/{config.github_repo}/issues/comments/{comment_id}"
        try:
            session = await self.get_session()
            async with session.get(
                url,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    return await response.json()
                return None
        except Exception:
            return None

    def _verify_comment_ownership(self, comment_body: str, requester: str) -> bool:
        """Check if the comment was originally requested by this user."""
        # Comments created via Discord have format: **From:** `username`
        # Check if the requester's name appears in the attribution
        if not comment_body or not requester:
            return False
        # Match the exact format used in add_comment()
        return f"**From:** `{requester}`" in comment_body

    async def edit_comment(
        self, comment_id: int, new_body: str, requester: str = None
    ) -> dict:
        """Edit an existing comment by its ID. Only the original requester can edit."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/comments/{comment_id}"

        # Verify ownership if requester provided
        if requester:
            comment = await self._get_comment(comment_id)
            if not comment:
                return {"success": False, "error": f"Comment {comment_id} not found"}
            if not self._verify_comment_ownership(comment.get("body", ""), requester):
                return {
                    "success": False,
                    "error": "You can only edit comments you originally requested",
                }

        try:
            session = await self.get_session()
            async with session.patch(
                url,
                json={"body": new_body},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    logger.info(f"Comment {comment_id} edited")
                    return {"success": True, "comment_id": comment_id}
                elif response.status == 403:
                    return {
                        "success": False,
                        "error": "Permission denied - can only edit bot's own comments",
                    }
                elif response.status == 404:
                    return {
                        "success": False,
                        "error": f"Comment {comment_id} not found",
                    }
                else:
                    error_text = await response.text()
                    logger.error(
                        f"Error editing comment: {response.status} - {error_text[:200]}"
                    )
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error editing comment: {e}")
            return {"success": False, "error": str(e)}

    async def delete_comment(self, comment_id: int, requester: str = None) -> dict:
        """Delete a comment by its ID. Only the original requester can delete."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/comments/{comment_id}"

        # Verify ownership if requester provided
        if requester:
            comment = await self._get_comment(comment_id)
            if not comment:
                return {"success": False, "error": f"Comment {comment_id} not found"}
            if not self._verify_comment_ownership(comment.get("body", ""), requester):
                return {
                    "success": False,
                    "error": "You can only delete comments you originally requested",
                }

        try:
            session = await self.get_session()
            async with session.delete(
                url,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 204:
                    logger.info(f"Comment {comment_id} deleted")
                    return {"success": True, "comment_id": comment_id}
                elif response.status == 403:
                    return {
                        "success": False,
                        "error": "Permission denied - can only delete bot's own comments",
                    }
                elif response.status == 404:
                    return {
                        "success": False,
                        "error": f"Comment {comment_id} not found",
                    }
                else:
                    error_text = await response.text()
                    logger.error(
                        f"Error deleting comment: {response.status} - {error_text[:200]}"
                    )
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error deleting comment: {e}")
            return {"success": False, "error": str(e)}

    # ============================================================
    # ADMIN OPERATIONS
    # ============================================================

    async def close_issue(
        self,
        issue_number: int,
        reason: str = "completed",
        comment: Optional[str] = None,
    ) -> dict:
        """Close an issue with optional comment."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}"

        # Map reason to GitHub's state_reason
        state_reason = "completed" if reason == "completed" else "not_planned"

        try:
            session = await self.get_session()

            # Add comment first if provided
            if comment:
                await self.add_comment(issue_number, comment, "Admin")

            # Close the issue
            async with session.patch(
                url,
                json={"state": "closed", "state_reason": state_reason},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    logger.info(f"Closed issue #{issue_number} ({reason})")
                    return {
                        "success": True,
                        "issue_number": issue_number,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error closing issue: {e}")
            return {"success": False, "error": str(e)}

    async def reopen_issue(
        self, issue_number: int, comment: Optional[str] = None
    ) -> dict:
        """Reopen a closed issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}"

        try:
            session = await self.get_session()

            # Add comment first if provided
            if comment:
                await self.add_comment(issue_number, comment, "Admin")

            # Reopen the issue
            async with session.patch(
                url,
                json={"state": "open"},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    logger.info(f"Reopened issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_number": issue_number,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error reopening issue: {e}")
            return {"success": False, "error": str(e)}

    async def edit_issue(
        self, issue_number: int, title: Optional[str] = None, body: Optional[str] = None
    ) -> dict:
        """Edit an issue's title and/or body."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        if not title and not body:
            return {
                "success": False,
                "error": "Nothing to update - provide title or body",
            }

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}"

        payload = {}
        if title:
            payload["title"] = title
        if body:
            payload["body"] = body

        try:
            session = await self.get_session()
            async with session.patch(
                url,
                json=payload,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    logger.info(f"Edited issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_number": issue_number,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                        "updated": list(payload.keys()),
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error editing issue: {e}")
            return {"success": False, "error": str(e)}

    async def add_labels(self, issue_number: int, labels: list[str]) -> dict:
        """Add labels to an issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/labels"

        try:
            session = await self.get_session()
            async with session.post(
                url,
                json={"labels": labels},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status in (200, 201):
                    logger.info(f"Added labels {labels} to issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_number": issue_number,
                        "labels_added": labels,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error adding labels: {e}")
            return {"success": False, "error": str(e)}

    async def remove_labels(self, issue_number: int, labels: list[str]) -> dict:
        """Remove labels from an issue (parallel execution)."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        async def remove_single_label(label: str) -> tuple[str, bool, str]:
            """Remove a single label, return (label, success, error)."""
            url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/labels/{label}"
            try:
                session = await self.get_session()
                async with session.delete(
                    url,
                    headers=await self._get_headers(),
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status in (200, 204):
                        return (label, True, "")
                    else:
                        return (label, False, str(response.status))
            except Exception as e:
                return (label, False, str(e))

        try:
            # Execute all label removals in parallel
            results = await asyncio.gather(
                *[remove_single_label(label) for label in labels]
            )

            removed = [r[0] for r in results if r[1]]
            errors = [f"{r[0]}: {r[2]}" for r in results if not r[1]]

            if removed:
                logger.info(f"Removed labels {removed} from issue #{issue_number}")

            return {
                "success": len(removed) > 0,
                "issue_number": issue_number,
                "labels_removed": removed,
                "errors": errors if errors else None,
                "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
            }
        except Exception as e:
            logger.error(f"Error removing labels: {e}")
            return {"success": False, "error": str(e)}

    async def assign_issue(self, issue_number: int, assignees: list[str]) -> dict:
        """Assign users to an issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/assignees"

        try:
            session = await self.get_session()
            async with session.post(
                url,
                json={"assignees": assignees},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status in (200, 201):
                    logger.info(f"Assigned {assignees} to issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_number": issue_number,
                        "assignees_added": assignees,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                elif response.status == 403:
                    return {
                        "success": False,
                        "error": "Permission denied - the bot's GitHub token doesn't have write access to this repository",
                    }
                elif response.status == 404:
                    return {
                        "success": False,
                        "error": f"Issue #{issue_number} not found or user doesn't exist",
                    }
                else:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status} - {error_text[:100]}",
                    }
        except Exception as e:
            logger.error(f"Error assigning issue: {e}")
            return {"success": False, "error": str(e)}

    async def unassign_issue(self, issue_number: int, assignees: list[str]) -> dict:
        """Remove assignees from an issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/assignees"

        try:
            session = await self.get_session()
            async with session.delete(
                url,
                json={"assignees": assignees},
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    logger.info(f"Unassigned {assignees} from issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_number": issue_number,
                        "assignees_removed": assignees,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error unassigning issue: {e}")
            return {"success": False, "error": str(e)}

    async def link_issues(
        self, issue_number: int, related_issues: list[int], relationship: str
    ) -> dict:
        """Link issues by adding a comment with references."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        # Build relationship text
        relationship_texts = {
            "duplicate": "Duplicate of",
            "related": "Related to",
            "blocks": "Blocks",
            "blocked_by": "Blocked by",
            "parent": "Parent issue:",
            "child": "Child issue of",
        }

        prefix = relationship_texts.get(relationship, "Related to")
        refs = " ".join([f"#{n}" for n in related_issues])
        comment = f"**{prefix}** {refs}"

        result = await self.add_comment(issue_number, comment, "Admin")
        if result.get("success"):
            result["relationship"] = relationship
            result["linked_issues"] = related_issues
        return result

    async def set_milestone(self, issue_number: int, milestone: str) -> dict:
        """Set or remove milestone from an issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}"

        # Handle removal
        if milestone.lower() in ("none", "null", "remove"):
            payload = {"milestone": None}
        else:
            # Need to get milestone number from name
            milestone_num = await self._get_milestone_number(milestone)
            if milestone_num is None:
                return {"success": False, "error": f"Milestone '{milestone}' not found"}
            payload = {"milestone": milestone_num}

        try:
            session = await self.get_session()
            async with session.patch(
                url,
                json=payload,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    logger.info(f"Set milestone '{milestone}' on issue #{issue_number}")
                    return {
                        "success": True,
                        "issue_number": issue_number,
                        "milestone": milestone if payload.get("milestone") else None,
                        "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error setting milestone: {e}")
            return {"success": False, "error": str(e)}

    async def _get_milestone_number(self, milestone_name: str) -> Optional[int]:
        """Get milestone number from name."""
        url = f"https://api.github.com/repos/{config.github_repo}/milestones"

        try:
            session = await self.get_session()
            async with session.get(
                url,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 200:
                    milestones = await response.json()
                    for m in milestones:
                        if m["title"].lower() == milestone_name.lower():
                            return m["number"]
        except Exception as e:
            logger.error(f"Error fetching milestones: {e}")
        return None

    async def list_labels(self) -> list[dict]:
        """Get all labels in the repository using GraphQL."""
        from .github_graphql import github_graphql

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
        """Get all milestones in the repository using GraphQL."""
        from .github_graphql import github_graphql

        try:
            result = await github_graphql._fetch_milestones(state=state)
            if result.get("error"):
                logger.error(f"Error fetching milestones: {result['error']}")
                return []
            return result.get("items", [])
        except Exception as e:
            logger.error(f"Error fetching milestones: {e}")
            return []

    async def lock_issue(
        self, issue_number: int, lock: bool, reason: Optional[str] = None
    ) -> dict:
        """Lock or unlock an issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.github_repo}/issues/{issue_number}/lock"

        try:
            session = await self.get_session()

            if lock:
                payload = {}
                if reason:
                    # GitHub accepts: off-topic, too heated, resolved, spam
                    payload["lock_reason"] = reason.replace(" ", "_")

                async with session.put(
                    url,
                    json=payload if payload else None,
                    headers=await self._get_headers(),
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status == 204:
                        logger.info(f"Locked issue #{issue_number}")
                        return {
                            "success": True,
                            "issue_number": issue_number,
                            "locked": True,
                            "reason": reason,
                            "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"GitHub API error: {response.status}",
                        }
            else:
                async with session.delete(
                    url,
                    headers=await self._get_headers(),
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    if response.status == 204:
                        logger.info(f"Unlocked issue #{issue_number}")
                        return {
                            "success": True,
                            "issue_number": issue_number,
                            "locked": False,
                            "issue_url": f"https://github.com/{config.github_repo}/issues/{issue_number}",
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"GitHub API error: {response.status}",
                        }
        except Exception as e:
            logger.error(f"Error locking/unlocking issue: {e}")
            return {"success": False, "error": str(e)}

    # ============================================================
    # HELPER METHODS
    # ============================================================

    async def _get_latest_issue_number(self) -> Optional[int]:
        """Get the latest issue number (for estimating new issue number)."""
        # Use GraphQL for speed
        return await github_graphql.get_latest_issue_number()

    def _format_issue_list(self, items: list) -> list[dict]:
        """Format issues for list display."""
        results = []
        for item in items:
            body = item.get("body") or ""
            results.append(
                {
                    "number": item["number"],
                    "title": item["title"],
                    "body": body[:300] + "..." if len(body) > 300 else body,
                    "state": item["state"],
                    "url": item["html_url"],
                    "labels": [l["name"] for l in item.get("labels", [])],
                    "created_at": item["created_at"][:10],
                    "author": item["user"]["login"],
                }
            )
        return results

    def _format_issue_detail(self, item: dict) -> dict:
        """Format a single issue with full details."""
        body = item.get("body") or ""
        return {
            "number": item["number"],
            "title": item["title"],
            "body": body[:1000] + "..." if len(body) > 1000 else body,
            "state": item["state"],
            "url": item["html_url"],
            "labels": [l["name"] for l in item.get("labels", [])],
            "created_at": item["created_at"][:10],
            "updated_at": item["updated_at"][:10],
            "author": item["user"]["login"],
            "comments_count": item.get("comments", 0),
            "assignees": [a["login"] for a in item.get("assignees", [])],
        }

    def _build_issue_body(
        self,
        description: str,
        reporter: str,
        participants: Optional[list[str]] = None,
        image_urls: Optional[list[str]] = None,
        reporter_id: Optional[int] = None,
        message_url: Optional[str] = None,
    ) -> str:
        """Build the formatted issue body."""
        body = description

        if image_urls:
            body += "\n\n## Screenshots\n"
            for i, url in enumerate(image_urls, 1):
                body += f"![Screenshot {i}]({url})\n"

        body += "\n\n---\n"
        if participants and len(participants) > 1:
            formatted = [f"`{p}`" for p in participants]
            body += f"**Authors:** {', '.join(formatted)}"
        else:
            # Include Discord username and UID
            author_info = f"`{reporter}`"
            if reporter_id:
                author_info += f" (UID: `{reporter_id}`)"
            body += f"**Author:** {author_info}"

        # Add link back to the Discord message
        if message_url:
            body += f"\n**Source:** [View on Discord]({message_url})"

        return body


# =============================================================================
# CONSOLIDATED TOOL HANDLERS - 3 powerful tools instead of 20+
# =============================================================================


async def tool_github_issue(
    action: str,
    issue_number: int = None,
    keywords: str = None,
    state: str = "open",
    title: str = None,
    description: str = None,
    body: str = None,
    comment: str = None,
    comment_id: int = None,  # For edit_comment/delete_comment actions
    reason: str = "completed",
    labels: list[str] = None,
    assignees: list[str] = None,
    milestone: str = None,
    lock: bool = None,
    related_issues: list[int] = None,
    relationship: str = None,
    discord_username: str = None,
    include_comments: bool = False,
    limit: int = 10,
    child_issue_number: int = None,  # For sub-issue actions
    edit_index: int = None,  # For get_history - get full diff for specific edit (0=most recent)
    # Injected by bot.py for subscriptions (legacy params kept for compatibility)
    user_id: int = 0,
    channel_id: int = 0,
    guild_id: int = None,
    reporter: str = "Discord User",
    user_role_ids: list[int] = None,
    # New: context dict injected by pollinations client
    _context: dict = None,
    **kwargs,  # Catch any extra args
) -> dict:
    """
    Consolidated issue tool - handles ALL issue operations based on action.
    """
    # Extract context if provided (new approach - avoids re-registering handlers per message)
    is_admin = False
    context_user_id = None
    context_user_name = None
    if _context:
        is_admin = _context.get("is_admin", False)
        context_user_id = _context.get("user_id")
        context_user_name = _context.get("user_name")
        user_id = _context.get("user_id", user_id)
        channel_id = _context.get("channel_id", channel_id)
        guild_id = _context.get("guild_id", guild_id)
        reporter = _context.get("reporter", reporter)
        user_role_ids = _context.get("user_role_ids", user_role_ids)

    action = action.lower()

    # ADMIN ACTIONS - require admin permission
    # These actions modify issue state/metadata (not just adding content)
    ADMIN_ACTIONS = {
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
    }

    # Exception: Issue #6418 (Seed Upgrade Tracking) can be edited by anyone
    SEED_TRACKING_ISSUE = 6418
    is_seed_tracking_edit = action == "edit" and issue_number == SEED_TRACKING_ISSUE

    if action in ADMIN_ACTIONS and not is_seed_tracking_edit:
        if not is_admin:
            # SECURITY: Log blocked admin action attempt
            logger.warning(
                f"SECURITY: Blocked admin action '{action}' for non-admin user {context_user_name} (id={context_user_id})"
            )
            return {
                "error": f"The '{action}' action requires admin permissions. Ask a team member with admin access!"
            }
        else:
            logger.info(
                f"Admin action '{action}' authorized for {context_user_name} (id={context_user_id})"
            )

    # READ ACTIONS
    if action == "get":
        if not issue_number:
            return {"error": "issue_number required for 'get' action"}
        issue = await github_graphql.get_issue_full(
            issue_number=issue_number, comments_count=5 if include_comments else 0
        )
        if not issue:
            return {
                "error": f"Issue #{issue_number} not found",
                "not_found": True,
                "hint": "The issue doesn't exist. Ask the user if they meant a different number.",
            }
        result = {"issue": issue}
        if include_comments and "comments" in issue:
            result["comments"] = issue.pop("comments")
        return result

    elif action == "get_history":
        if not issue_number:
            return {"error": "issue_number required for 'get_history' action"}
        history = await github_graphql.get_edit_history(
            number=issue_number, is_pr=False, limit=limit or 10, edit_index=edit_index
        )
        return history

    elif action == "search":
        if not keywords:
            return {"error": "keywords required for 'search' action"}
        issues = await github_graphql.search_issues_full(
            keywords=keywords, state=state, limit=limit
        )
        return {
            "issues": issues,
            "count": len(issues),
            "query": keywords,
            "state": state,
        }

    elif action == "search_user":
        if not discord_username:
            return {"error": "discord_username required for 'search_user' action"}
        issues = await github_graphql.search_user_issues(
            discord_username=discord_username, state=state, limit=limit
        )
        return {
            "issues": issues,
            "count": len(issues),
            "discord_username": discord_username,
        }

    elif action == "find_similar":
        if not keywords:
            return {"error": "keywords required for 'find_similar' action"}
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

    # WRITE ACTIONS
    elif action == "create":
        if not title or not description:
            return {"error": "title and description required for 'create' action"}
        return await github_manager.create_issue(
            title=title,
            description=description,
            reporter=reporter,
            user_role_ids=user_role_ids,
            reporter_id=user_id,  # Discord UID from context
            message_url=(
                _context.get("message_url") if _context else None
            ),  # Link back to Discord
        )

    elif action == "comment":
        if not issue_number or not comment:
            return {"error": "issue_number and comment required for 'comment' action"}
        return await github_manager.add_comment(
            issue_number=issue_number, comment=comment, author=reporter
        )

    elif action == "edit_comment":
        if not comment_id or not body:
            return {"error": "comment_id and body required for 'edit_comment' action"}
        return await github_manager.edit_comment(
            comment_id=comment_id,
            new_body=body,
            requester=reporter,  # Only allow editing comments they originally requested
        )

    elif action == "delete_comment":
        if not comment_id:
            return {"error": "comment_id required for 'delete_comment' action"}
        return await github_manager.delete_comment(
            comment_id=comment_id,
            requester=reporter,  # Only allow deleting comments they originally requested
        )

    # ADMIN ACTIONS
    elif action == "close":
        if not issue_number:
            return {"error": "issue_number required for 'close' action"}
        return await github_manager.close_issue(
            issue_number=issue_number, reason=reason, comment=comment
        )

    elif action == "reopen":
        if not issue_number:
            return {"error": "issue_number required for 'reopen' action"}
        return await github_manager.reopen_issue(
            issue_number=issue_number, comment=comment
        )

    elif action == "edit":
        if not issue_number:
            return {"error": "issue_number required for 'edit' action"}
        return await github_manager.edit_issue(
            issue_number=issue_number, title=title, body=body
        )

    elif action == "label":
        if not issue_number or not labels:
            return {"error": "issue_number and labels required for 'label' action"}
        return await github_manager.add_labels(issue_number=issue_number, labels=labels)

    elif action == "unlabel":
        if not issue_number or not labels:
            return {"error": "issue_number and labels required for 'unlabel' action"}
        return await github_manager.remove_labels(
            issue_number=issue_number, labels=labels
        )

    elif action == "assign":
        if not issue_number or not assignees:
            return {"error": "issue_number and assignees required for 'assign' action"}
        return await github_manager.assign_issue(
            issue_number=issue_number, assignees=assignees
        )

    elif action == "unassign":
        if not issue_number or not assignees:
            return {
                "error": "issue_number and assignees required for 'unassign' action"
            }
        return await github_manager.unassign_issue(
            issue_number=issue_number, assignees=assignees
        )

    elif action == "milestone":
        if not issue_number or not milestone:
            return {
                "error": "issue_number and milestone required for 'milestone' action"
            }
        return await github_manager.set_milestone(
            issue_number=issue_number, milestone=milestone
        )

    elif action == "lock":
        if not issue_number or lock is None:
            return {
                "error": "issue_number and lock (true/false) required for 'lock' action"
            }
        return await github_manager.lock_issue(
            issue_number=issue_number, lock=lock, reason=reason if lock else None
        )

    elif action == "link":
        if not issue_number or not related_issues or not relationship:
            return {
                "error": "issue_number, related_issues, and relationship required for 'link' action"
            }
        return await github_manager.link_issues(
            issue_number=issue_number,
            related_issues=related_issues,
            relationship=relationship,
        )

    # SUBSCRIPTION ACTIONS (async SQLite)
    elif action == "subscribe":
        if not issue_number:
            return {"error": "issue_number required for 'subscribe' action"}
        from .subscriptions import subscription_manager

        issue = await github_graphql.get_issue_full(issue_number)
        if not issue:
            return {"success": False, "error": f"Issue #{issue_number} not found"}
        if await subscription_manager.is_subscribed(user_id, issue_number):
            return {
                "success": False,
                "already_subscribed": True,
                "message": f"Already subscribed to #{issue_number}",
            }
        success = await subscription_manager.subscribe(
            user_id=user_id,
            issue_number=issue_number,
            channel_id=channel_id,
            guild_id=guild_id,
            initial_state=issue,
        )
        if success:
            return {
                "success": True,
                "issue_number": issue_number,
                "message": f"Subscribed to #{issue_number}!",
            }
        return {"success": False, "error": "Failed to subscribe"}

    elif action == "unsubscribe":
        if not issue_number:
            return {"error": "issue_number required for 'unsubscribe' action"}
        from .subscriptions import subscription_manager

        was_subscribed = await subscription_manager.unsubscribe(user_id, issue_number)
        if was_subscribed:
            return {"success": True, "message": f"Unsubscribed from #{issue_number}"}
        return {"success": False, "message": f"Wasn't subscribed to #{issue_number}"}

    elif action == "unsubscribe_all":
        from .subscriptions import subscription_manager

        count = await subscription_manager.unsubscribe_all(user_id)
        return {
            "success": True,
            "unsubscribed_count": count,
            "message": f"Unsubscribed from {count} issues",
        }

    elif action == "list_subscriptions":
        from .subscriptions import subscription_manager

        subs = await subscription_manager.get_user_subscriptions(user_id)
        return {
            "subscriptions": [
                {"issue_number": s["issue_number"], "state": s["last_state"]}
                for s in subs
            ],
            "count": len(subs),
        }

    # SUB-ISSUE ACTIONS
    elif action == "get_sub_issues":
        if not issue_number:
            return {"error": "issue_number required for 'get_sub_issues' action"}
        # get_issue_full already includes sub_issues, so just call it
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
            "hint": (
                "Each sub-issue can be fetched with action='get'"
                if sub_issues
                else "This issue has no sub-issues"
            ),
        }

    elif action == "get_parent":
        if not issue_number:
            return {"error": "issue_number required for 'get_parent' action"}
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
            "message": f"Issue #{issue_number} is not a sub-issue (has no parent)",
        }

    # ADMIN SUB-ISSUE ACTIONS
    elif action == "create_sub_issue":
        # Create a new issue and immediately link it as a sub-issue of the parent
        if not issue_number or not title or not description:
            return {
                "error": "issue_number (parent), title, and description required for 'create_sub_issue' action"
            }
        # Step 1: Create the new issue
        create_result = await github_manager.create_issue(
            title=title,
            description=description,
            reporter=reporter,
            user_role_ids=user_role_ids,
            reporter_id=user_id,
            message_url=_context.get("message_url") if _context else None,
        )
        if not create_result.get("success"):
            return create_result
        # Step 2: Link it as a sub-issue of the parent
        child_number = create_result["issue_number"]
        link_result = await github_graphql.add_sub_issue(
            parent_issue_number=issue_number, child_issue_number=child_number
        )
        if link_result.get("error"):
            # Issue created but linking failed - still return useful info
            return {
                "success": True,
                "partial": True,
                "issue_number": child_number,
                "issue_url": create_result["issue_url"],
                "parent_issue": issue_number,
                "link_error": link_result.get("error"),
                "message": f"Issue #{child_number} created but failed to link as sub-issue of #{issue_number}",
            }
        return {
            "success": True,
            "issue_number": child_number,
            "issue_url": create_result["issue_url"],
            "parent_issue": issue_number,
            "message": f"Created #{child_number} as sub-issue of #{issue_number}",
        }

    elif action == "add_sub_issue":
        if not issue_number or not child_issue_number:
            return {
                "error": "issue_number (parent) and child_issue_number required for 'add_sub_issue' action"
            }
        return await github_graphql.add_sub_issue(
            parent_issue_number=issue_number, child_issue_number=child_issue_number
        )

    elif action == "remove_sub_issue":
        if not issue_number or not child_issue_number:
            return {
                "error": "issue_number (parent) and child_issue_number required for 'remove_sub_issue' action"
            }
        return await github_graphql.remove_sub_issue(
            parent_issue_number=issue_number, child_issue_number=child_issue_number
        )

    else:
        return {
            "error": f"Unknown action: {action}. Valid: get, search, create, close, comment, edit_comment, delete_comment, edit, label, assign, subscribe, get_sub_issues, get_parent, etc."
        }


async def tool_github_project(
    action: str,
    project_number: int = None,
    issue_number: int = None,
    status: str = None,
    field_name: str = None,
    field_value: str = None,
    limit: int = 50,
    _context: dict = None,
    **kwargs,
) -> dict:
    """
    Consolidated project tool - handles ALL GitHub Projects V2 operations.
    """
    # Extract admin status from context
    is_admin = False
    context_user_id = None
    context_user_name = None
    if _context:
        is_admin = _context.get("is_admin", False)
        context_user_id = _context.get("user_id")
        context_user_name = _context.get("user_name")

    action = action.lower()

    # ADMIN ACTIONS - require admin permission
    ADMIN_ACTIONS = {"add", "remove", "set_status", "set_field"}
    if action in ADMIN_ACTIONS:
        if not is_admin:
            # SECURITY: Log blocked admin action attempt
            logger.warning(
                f"SECURITY: Blocked project admin action '{action}' for non-admin user {context_user_name} (id={context_user_id})"
            )
            return {
                "error": f"The '{action}' action requires admin permissions. Ask a team member with admin access!"
            }
        else:
            logger.info(
                f"Project admin action '{action}' authorized for {context_user_name} (id={context_user_id})"
            )

    # LIST ALL PROJECTS (no project_number required)
    if action == "list":
        return await github_graphql.list_projects(limit=limit)

    # All other actions require project_number
    if not project_number:
        return {
            "error": f"project_number required for '{action}' action. Use action='list' to see all projects."
        }

    # READ ACTIONS
    if action == "view":
        result = await github_graphql.get_project_view(project_number)
        if result.get("error"):
            return {
                "error": result["error"],
                "not_found": True,
                "hint": "Project doesn't exist. Use action='list' to see available projects.",
            }
        return result

    elif action == "list_items":
        result = await github_graphql.list_project_items(
            project_number=project_number, status=status, limit=limit
        )
        if result.get("error"):
            return {
                "error": result["error"],
                "not_found": True,
                "hint": "Project doesn't exist or you don't have access. Don't try other tools - just tell the user.",
            }
        return result

    elif action == "get_item":
        if not issue_number:
            return {"error": "issue_number required for 'get_item' action"}
        return await github_graphql.get_project_item(
            project_number=project_number, issue_number=issue_number
        )

    # WRITE ACTIONS (admin only)
    elif action == "add":
        if not issue_number:
            return {"error": "issue_number (or PR number) required for 'add' action"}
        # Use the new add_to_project that works for both issues AND PRs
        return await github_graphql.add_to_project(
            number=issue_number, project_number=project_number
        )

    elif action == "remove":
        if not issue_number:
            return {"error": "issue_number required for 'remove' action"}
        return await github_graphql.remove_from_project(
            project_number=project_number, issue_number=issue_number
        )

    elif action == "set_status":
        if not issue_number or not status:
            return {"error": "issue_number and status required for 'set_status' action"}
        return await github_graphql.set_project_item_status(
            project_number=project_number, issue_number=issue_number, status=status
        )

    elif action == "set_field":
        if not issue_number or not field_name or not field_value:
            return {
                "error": "issue_number, field_name, and field_value required for 'set_field' action"
            }
        return await github_graphql.set_project_item_field(
            project_number=project_number,
            issue_number=issue_number,
            field_name=field_name,
            field_value=field_value,
        )

    else:
        return {
            "error": f"Unknown action: {action}. Valid: list, view, list_items, get_item, add, remove, set_status, set_field"
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
    """
    Fully dynamic GitHub data fetching - AI has FULL read-only control!

    3 modes:
    1. request: Natural language description (legacy, keyword matching)
    2. graphql_query: Raw GraphQL query - AI writes the query directly
    3. rest_endpoint: REST API path (e.g., 'issues/123/timeline')

    AI can use web_search/web_scrape first to find query structure from GitHub docs.
    """
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
    """
    Combined overview query - gets issues, labels, milestones, projects in ONE call.
    Much faster than making separate calls!
    """
    return await github_graphql.get_repo_overview(
        issues_limit=min(issues_limit, 50), include_projects=include_projects
    )


# Singleton instance
github_manager = GitHubManager()

# Import PR handler
from .github_pr import tool_github_pr

# Import subscription manager
from .subscriptions import subscription_manager


# =============================================================================
# SUBSCRIPTION TOOL HANDLERS
# =============================================================================


async def tool_subscribe_issue(
    issue_number: int,
    user_id: int,
    channel_id: int,
    guild_id: int = None,
) -> dict:
    """Subscribe a user to issue notifications."""
    # Verify issue exists first - reject subscription to non-existent issues
    issue = await github_graphql.get_issue_full(issue_number)
    if not issue or "error" in issue:
        return {
            "success": False,
            "message": f"Issue #{issue_number} does not exist.",
        }

    initial_state = {
        "state": issue.get("state", "open"),
        "comments_count": issue.get("comments_count", 0),
        "labels": issue.get("labels", []),
    }

    success = await subscription_manager.subscribe(
        user_id=user_id,
        issue_number=issue_number,
        channel_id=channel_id,
        guild_id=guild_id,
        initial_state=initial_state,
    )

    if success:
        return {
            "success": True,
            "message": f"✅ Subscribed to **#{issue_number}**: {issue.get('title', 'Unknown')}\n\nYou'll get DM notifications when there are updates!",
        }
    return {
        "success": False,
        "message": f"❌ Failed to subscribe to #{issue_number}. Please try again.",
    }


async def tool_unsubscribe_issue(
    issue_number: int,
    user_id: int,
) -> dict:
    """Unsubscribe a user from issue notifications."""
    was_subscribed = await subscription_manager.unsubscribe(
        user_id=user_id,
        issue_number=issue_number,
    )

    if was_subscribed:
        return {
            "success": True,
            "message": f"✅ Unsubscribed from **#{issue_number}**",
        }
    return {
        "success": False,
        "message": f"You weren't subscribed to #{issue_number}",
    }


async def tool_unsubscribe_all(user_id: int) -> dict:
    """Unsubscribe a user from all issue notifications."""
    count = await subscription_manager.unsubscribe_all(user_id=user_id)

    if count > 0:
        return {
            "success": True,
            "message": f"✅ Unsubscribed from **{count}** issue(s)",
        }
    return {
        "success": True,
        "message": "You didn't have any active subscriptions",
    }


async def tool_list_subscriptions(user_id: int) -> dict:
    """List all subscriptions for a user."""
    subs = await subscription_manager.get_user_subscriptions(user_id=user_id)

    if not subs:
        return {
            "success": True,
            "message": "📭 You don't have any active subscriptions.\n\nUse `subscribe #123` to subscribe to an issue!",
        }

    lines = ["📬 **Your Subscriptions:**\n"]
    for sub in subs:
        issue_num = sub["issue_number"]
        state = sub.get("last_state", "open")
        emoji = "🟢" if state == "open" else "🔴"
        lines.append(f"{emoji} **#{issue_num}** ({state})")

    lines.append(f"\n*{len(subs)} subscription(s) total*")
    return {
        "success": True,
        "message": "\n".join(lines),
    }


# Export consolidated tool handlers
TOOL_HANDLERS = {
    "github_issue": tool_github_issue,
    "github_project": tool_github_project,
    "github_custom": tool_github_custom,
    "github_overview": tool_github_overview,
    "github_pr": tool_github_pr,
    # Subscription handlers
    "subscribe_issue": tool_subscribe_issue,
    "unsubscribe_issue": tool_unsubscribe_issue,
    "unsubscribe_all": tool_unsubscribe_all,
    "list_subscriptions": tool_list_subscriptions,
}
