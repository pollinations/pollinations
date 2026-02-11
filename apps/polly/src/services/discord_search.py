"""
Discord Search Service - Full guild search capabilities via HTTP API.

Provides unrestricted search access to:
- Messages (via preview API)
- Members (by name, nickname, role)
- Channels (text, voice, forum, categories)
- Threads (active and archived)
- Roles (find roles, list members with role)
"""

import aiohttp
import logging
import re
from typing import Optional, List, Dict, Any, Tuple, Union
from datetime import datetime, timezone
import discord

from ..config import config

logger = logging.getLogger(__name__)


# =============================================================================
# MENTION PARSER - Extract IDs from Discord mention formats
# =============================================================================


def parse_discord_mentions(text: str) -> Dict[str, List[int]]:
    """
    Parse Discord mention formats and extract IDs.

    Formats:
        <@123456789> or <@!123456789> - User mention
        <#123456789> - Channel mention
        <@&123456789> - Role mention

    Returns:
        Dict with 'user_ids', 'channel_ids', 'role_ids' lists
    """
    result = {
        "user_ids": [],
        "channel_ids": [],
        "role_ids": [],
    }

    # User mentions: <@123> or <@!123> (! is for nicknames)
    user_pattern = r"<@!?(\d+)>"
    for match in re.finditer(user_pattern, text):
        user_id = int(match.group(1))
        if user_id not in result["user_ids"]:
            result["user_ids"].append(user_id)

    # Channel mentions: <#123>
    channel_pattern = r"<#(\d+)>"
    for match in re.finditer(channel_pattern, text):
        channel_id = int(match.group(1))
        if channel_id not in result["channel_ids"]:
            result["channel_ids"].append(channel_id)

    # Role mentions: <@&123>
    role_pattern = r"<@&(\d+)>"
    for match in re.finditer(role_pattern, text):
        role_id = int(match.group(1))
        if role_id not in result["role_ids"]:
            result["role_ids"].append(role_id)

    return result


# Discord API base URL
DISCORD_API_BASE = "https://discord.com/api/v10"


class DiscordSearchClient:
    """HTTP client for Discord search API."""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def headers(self) -> dict:
        """Get authorization headers."""
        return {
            "Authorization": f"Bot {config.discord_token}",
            "Content-Type": "application/json",
        }

    async def get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        """Close the session."""
        if self._session and not self._session.closed:
            await self._session.close()

    # =========================================================================
    # MESSAGE SEARCH (Preview API - officially opened to bots Aug 2025)
    # =========================================================================

    async def search_messages(
        self,
        guild_id: int,
        query: str,
        channel_id: Optional[int] = None,
        author_id: Optional[int] = None,
        author_type: Optional[str] = None,  # user, bot, webhook, -bot (exclude bots)
        mentions: Optional[int] = None,
        mention_everyone: Optional[bool] = None,
        has: Optional[str] = None,  # link, embed, file, video, image, sound, sticker, poll
        pinned: Optional[bool] = None,
        before: Optional[str] = None,  # snowflake or date
        after: Optional[str] = None,  # snowflake or date
        sort_by: str = "timestamp",  # timestamp or relevance
        sort_order: str = "desc",  # desc (newest) or asc (oldest)
        link_hostname: Optional[str] = None,  # filter by URL domain
        attachment_extension: Optional[str] = None,  # filter by file type (pdf, txt, etc)
        limit: int = 25,
        offset: int = 0,
        accessible_channel_ids: Optional[set] = None,  # SECURITY: Filter to user's accessible channels
    ) -> Dict[str, Any]:
        """
        Search messages in a guild using Discord's search API.

        Args:
            guild_id: The guild to search in
            query: Search query text (max 1024 chars)
            channel_id: Filter to specific channel
            author_id: Filter by message author
            author_type: Filter by author type (user, bot, webhook, -bot to exclude bots)
            mentions: Filter messages mentioning this user ID
            mention_everyone: Filter messages with @everyone
            has: Filter by content type (link, embed, file, video, image, sound, sticker, poll)
            pinned: Filter pinned messages only
            before: Messages before this date/snowflake (max_id)
            after: Messages after this date/snowflake (min_id)
            sort_by: Sort by 'timestamp' (default) or 'relevance'
            sort_order: 'desc' (newest first, default) or 'asc' (oldest first)
            link_hostname: Filter by URL hostname (e.g., 'github.com')
            attachment_extension: Filter by file extension (e.g., 'pdf', 'txt')
            limit: Max results (1-25, default 25)
            offset: Pagination offset (max 9975)
            accessible_channel_ids: SECURITY - only return messages from these channels

        Returns:
            Search results with messages and metadata
        """
        import asyncio

        session = await self.get_session()

        # Build query params
        params = {"content": query[:1024]}  # Max 1024 chars

        if channel_id:
            params["channel_id"] = str(channel_id)
        if author_id:
            params["author_id"] = str(author_id)
        if author_type:
            params["author_type"] = author_type
        if mentions:
            params["mentions"] = str(mentions)
        if mention_everyone is not None:
            params["mention_everyone"] = str(mention_everyone).lower()
        if has:
            params["has"] = has
        if pinned is not None:
            params["pinned"] = str(pinned).lower()
        if before:
            params["max_id"] = before
        if after:
            params["min_id"] = after
        if sort_by:
            params["sort_by"] = sort_by
        if sort_order:
            params["sort_order"] = sort_order
        if link_hostname:
            params["link_hostname"] = link_hostname
        if attachment_extension:
            params["attachment_extension"] = attachment_extension
        if limit:
            params["limit"] = min(limit, 25)
        if offset:
            params["offset"] = min(offset, 9975)  # Max offset is 9975

        # Always include NSFW results (bot has access, user perms checked via accessible_channel_ids)
        params["include_nsfw"] = "true"

        url = f"{DISCORD_API_BASE}/guilds/{guild_id}/messages/search"

        # Retry logic for HTTP 202 (index not ready)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with session.get(url, headers=self.headers, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        messages = self._format_messages(data.get("messages", []))
                        total_results = data.get("total_results", len(messages))

                        # SECURITY: Filter messages to only channels user can access
                        if accessible_channel_ids is not None:
                            original_count = len(messages)
                            messages = [
                                m
                                for m in messages
                                if int(m.get("channel_id", 0)) in accessible_channel_ids
                            ]
                            filtered_count = original_count - len(messages)
                            if filtered_count > 0:
                                logger.info(
                                    f"SECURITY: Filtered {filtered_count} messages from private channels"
                                )

                        return {
                            "success": True,
                            "total_results": total_results,
                            "returned": len(messages),
                            "offset": offset,
                            "messages": messages,
                        }
                    elif resp.status == 202:
                        # Index not ready - retry after delay
                        retry_after = 2
                        try:
                            data = await resp.json()
                            retry_after = data.get("retry_after", 2)
                        except:
                            pass
                        if attempt < max_retries - 1:
                            logger.info(f"Search index not ready, retrying in {retry_after}s...")
                            await asyncio.sleep(retry_after)
                            continue
                        return {"error": "Search index not ready. Try again in a few seconds."}
                    elif resp.status == 403:
                        return {
                            "error": "Bot doesn't have permission to search messages in this guild"
                        }
                    elif resp.status == 429:
                        retry_after = resp.headers.get("Retry-After", "unknown")
                        return {"error": f"Rate limited. Retry after {retry_after} seconds"}
                    else:
                        text = await resp.text()
                        logger.error(f"Message search failed: {resp.status} - {text}")
                        return {"error": f"Search failed: {resp.status}"}
            except Exception as e:
                logger.error(f"Message search error: {e}")
                return {"error": str(e)}

        return {"error": "Search failed after retries"}

    def _format_messages(self, messages: List[List[Dict]]) -> List[Dict]:
        """Format message results for readability."""
        formatted = []
        for msg_group in messages:
            for msg in msg_group:
                formatted.append(
                    {
                        "id": msg.get("id"),
                        "content": msg.get("content", ""),
                        "author": msg.get("author", {}).get("username", "Unknown"),
                        "author_id": msg.get("author", {}).get("id"),
                        "channel_id": msg.get("channel_id"),
                        "timestamp": msg.get("timestamp"),
                        "attachments": len(msg.get("attachments", [])),
                        "embeds": len(msg.get("embeds", [])),
                        "jump_url": f"https://discord.com/channels/{msg.get('guild_id', '@me')}/{msg.get('channel_id')}/{msg.get('id')}",
                    }
                )
        return formatted

    # =========================================================================
    # MEMBER SEARCH
    # =========================================================================

    async def search_members(
        self,
        guild: discord.Guild,
        query: Optional[str] = None,
        user_id: Optional[int] = None,
        role_id: Optional[int] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        Search members in a guild.

        Args:
            guild: The Discord guild object
            query: Search by name/nickname (partial match)
            user_id: Look up specific member by ID
            role_id: Filter by role
            limit: Max results

        Returns:
            List of matching members
        """
        try:
            members = []

            if user_id:
                # Direct lookup by user ID
                member = guild.get_member(user_id)
                if not member:
                    # Try fetching from API if not in cache
                    try:
                        member = await guild.fetch_member(user_id)
                    except discord.NotFound:
                        return {
                            "success": True,
                            "count": 0,
                            "members": [],
                            "note": f"User {user_id} not found in this server",
                        }
                members = [member]
            elif query:
                # Use guild.query_members for name search
                found = await guild.query_members(query=query, limit=limit)
                members = found
            elif role_id:
                # Get role and its members
                role = guild.get_role(role_id)
                if role:
                    members = role.members[:limit]
                else:
                    return {"error": f"Role {role_id} not found"}
            else:
                # Return first N members
                members = list(guild.members)[:limit]

            formatted = []
            for m in members:
                formatted.append(
                    {
                        "id": str(m.id),
                        "username": m.name,
                        "display_name": m.display_name,
                        "nickname": m.nick,
                        "roles": [r.name for r in m.roles if r.name != "@everyone"],
                        "joined_at": m.joined_at.isoformat() if m.joined_at else None,
                        "is_bot": m.bot,
                    }
                )

            return {
                "success": True,
                "count": len(formatted),
                "members": formatted,
            }
        except Exception as e:
            logger.error(f"Member search error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # CHANNEL SEARCH
    # =========================================================================

    async def search_channels(
        self,
        guild: discord.Guild,
        query: Optional[str] = None,
        channel_type: Optional[str] = None,  # text, voice, forum, category, thread
        limit: int = 50,
        can_view_channel: callable = None,  # SECURITY: Filter by user permissions
    ) -> Dict[str, Any]:
        """
        Search channels in a guild.

        Args:
            guild: The Discord guild object
            query: Search by channel name (partial match)
            channel_type: Filter by type (text, voice, forum, category, thread)
            limit: Max results
            can_view_channel: SECURITY - function to check if user can view channel

        Returns:
            List of matching channels
        """
        try:
            type_map = {
                "text": discord.ChannelType.text,
                "voice": discord.ChannelType.voice,
                "forum": discord.ChannelType.forum,
                "category": discord.ChannelType.category,
                "news": discord.ChannelType.news,
                "stage": discord.ChannelType.stage_voice,
            }

            channels = list(guild.channels)

            # SECURITY: Filter to only channels user can view
            if can_view_channel:
                channels = [c for c in channels if can_view_channel(c)]

            # Filter by type
            if channel_type and channel_type.lower() in type_map:
                target_type = type_map[channel_type.lower()]
                channels = [c for c in channels if c.type == target_type]

            # Filter by query
            if query:
                query_lower = query.lower()
                channels = [c for c in channels if query_lower in c.name.lower()]

            # Limit results
            channels = channels[:limit]

            formatted = []
            for c in channels:
                formatted.append(
                    {
                        "id": str(c.id),
                        "name": c.name,
                        "type": str(c.type).split(".")[-1],
                        "category": c.category.name if c.category else None,
                        "position": c.position,
                        "mention": c.mention,
                    }
                )

            return {
                "success": True,
                "count": len(formatted),
                "channels": formatted,
            }
        except Exception as e:
            logger.error(f"Channel search error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # THREAD SEARCH
    # =========================================================================

    async def search_threads(
        self,
        guild: discord.Guild,
        query: Optional[str] = None,
        include_archived: bool = True,
        limit: int = 50,
        can_view_channel: callable = None,  # SECURITY: Filter by user permissions
    ) -> Dict[str, Any]:
        """
        Search threads in a guild.

        Args:
            guild: The Discord guild object
            query: Search by thread name (partial match)
            include_archived: Include archived threads
            limit: Max results
            can_view_channel: SECURITY - function to check if user can view channel

        Returns:
            List of matching threads
        """
        try:
            threads = []

            # Get active threads (only from accessible channels)
            active_threads = guild.threads
            for t in active_threads:
                # SECURITY: Only include threads from channels user can access
                if can_view_channel and t.parent:
                    if not can_view_channel(t.parent):
                        continue
                threads.append(t)

            # Get archived threads from each text channel (only accessible ones)
            if include_archived:
                for channel in guild.text_channels:
                    # SECURITY: Skip channels user can't access
                    if can_view_channel and not can_view_channel(channel):
                        continue
                    try:
                        async for thread in channel.archived_threads(limit=50):
                            threads.append(thread)
                    except discord.Forbidden:
                        continue
                    except Exception:
                        continue

            # Filter by query
            if query:
                query_lower = query.lower()
                threads = [t for t in threads if query_lower in t.name.lower()]

            # Limit results
            threads = threads[:limit]

            formatted = []
            for t in threads:
                formatted.append(
                    {
                        "id": str(t.id),
                        "name": t.name,
                        "parent_channel": t.parent.name if t.parent else None,
                        "owner_id": str(t.owner_id) if t.owner_id else None,
                        "archived": t.archived,
                        "locked": t.locked,
                        "message_count": t.message_count,
                        "member_count": t.member_count,
                        "created_at": (
                            t.created_at.isoformat() if t.created_at else None
                        ),
                        "jump_url": t.jump_url,
                    }
                )

            return {
                "success": True,
                "count": len(formatted),
                "threads": formatted,
            }
        except Exception as e:
            logger.error(f"Thread search error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # ROLE SEARCH
    # =========================================================================

    async def search_roles(
        self,
        guild: discord.Guild,
        query: Optional[str] = None,
        include_members: bool = False,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """
        Search roles in a guild.

        Args:
            guild: The Discord guild object
            query: Search by role name (partial match)
            include_members: Include member list for each role
            limit: Max results

        Returns:
            List of matching roles
        """
        try:
            roles = list(guild.roles)

            # Filter by query
            if query:
                query_lower = query.lower()
                roles = [r for r in roles if query_lower in r.name.lower()]

            # Remove @everyone
            roles = [r for r in roles if r.name != "@everyone"]

            # Limit results
            roles = roles[:limit]

            formatted = []
            for r in roles:
                role_data = {
                    "id": str(r.id),
                    "name": r.name,
                    "color": str(r.color),
                    "position": r.position,
                    "mentionable": r.mentionable,
                    "member_count": len(r.members),
                    "mention": r.mention,
                }
                if include_members:
                    role_data["members"] = [
                        {"id": str(m.id), "name": m.display_name}
                        for m in r.members[:20]  # Limit members per role
                    ]
                formatted.append(role_data)

            return {
                "success": True,
                "count": len(formatted),
                "roles": formatted,
            }
        except Exception as e:
            logger.error(f"Role search error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # CHANNEL HISTORY - Recent messages without search query
    # =========================================================================

    async def get_channel_history(
        self,
        channel: discord.TextChannel,
        limit: int = 25,
        before: Optional[int] = None,
        after: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get recent messages from a channel.

        Args:
            channel: The Discord channel
            limit: Number of messages to fetch (default 25, max 100)
            before: Get messages before this message ID (for pagination)
            after: Get messages after this message ID

        Returns:
            Recent messages from the channel
        """
        try:
            limit = min(limit, 100)
            messages = []

            # Build fetch parameters
            kwargs = {"limit": limit}
            if before:
                kwargs["before"] = discord.Object(id=before)
            if after:
                kwargs["after"] = discord.Object(id=after)

            async for msg in channel.history(**kwargs):
                messages.append(
                    {
                        "id": str(msg.id),
                        "content": msg.content or "",
                        "author": msg.author.name,
                        "author_id": str(msg.author.id),
                        "timestamp": msg.created_at.isoformat(),
                        "attachments": len(msg.attachments),
                        "embeds": len(msg.embeds),
                        "jump_url": msg.jump_url,
                    }
                )

            return {
                "success": True,
                "channel": channel.name,
                "channel_id": str(channel.id),
                "count": len(messages),
                "messages": messages,
                "has_more": len(messages) == limit,
                "oldest_id": messages[-1]["id"] if messages else None,
            }
        except discord.Forbidden:
            return {"error": f"No permission to read channel #{channel.name}"}
        except Exception as e:
            logger.error(f"Channel history error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # MESSAGE CONTEXT - Messages around a specific message
    # =========================================================================

    async def get_message_context(
        self,
        channel: discord.TextChannel,
        message_id: int,
        before_count: int = 5,
        after_count: int = 5,
    ) -> Dict[str, Any]:
        """
        Get messages around a specific message for context.

        Args:
            channel: The Discord channel
            message_id: The target message ID
            before_count: Number of messages before (default 5)
            after_count: Number of messages after (default 5)

        Returns:
            The target message with surrounding context
        """
        try:
            # Fetch the target message
            try:
                target_msg = await channel.fetch_message(message_id)
            except discord.NotFound:
                return {"error": f"Message {message_id} not found"}

            # Fetch messages before
            before_msgs = []
            async for msg in channel.history(limit=before_count, before=target_msg):
                before_msgs.append(msg)
            before_msgs.reverse()  # Chronological order

            # Fetch messages after
            after_msgs = []
            async for msg in channel.history(
                limit=after_count, after=target_msg, oldest_first=True
            ):
                after_msgs.append(msg)

            def format_msg(msg):
                return {
                    "id": str(msg.id),
                    "content": msg.content or "",
                    "author": msg.author.name,
                    "author_id": str(msg.author.id),
                    "timestamp": msg.created_at.isoformat(),
                    "jump_url": msg.jump_url,
                }

            return {
                "success": True,
                "channel": channel.name,
                "before": [format_msg(m) for m in before_msgs],
                "target": format_msg(target_msg),
                "after": [format_msg(m) for m in after_msgs],
            }
        except discord.Forbidden:
            return {"error": f"No permission to read channel #{channel.name}"}
        except Exception as e:
            logger.error(f"Message context error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # THREAD HISTORY - Full thread with metadata and pagination
    # =========================================================================

    async def get_thread_history(
        self,
        thread: discord.Thread,
        limit: int = 50,
        before: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get thread messages with metadata summary.

        Args:
            thread: The Discord thread
            limit: Number of messages to fetch (default 50, max 100)
            before: Get messages before this message ID (for pagination)

        Returns:
            Thread metadata and recent messages
        """
        try:
            limit = min(limit, 100)
            messages = []

            # Build fetch parameters
            kwargs = {"limit": limit}
            if before:
                kwargs["before"] = discord.Object(id=before)

            # Collect unique participants
            participants = {}

            async for msg in thread.history(**kwargs):
                messages.append(
                    {
                        "id": str(msg.id),
                        "content": msg.content or "",
                        "author": msg.author.name,
                        "author_id": str(msg.author.id),
                        "timestamp": msg.created_at.isoformat(),
                        "attachments": len(msg.attachments),
                        "jump_url": msg.jump_url,
                    }
                )
                # Track participants
                if str(msg.author.id) not in participants:
                    participants[str(msg.author.id)] = msg.author.name

            return {
                "success": True,
                "thread_name": thread.name,
                "thread_id": str(thread.id),
                "parent_channel": thread.parent.name if thread.parent else None,
                "owner_id": str(thread.owner_id) if thread.owner_id else None,
                "created_at": (
                    thread.created_at.isoformat() if thread.created_at else None
                ),
                "archived": thread.archived,
                "locked": thread.locked,
                "total_messages": thread.message_count,
                "participants": list(participants.values()),
                "participant_count": len(participants),
                "showing": len(messages),
                "messages": messages,
                "has_more": len(messages) == limit,
                "oldest_id": messages[-1]["id"] if messages else None,
                "note": (
                    f"Showing {len(messages)} of ~{thread.message_count} messages. Use before={messages[-1]['id']} to get older messages."
                    if messages
                    and thread.message_count
                    and len(messages) < thread.message_count
                    else None
                ),
            }
        except discord.Forbidden:
            return {"error": f"No permission to read thread '{thread.name}'"}
        except Exception as e:
            logger.error(f"Thread history error: {e}")
            return {"error": str(e)}


# Singleton instance
discord_search_client = DiscordSearchClient()


# =============================================================================
# TOOL HANDLER
# =============================================================================


async def tool_discord_search(
    action: str,
    query: Optional[str] = None,
    channel_id: Optional[Union[int, str]] = None,  # Accept string for <#123> format
    channel_name: Optional[str] = None,
    user_id: Optional[Union[int, str]] = None,  # Accept string for <@123> format
    role_id: Optional[Union[int, str]] = None,  # Accept string for <@&123> format
    role_name: Optional[str] = None,
    channel_type: Optional[str] = None,
    message_id: Optional[Union[int, str]] = None,
    thread_id: Optional[Union[int, str]] = None,
    include_archived: bool = True,
    include_members: bool = False,
    has: Optional[str] = None,
    before: Optional[str] = None,
    after: Optional[str] = None,
    limit: int = 50,
    # New search parameters (Aug 2025 Discord API)
    sort_by: str = "timestamp",  # timestamp or relevance
    sort_order: str = "desc",  # desc (newest) or asc (oldest)
    author_type: Optional[str] = None,  # user, bot, webhook, -bot
    pinned: Optional[bool] = None,
    link_hostname: Optional[str] = None,  # filter by URL domain
    attachment_extension: Optional[str] = None,  # filter by file type
    offset: int = 0,  # pagination offset
    # Context injected by pollinations client
    _context: dict = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Search EVERYTHING in the Discord server.

    Actions:
        - messages: Search message content (query required)
        - members: Search members by name/nickname or role
        - channels: Search channels by name or type
        - threads: Search threads by name
        - roles: Search roles by name
        - history: Get recent messages from a channel (no query needed)
        - context: Get messages around a specific message_id
        - thread_history: Get messages from a thread with metadata

    Args:
        action: What to search (messages, members, channels, threads, roles, history, context, thread_history)
        query: Search term (required for messages). Mentions like <@123> are auto-parsed.
        channel_id: Filter messages to specific channel, or target for history (defaults to CURRENT channel if not specified)
        channel_name: Find channel by name (alternative to channel_id)
        user_id: Look up member by ID, or filter messages by author
        role_id: Filter members by role
        role_name: Find role by name (alternative to role_id)
        channel_type: Filter channels by type (text, voice, forum, category)
        message_id: Target message for context action
        thread_id: Target thread for thread_history action
        include_archived: Include archived threads (default True)
        include_members: Include member list for roles (default False)
        has: Filter messages by attachment type (link, embed, file, video, image)
        before: Messages before this date/snowflake (also for pagination)
        after: Messages after this date/snowflake
        limit: Max results (default 50, can increase if needed)

    Returns:
        Search results based on action type
    """
    # Get guild from context
    if not _context:
        return {"error": "No context provided - cannot access Discord guild"}

    guild = _context.get("discord_guild")
    if not guild:
        return {"error": "Discord guild not available in context"}

    # Parse ID params - AI might pass "<#123>" instead of just 123
    def extract_id(value: Optional[Union[int, str]], pattern: str) -> Optional[int]:
        """Extract numeric ID from value, handling mention formats."""
        if value is None:
            return None
        if isinstance(value, int):
            return value
        # Try parsing as plain int
        try:
            return int(value)
        except (ValueError, TypeError):
            pass
        # Try extracting from mention format
        match = re.search(pattern, str(value))
        if match:
            return int(match.group(1))
        return None

    channel_id = extract_id(channel_id, r"<#(\d+)>")
    user_id = extract_id(user_id, r"<@!?(\d+)>")
    role_id = extract_id(role_id, r"<@&(\d+)>")
    message_id = extract_id(message_id, r"(\d+)")
    thread_id = extract_id(thread_id, r"(\d+)")

    # Get bot member for permission checks
    bot = _context.get("discord_bot")
    bot_member = guild.me if guild else None

    # Get requesting user for filtering results (don't show them channels they can't see)
    # SECURITY CRITICAL: Must verify user permissions to prevent leaking private channels
    requesting_user_id = _context.get("user_id")
    requesting_member = (
        guild.get_member(requesting_user_id) if requesting_user_id else None
    )

    # If member not in cache, MUST fetch them for accurate permission check
    if not requesting_member and requesting_user_id:
        try:
            requesting_member = await guild.fetch_member(requesting_user_id)
            logger.info(f"Fetched member {requesting_user_id} for permission check")
        except discord.NotFound:
            logger.warning(
                f"SECURITY: User {requesting_user_id} not found in guild - restricting to public channels only"
            )
        except Exception as e:
            logger.warning(
                f"SECURITY: Failed to fetch member {requesting_user_id}: {e} - restricting to public channels only"
            )

    # Helper to check if BOT can access a channel (for fetching)
    def bot_can_access(channel) -> bool:
        """Check if the bot has permission to view a channel."""
        if not bot_member:
            return True  # Assume yes if we can't check
        perms = channel.permissions_for(bot_member)
        return perms.view_channel

    # Helper to check if USER can view a channel (for filtering results)
    # SECURITY: This is the critical permission gate
    def user_can_view(channel) -> bool:
        """Check if the requesting user has permission to view a channel."""
        if requesting_member:
            # Have member - check their actual permissions
            perms = channel.permissions_for(requesting_member)
            return perms.view_channel
        else:
            # SECURITY: No member context - ONLY allow public channels
            # Public = @everyone role has explicit view_channel permission
            everyone_role = guild.default_role
            if everyone_role:
                perms = channel.permissions_for(everyone_role)
                return perms.view_channel
            return False  # No @everyone role = deny

    # Combined check: bot can fetch AND user can see results
    def can_view_channel(channel) -> bool:
        """Check if bot can access AND user can view (for security filtering)."""
        return bot_can_access(channel) and user_can_view(channel)

    # Get list of channel IDs user can access (for message search filtering)
    accessible_channel_ids = set()
    for ch in guild.channels:
        if hasattr(ch, "permissions_for"):
            if can_view_channel(ch):
                accessible_channel_ids.add(ch.id)

    # Include threads - they inherit parent channel permissions
    for thread in guild.threads:
        parent = guild.get_channel(thread.parent_id)
        if parent and can_view_channel(parent):
            accessible_channel_ids.add(thread.id)

    action = action.lower()

    # AUTO-PARSE MENTIONS from query string
    # Extracts IDs from <@123>, <#123>, <@&123> formats
    if query:
        mentions = parse_discord_mentions(query)
        # Auto-set user_id if mentioned and not already set
        if mentions["user_ids"] and not user_id:
            user_id = mentions["user_ids"][0]
        # Auto-set channel_id if mentioned and not already set
        if mentions["channel_ids"] and not channel_id:
            channel_id = mentions["channel_ids"][0]
        # Auto-set role_id if mentioned and not already set
        if mentions["role_ids"] and not role_id:
            role_id = mentions["role_ids"][0]

    # Also parse channel_name in case AI passed <#123> format there
    if channel_name and not channel_id:
        ch_mentions = parse_discord_mentions(channel_name)
        if ch_mentions["channel_ids"]:
            channel_id = ch_mentions["channel_ids"][0]

    # Resolve channel_name to channel_id if provided (only if user can access it)
    if channel_name and not channel_id:
        found_channel = None
        for ch in guild.channels:
            if channel_name.lower() in ch.name.lower():
                if can_view_channel(ch):
                    found_channel = ch
                    channel_id = ch.id
                    break
        # If channel_name was provided but not found, ignore it (will fall through to default)
        # Don't error - AI might have guessed wrong

    # Verify user can access the specified channel_id
    if channel_id:
        target_channel = guild.get_channel(channel_id)
        if target_channel and not can_view_channel(target_channel):
            return {"error": "You don't have permission to access that channel"}

    # Resolve role_name to role_id if provided
    if role_name and not role_id:
        for r in guild.roles:
            if role_name.lower() in r.name.lower():
                role_id = r.id
                break

    if action == "messages":
        if not query:
            return {"error": "Query is required for message search"}
        # SECURITY: Pass accessible channels to filter results
        result = await discord_search_client.search_messages(
            guild_id=guild.id,
            query=query,
            channel_id=channel_id,
            author_id=user_id,
            author_type=author_type,
            has=has,
            pinned=pinned,
            before=before,
            after=after,
            sort_by=sort_by,
            sort_order=sort_order,
            link_hostname=link_hostname,
            attachment_extension=attachment_extension,
            limit=limit,
            offset=offset,
            accessible_channel_ids=accessible_channel_ids,
        )
        return result

    elif action == "members":
        return await discord_search_client.search_members(
            guild=guild,
            query=query,
            user_id=user_id,
            role_id=role_id,
            limit=limit,
        )

    elif action == "channels":
        # SECURITY: Pass permission filter to only show accessible channels
        return await discord_search_client.search_channels(
            guild=guild,
            query=query,
            channel_type=channel_type,
            limit=limit,
            can_view_channel=can_view_channel,
        )

    elif action == "threads":
        # SECURITY: Pass permission filter to only show accessible threads
        return await discord_search_client.search_threads(
            guild=guild,
            query=query,
            include_archived=include_archived,
            limit=limit,
            can_view_channel=can_view_channel,
        )

    elif action == "roles":
        return await discord_search_client.search_roles(
            guild=guild,
            query=query,
            include_members=include_members,
            limit=limit,
        )

    elif action == "history":
        # Get recent messages from a channel (no search query needed)
        # Default to current channel if not specified
        if not channel_id:
            channel_id = _context.get("channel_id")
        channel = guild.get_channel(channel_id)
        # Try fetching if not in cache
        if not channel:
            try:
                bot = _context.get("discord_bot")
                if bot:
                    channel = await bot.fetch_channel(channel_id)
            except Exception:
                pass
        if not channel:
            return {"error": f"Channel {channel_id} not found"}
        if not can_view_channel(channel):
            return {"error": "You don't have permission to view that channel"}

        before_id = int(before) if before else None
        after_id = int(after) if after else None
        return await discord_search_client.get_channel_history(
            channel=channel,
            limit=limit,
            before=before_id,
            after=after_id,
        )

    elif action == "context":
        # Get messages around a specific message
        if not message_id:
            return {"error": "message_id required for context action"}
        if not channel_id:
            return {"error": "channel_id or channel_name required for context action"}
        channel = guild.get_channel(channel_id)
        if not channel:
            return {"error": f"Channel {channel_id} not found"}
        if not can_view_channel(channel):
            return {"error": "You don't have permission to view that channel"}

        return await discord_search_client.get_message_context(
            channel=channel,
            message_id=message_id,
            before_count=min(limit // 2, 10),
            after_count=min(limit // 2, 10),
        )

    elif action == "thread_history":
        # Get messages from a thread with metadata
        if not thread_id:
            return {"error": "thread_id required for thread_history action"}

        # Try to get thread from guild
        thread = guild.get_thread(thread_id)
        if not thread:
            # Try fetching it
            try:
                thread = await guild.fetch_channel(thread_id)
            except Exception:
                return {"error": f"Thread {thread_id} not found"}

        # SECURITY: Check if user can view parent channel
        if thread.parent and not can_view_channel(thread.parent):
            return {"error": "You don't have permission to view that thread"}

        before_id = int(before) if before else None
        return await discord_search_client.get_thread_history(
            thread=thread,
            limit=limit,
            before=before_id,
        )

    else:
        return {
            "error": f"Unknown action: {action}",
            "valid_actions": [
                "messages",
                "members",
                "channels",
                "threads",
                "roles",
                "history",
                "context",
                "thread_history",
            ],
        }
