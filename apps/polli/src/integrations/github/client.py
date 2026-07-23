import asyncio
import logging

import aiohttp

from ...utils.url import quote
from ...core.config import config
from . import auth as github_auth
from .graphql import github_graphql

logger = logging.getLogger(__name__)


class GitHubManager:
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None
        self._connector: aiohttp.TCPConnector | None = None

    @property
    def repo(self) -> str:
        """Get the configured repository."""
        return config.bot.default_repo

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

    async def _get_token(self) -> str | None:
        """Get GitHub token (from App or PAT)."""
        if github_auth.github_app_auth:
            token = await github_auth.github_app_auth.get_token()
            if token:
                return token
        # Fallback to PAT
        return config.github.token if config.github.token else None

    def _has_auth(self) -> bool:
        """Check if any auth method is available (sync check)."""
        has_app = github_auth.github_app_auth is not None
        has_pat = bool(config.github.token)
        logger.debug(f"_has_auth check: app={has_app}, pat={has_pat}")
        return has_app or has_pat

    async def _get_headers(self) -> dict | None:
        """Get standard GitHub API headers."""
        token = await self._get_token()
        if not token:
            return None
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def search_issues(
        self,
        keywords: str,
        state: str = "open",
        author: str | None = None,
        labels: list[str] | None = None,
        limit: int = 10,
    ) -> list[dict]:

        if not self._has_auth():
            return []

        # Build query parts
        query_parts = [f"repo:{config.bot.default_repo}", "is:issue"]

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
        discord_username: str | None = None,
        state: str = "open",
        limit: int = 10,
    ) -> list[dict]:

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

    async def get_issue(self, issue_number: int) -> dict | None:
        """
        Get full details of a single issue.

        Args:
            issue_number: The issue number

        Returns:
            Issue dict with full details, or None if not found
        """
        if not self._has_auth():
            return None

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}"

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

        if not self._has_auth():
            return []

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}/comments?per_page={limit}"

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
                            "body": (c["body"][:500] + "..." if len(c["body"]) > 500 else c["body"]),
                            "created_at": c["created_at"][:10],
                        }
                        for c in data
                    ]
        except Exception as e:
            logger.warning(f"Get comments failed: {e}")

        return []

    async def create_issue(
        self,
        title: str,
        description: str,
        reporter: str,
        participants: list[str] | None = None,
        image_urls: list[str] | None = None,
        user_role_ids: list[int] | None = None,
        reporter_id: int | None = None,
        message_url: str | None = None,
    ) -> dict:

        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        if not config.bot.default_repo:
            return {"success": False, "error": "GitHub repository not configured"}

        body = self._build_issue_body(
            description=description,
            reporter=reporter,
            participants=participants,
            image_urls=image_urls,
            reporter_id=reporter_id,
            message_url=message_url,
        )

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues"

        # No labels - external workflows handle labeling
        payload = {"title": title, "body": body}

        try:
            session = await self.get_session()
            async with session.post(
                url,
                json=payload,
                headers=await self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=config.ai.request_timeout_seconds),
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
                    logger.error(f"GitHub API error: {response.status} - {error_text[:200]}")
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

        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}/comments"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
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
                    logger.error(f"Error adding comment: {response.status} - {error_text[:200]}")
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error adding comment: {e}")
            return {"success": False, "error": str(e)}

    async def _get_comment(self, comment_id: int) -> dict | None:
        """Fetch a comment by ID to verify ownership."""
        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/comments/{comment_id}"
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

        # Comments created via Discord have format: **From:** `username`
        # Check if the requester's name appears in the attribution
        if not comment_body or not requester:
            return False
        # Match the exact format used in add_comment()
        return f"**From:** `{requester}`" in comment_body

    async def edit_comment(self, comment_id: int, new_body: str, requester: str = None) -> dict:

        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/comments/{comment_id}"

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
                    logger.error(f"Error editing comment: {response.status} - {error_text[:200]}")
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

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/comments/{comment_id}"

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
                    logger.error(f"Error deleting comment: {response.status} - {error_text[:200]}")
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error deleting comment: {e}")
            return {"success": False, "error": str(e)}

    async def close_issue(
        self,
        issue_number: int,
        reason: str = "completed",
        comment: str | None = None,
    ) -> dict:
        """Close an issue with optional comment."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error closing issue: {e}")
            return {"success": False, "error": str(e)}

    async def reopen_issue(self, issue_number: int, comment: str | None = None) -> dict:
        """Reopen a closed issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error reopening issue: {e}")
            return {"success": False, "error": str(e)}

    async def edit_issue(self, issue_number: int, title: str | None = None, body: str | None = None) -> dict:
        """Edit an issue's title and/or body."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        if not title and not body:
            return {
                "success": False,
                "error": "Nothing to update - provide title or body",
            }

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
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

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}/labels"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
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
            url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}/labels/{label}"
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
            results = await asyncio.gather(*[remove_single_label(label) for label in labels])

            removed = [r[0] for r in results if r[1]]
            errors = [f"{r[0]}: {r[2]}" for r in results if not r[1]]

            if removed:
                logger.info(f"Removed labels {removed} from issue #{issue_number}")

            return {
                "success": len(removed) > 0,
                "issue_number": issue_number,
                "labels_removed": removed,
                "errors": errors if errors else None,
                "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
            }
        except Exception as e:
            logger.error(f"Error removing labels: {e}")
            return {"success": False, "error": str(e)}

    async def assign_issue(self, issue_number: int, assignees: list[str]) -> dict:
        """Assign users to an issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}/assignees"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
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

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}/assignees"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error unassigning issue: {e}")
            return {"success": False, "error": str(e)}

    async def link_issues(self, issue_number: int, related_issues: list[int], relationship: str) -> dict:
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

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}"

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
                        "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
                    }
                else:
                    return {
                        "success": False,
                        "error": f"GitHub API error: {response.status}",
                    }
        except Exception as e:
            logger.error(f"Error setting milestone: {e}")
            return {"success": False, "error": str(e)}

    async def _get_milestone_number(self, milestone_name: str) -> int | None:
        """Get milestone number from name."""
        url = f"https://api.github.com/repos/{config.bot.default_repo}/milestones"

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
        from .graphql import github_graphql

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
        from .graphql import github_graphql

        try:
            result = await github_graphql._fetch_milestones(state=state)
            if result.get("error"):
                logger.error(f"Error fetching milestones: {result['error']}")
                return []
            return result.get("items", [])
        except Exception as e:
            logger.error(f"Error fetching milestones: {e}")
            return []

    async def lock_issue(self, issue_number: int, lock: bool, reason: str | None = None) -> dict:
        """Lock or unlock an issue."""
        if not self._has_auth():
            return {"success": False, "error": "GitHub token not configured"}

        url = f"https://api.github.com/repos/{config.bot.default_repo}/issues/{issue_number}/lock"

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
                            "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
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
                            "issue_url": f"https://github.com/{config.bot.default_repo}/issues/{issue_number}",
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

    async def _get_latest_issue_number(self) -> int | None:
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
        participants: list[str] | None = None,
        image_urls: list[str] | None = None,
        reporter_id: int | None = None,
        message_url: str | None = None,
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


# Singleton instance
github_manager = GitHubManager()
