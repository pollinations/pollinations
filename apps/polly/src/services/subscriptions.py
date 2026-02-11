"""Subscription system for GitHub issue notifications.

Allows users to subscribe to issues and get notified via DM (or fallback to channel)
when there are updates (new comments, state changes, label changes, etc).

Smart polling to avoid GitHub API limits:
- Batches all subscribed issues into one GraphQL query
- Only polls when there are active subscriptions
- Tracks last seen state to detect changes

Uses aiosqlite for non-blocking database operations.
"""

import asyncio
import json
import logging
import aiosqlite
from datetime import datetime
from pathlib import Path
from typing import Optional

import discord

from ..config import config

logger = logging.getLogger(__name__)

# Database path
DB_PATH = Path(__file__).parent.parent.parent / "data" / "subscriptions.db"


class SubscriptionManager:
    """Manages issue subscriptions with async SQLite storage."""

    def __init__(self):
        self._db_path = DB_PATH
        self._db: Optional[aiosqlite.Connection] = None
        self._initialized = False

    async def initialize(self):
        """Initialize database connection and create tables."""
        if self._initialized:
            return

        self._db_path.parent.mkdir(parents=True, exist_ok=True)

        self._db = await aiosqlite.connect(self._db_path)

        # Enable WAL mode for faster concurrent reads/writes
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA synchronous=NORMAL")
        await self._db.execute("PRAGMA cache_size=10000")

        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                issue_number INTEGER NOT NULL,
                channel_id INTEGER NOT NULL,
                guild_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_notified_at TEXT,
                last_state TEXT,
                last_comment_count INTEGER DEFAULT 0,
                last_labels TEXT,
                UNIQUE(user_id, issue_number)
            )
        """)
        await self._db.execute("""
            CREATE INDEX IF NOT EXISTS idx_issue_number ON subscriptions(issue_number)
        """)
        await self._db.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_id ON subscriptions(user_id)
        """)
        await self._db.commit()
        self._initialized = True
        logger.info("SubscriptionManager initialized with async SQLite")

    async def close(self):
        """Close database connection."""
        if self._db:
            await self._db.close()
            self._db = None
            self._initialized = False

    async def _ensure_initialized(self):
        """Ensure database is initialized."""
        if not self._initialized:
            await self.initialize()

    async def subscribe(
        self,
        user_id: int,
        issue_number: int,
        channel_id: int,
        guild_id: Optional[int] = None,
        initial_state: Optional[dict] = None
    ) -> bool:
        """
        Subscribe a user to an issue.

        Returns True if new subscription, False if already subscribed.
        """
        await self._ensure_initialized()
        try:
            state = initial_state.get("state", "open") if initial_state else "open"
            comment_count = initial_state.get("comments_count", 0) if initial_state else 0
            labels = json.dumps(initial_state.get("labels", [])) if initial_state else "[]"

            await self._db.execute("""
                INSERT OR REPLACE INTO subscriptions
                (user_id, issue_number, channel_id, guild_id, last_state, last_comment_count, last_labels)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (user_id, issue_number, channel_id, guild_id, state, comment_count, labels))
            await self._db.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to subscribe: {e}")
            return False

    async def unsubscribe(self, user_id: int, issue_number: int) -> bool:
        """
        Unsubscribe a user from an issue.

        Returns True if was subscribed, False if wasn't.
        """
        await self._ensure_initialized()
        try:
            cursor = await self._db.execute("""
                DELETE FROM subscriptions WHERE user_id = ? AND issue_number = ?
            """, (user_id, issue_number))
            await self._db.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Failed to unsubscribe: {e}")
            return False

    async def unsubscribe_all(self, user_id: int) -> int:
        """
        Unsubscribe a user from all issues.

        Returns number of subscriptions removed.
        """
        await self._ensure_initialized()
        try:
            cursor = await self._db.execute("""
                DELETE FROM subscriptions WHERE user_id = ?
            """, (user_id,))
            await self._db.commit()
            return cursor.rowcount
        except Exception as e:
            logger.error(f"Failed to unsubscribe all: {e}")
            return 0

    async def get_user_subscriptions(self, user_id: int) -> list[dict]:
        """Get all subscriptions for a user."""
        await self._ensure_initialized()
        try:
            self._db.row_factory = aiosqlite.Row
            cursor = await self._db.execute("""
                SELECT issue_number, channel_id, guild_id, created_at, last_state
                FROM subscriptions WHERE user_id = ?
                ORDER BY created_at DESC
            """, (user_id,))
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get subscriptions: {e}")
            return []

    async def get_all_subscribed_issues(self) -> list[int]:
        """Get all unique issue numbers with active subscriptions."""
        await self._ensure_initialized()
        try:
            cursor = await self._db.execute("""
                SELECT DISTINCT issue_number FROM subscriptions
            """)
            rows = await cursor.fetchall()
            return [row[0] for row in rows]
        except Exception as e:
            logger.error(f"Failed to get subscribed issues: {e}")
            return []

    async def get_subscriptions_for_issue(self, issue_number: int) -> list[dict]:
        """Get all subscriptions for a specific issue."""
        await self._ensure_initialized()
        try:
            self._db.row_factory = aiosqlite.Row
            cursor = await self._db.execute("""
                SELECT user_id, channel_id, guild_id, last_state, last_comment_count, last_labels
                FROM subscriptions WHERE issue_number = ?
            """, (issue_number,))
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Failed to get issue subscriptions: {e}")
            return []

    async def update_issue_state(
        self,
        issue_number: int,
        state: str,
        comment_count: int,
        labels: list[str]
    ):
        """Update the tracked state for all subscriptions of an issue."""
        await self._ensure_initialized()
        try:
            await self._db.execute("""
                UPDATE subscriptions
                SET last_state = ?, last_comment_count = ?, last_labels = ?, last_notified_at = ?
                WHERE issue_number = ?
            """, (state, comment_count, json.dumps(labels), datetime.utcnow().isoformat(), issue_number))
            await self._db.commit()
        except Exception as e:
            logger.error(f"Failed to update issue state: {e}")

    async def get_subscription_count(self) -> int:
        """Get total number of active subscriptions."""
        await self._ensure_initialized()
        try:
            cursor = await self._db.execute("SELECT COUNT(*) FROM subscriptions")
            row = await cursor.fetchone()
            return row[0]
        except Exception as e:
            logger.error(f"Failed to get subscription count: {e}")
            return 0

    async def is_subscribed(self, user_id: int, issue_number: int) -> bool:
        """Check if a user is subscribed to an issue."""
        await self._ensure_initialized()
        try:
            cursor = await self._db.execute("""
                SELECT 1 FROM subscriptions WHERE user_id = ? AND issue_number = ?
            """, (user_id, issue_number))
            row = await cursor.fetchone()
            return row is not None
        except Exception as e:
            logger.error(f"Failed to check subscription: {e}")
            return False


class IssueNotifier:
    """Background task that polls for issue updates and notifies subscribers."""

    def __init__(self, bot: discord.Client, subscription_manager: SubscriptionManager):
        self.bot = bot
        self.subscriptions = subscription_manager
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the background polling task."""
        if self._running:
            return
        # Initialize the subscription manager
        await self.subscriptions.initialize()
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Issue notifier started")

    async def stop(self):
        """Stop the background polling task."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        # Close the subscription manager
        await self.subscriptions.close()
        logger.info("Issue notifier stopped")

    async def _poll_loop(self):
        """Main polling loop - checks for updates every 2 minutes."""
        # Import here to avoid circular imports
        from .github_graphql import github_graphql

        while self._running:
            try:
                # Get all issues we need to check
                issue_numbers = await self.subscriptions.get_all_subscribed_issues()

                if not issue_numbers:
                    # No subscriptions, sleep longer
                    await asyncio.sleep(60)
                    continue

                logger.debug(f"Checking {len(issue_numbers)} subscribed issues")

                # Batch fetch all issues in ONE GraphQL query (saves API calls!)
                # Returns dict {issue_number: issue_data} or {"error": "..."}
                issues_dict = await github_graphql.get_issues_batch(issue_numbers)

                # Skip if error returned (could be non-existent issue)
                if isinstance(issues_dict, dict) and "error" in issues_dict:
                    error_msg = issues_dict['error']
                    logger.warning(f"Failed to fetch issues: {error_msg}")

                    # If specific issue doesn't exist, try to identify and remove it
                    if "Could not resolve to an Issue" in error_msg:
                        # Try fetching issues one by one to find the bad one
                        for issue_num in issue_numbers:
                            single_result = await github_graphql.get_issues_batch([issue_num])
                            if isinstance(single_result, dict) and "error" in single_result:
                                logger.warning(f"Issue #{issue_num} doesn't exist - removing all subscriptions")
                                # Get all subscribers and unsubscribe them
                                subs = await self.subscriptions.get_subscriptions_for_issue(issue_num)
                                for sub in subs:
                                    await self.subscriptions.unsubscribe(sub['user_id'], issue_num)
                                logger.info(f"Removed {len(subs)} subscriptions for non-existent issue #{issue_num}")

                    await asyncio.sleep(60)
                    continue

                # Check each issue for changes
                for issue_number, issue in issues_dict.items():
                    await self._check_issue_for_changes(issue)

                # Poll every 2 minutes (30 req/hour per subscribed issue set)
                # With 5000 req/hour limit, we're very safe
                await asyncio.sleep(120)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in poll loop: {e}")
                await asyncio.sleep(60)  # Back off on errors

    async def _check_issue_for_changes(self, issue: dict):
        """Check if an issue has changes and notify subscribers."""
        from .github_graphql import github_graphql

        issue_number = issue["number"]
        subscriptions = await self.subscriptions.get_subscriptions_for_issue(issue_number)

        if not subscriptions:
            return

        current_state = issue["state"]
        current_comments = issue.get("comments_count", 0)
        current_labels = issue.get("labels", [])

        # Track if we need to fetch detailed info
        needs_comments = False
        max_new_comments = 0

        for sub in subscriptions:
            last_comments = sub.get("last_comment_count", 0)
            if current_comments > last_comments:
                needs_comments = True
                max_new_comments = max(max_new_comments, current_comments - last_comments)

        # Fetch full issue with comments if there are new ones
        new_comments_data = []
        if needs_comments:
            full_issue = await github_graphql.get_issue_full(
                issue_number=issue_number,
                comments_count=min(max_new_comments + 1, 5)  # Fetch recent comments
            )
            if full_issue and "comments" in full_issue:
                new_comments_data = full_issue["comments"]

        for sub in subscriptions:
            # Build structured changes list for AI formatting
            changes = []

            # Check for state change
            if sub["last_state"] != current_state:
                if current_state == "closed":
                    changes.append({"type": "closed", "data": {}})
                else:
                    changes.append({"type": "reopened", "data": {}})

            # Check for new comments - include actual content for AI to summarize
            last_comments = sub.get("last_comment_count", 0)
            if current_comments > last_comments:
                new_count = current_comments - last_comments
                # Get the new comments (last N based on how many are new)
                recent_comments = new_comments_data[-new_count:] if new_comments_data else []

                for comment in recent_comments:
                    author = comment.get("author", "someone")
                    body = comment.get("body", "")
                    changes.append({
                        "type": "comment",
                        "data": {"author": author, "body": body}
                    })

                # Fallback if we couldn't get comment details
                if not recent_comments:
                    changes.append({
                        "type": "comment",
                        "data": {"author": "unknown", "body": f"({new_count} new comment{'s' if new_count > 1 else ''})"}
                    })

            # Check for label changes
            last_labels = json.loads(sub.get("last_labels", "[]"))
            if set(current_labels) != set(last_labels):
                added = set(current_labels) - set(last_labels)
                removed = set(last_labels) - set(current_labels)
                if added:
                    changes.append({"type": "labels_added", "data": {"labels": list(added)}})
                if removed:
                    changes.append({"type": "labels_removed", "data": {"labels": list(removed)}})

            # Send notification if there are changes
            if changes:
                await self._send_notification(
                    user_id=sub["user_id"],
                    channel_id=sub["channel_id"],
                    guild_id=sub.get("guild_id"),
                    issue=issue,
                    changes=changes
                )

        # Update stored state for all subscribers
        if subscriptions:
            await self.subscriptions.update_issue_state(
                issue_number=issue_number,
                state=current_state,
                comment_count=current_comments,
                labels=current_labels
            )

    async def _send_notification(
        self,
        user_id: int,
        channel_id: int,
        guild_id: Optional[int],
        issue: dict,
        changes: list[dict]
    ):
        """Send notification to user (DM first, fallback to channel)."""
        from .pollinations import pollinations_client

        issue_number = issue["number"]
        issue_url = issue.get("url", f"https://github.com/{config.github_repo}/issues/{issue_number}")

        # Use AI to format a beautiful notification
        message = await pollinations_client.format_notification(
            issue=issue,
            changes=changes,
            issue_url=issue_url
        )

        # Try DM first
        try:
            user = await self.bot.fetch_user(user_id)
            if user:
                await user.send(message)
                logger.debug(f"Sent DM notification to {user_id} for issue #{issue_number}")
                return
        except discord.Forbidden:
            logger.debug(f"Can't DM user {user_id}, falling back to channel")
        except discord.HTTPException as e:
            logger.warning(f"Failed to DM user {user_id}: {e}")
        except Exception as e:
            logger.warning(f"Error sending DM to {user_id}: {e}")

        # Fallback to channel
        try:
            channel = self.bot.get_channel(channel_id)
            if not channel:
                channel = await self.bot.fetch_channel(channel_id)

            if channel:
                # Mention the user in the channel
                await channel.send(f"<@{user_id}> {message}")
                logger.debug(f"Sent channel notification for issue #{issue_number}")
        except discord.Forbidden:
            logger.warning(f"No permission to send to channel {channel_id}")
        except discord.NotFound:
            logger.warning(f"Channel {channel_id} not found, removing subscription")
            # Channel was deleted, clean up subscription
            await self.subscriptions.unsubscribe(user_id, issue_number)
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")


# Singleton instances
subscription_manager = SubscriptionManager()
issue_notifier: Optional[IssueNotifier] = None


def init_notifier(bot: discord.Client):
    """Initialize the notifier with the bot instance."""
    global issue_notifier
    issue_notifier = IssueNotifier(bot, subscription_manager)
    return issue_notifier
