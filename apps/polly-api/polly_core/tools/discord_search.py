"""
Discord Search Service - Public channels only, REST API based.

Standalone implementation for polly-api. Uses Discord REST API directly
with a bot token (no Discord.py gateway needed). Only exposes PUBLIC
channels (where @everyone has VIEW_CHANNEL permission).
"""

import aiohttp
import logging
import re
import time
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone

from ..config import config

logger = logging.getLogger(__name__)

DISCORD_API_BASE = "https://discord.com/api/v10"

# Permission bit for VIEW_CHANNEL
VIEW_CHANNEL = 1 << 10


# =============================================================================
# MENTION PARSER
# =============================================================================


def parse_discord_mentions(text: str) -> Dict[str, List[int]]:
    """Extract user, channel, and role IDs from Discord mention formats."""
    return {
        "user_ids": [int(m) for m in re.findall(r"<@!?(\d+)>", text)],
        "channel_ids": [int(m) for m in re.findall(r"<#(\d+)>", text)],
        "role_ids": [int(m) for m in re.findall(r"<@&(\d+)>", text)],
    }


# =============================================================================
# REST-BASED DISCORD CLIENT (public channels only)
# =============================================================================


class DiscordRestClient:
    """Discord REST API client for public-channel-only search."""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._public_channel_ids: Optional[set] = None
        self._channels_cache: Optional[list] = None
        self._cache_time: float = 0
        self._cache_ttl: int = 300  # 5 minute cache

    @property
    def headers(self) -> dict:
        return {
            "Authorization": f"Bot {config.discord_token}",
            "Content-Type": "application/json",
        }

    @property
    def guild_id(self) -> str:
        return config.discord_guild_id

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def _fetch_json(self, url: str) -> Any:
        """Fetch JSON from Discord API."""
        session = await self.get_session()
        async with session.get(url, headers=self.headers) as resp:
            if resp.status == 200:
                return await resp.json()
            elif resp.status == 403:
                return {"error": "Bot lacks permission"}
            elif resp.status == 404:
                return {"error": "Not found"}
            else:
                text = await resp.text()
                return {"error": f"Discord API error {resp.status}: {text[:200]}"}

    # =========================================================================
    # PUBLIC CHANNEL DETECTION
    # =========================================================================

    async def _get_guild_channels(self) -> list:
        """Fetch and cache guild channels."""
        now = time.time()
        if self._channels_cache and (now - self._cache_time) < self._cache_ttl:
            return self._channels_cache

        url = f"{DISCORD_API_BASE}/guilds/{self.guild_id}/channels"
        data = await self._fetch_json(url)
        if isinstance(data, dict) and data.get("error"):
            logger.error(f"Failed to fetch channels: {data['error']}")
            return []

        self._channels_cache = data
        self._cache_time = now
        self._public_channel_ids = None  # Invalidate
        return data

    async def get_public_channel_ids(self) -> set:
        """Get IDs of channels where @everyone can VIEW_CHANNEL.

        Discord permission logic:
        1. Start with @everyone role's base permissions for the guild
        2. Apply channel-level permission_overwrites for @everyone role
        3. If VIEW_CHANNEL is explicitly denied -> private
        4. If VIEW_CHANNEL is explicitly allowed or inherited -> public
        """
        if self._public_channel_ids is not None:
            now = time.time()
            if (now - self._cache_time) < self._cache_ttl:
                return self._public_channel_ids

        channels = await self._get_guild_channels()
        if not channels:
            return set()

        # Fetch guild to get @everyone role permissions
        guild_data = await self._fetch_json(f"{DISCORD_API_BASE}/guilds/{self.guild_id}")
        if isinstance(guild_data, dict) and guild_data.get("error"):
            logger.error(f"Failed to fetch guild: {guild_data['error']}")
            return set()

        # @everyone role ID == guild ID
        everyone_role_id = self.guild_id
        # Get base permissions from guild roles
        base_perms = 0
        for role in guild_data.get("roles", []):
            if str(role["id"]) == str(everyone_role_id):
                base_perms = int(role["permissions"])
                break

        public_ids = set()
        for channel in channels:
            # Skip categories and non-text channel types that aren't searchable
            ch_type = channel.get("type", 0)
            # 0=text, 2=voice, 4=category, 5=news, 13=stage, 15=forum
            if ch_type == 4:  # category - check but don't add
                continue

            # Start with base @everyone permissions
            allow = base_perms
            deny = 0

            # Apply channel-level overwrites for @everyone
            for overwrite in channel.get("permission_overwrites", []):
                if str(overwrite["id"]) == str(everyone_role_id):
                    deny |= int(overwrite.get("deny", "0"))
                    allow |= int(overwrite.get("allow", "0"))

            # Final permission: (base | allow) & ~deny
            effective = (base_perms | int(allow)) & ~int(deny)

            if effective & VIEW_CHANNEL:
                public_ids.add(int(channel["id"]))

        self._public_channel_ids = public_ids
        logger.info(f"Found {len(public_ids)} public channels out of {len(channels)} total")
        return public_ids

    async def get_public_channels(self) -> list:
        """Get public channel data."""
        channels = await self._get_guild_channels()
        public_ids = await self.get_public_channel_ids()
        return [c for c in channels if int(c["id"]) in public_ids]

    def _is_public(self, channel_id: int) -> bool:
        """Check if a channel ID is in the public set (must call get_public_channel_ids first)."""
        return self._public_channel_ids and channel_id in self._public_channel_ids

    # =========================================================================
    # MESSAGE SEARCH
    # =========================================================================

    async def search_messages(
        self,
        query: str,
        channel_id: Optional[int] = None,
        author_id: Optional[int] = None,
        has: Optional[str] = None,
        before: Optional[str] = None,
        after: Optional[str] = None,
        sort_by: str = "timestamp",
        sort_order: str = "desc",
        limit: int = 25,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Search messages in public channels only."""
        public_ids = await self.get_public_channel_ids()
        if not public_ids:
            return {"error": "No public channels found"}

        # If specific channel requested, verify it's public
        if channel_id:
            if channel_id not in public_ids:
                return {"error": "Channel is not public or not found"}

        params = {"content": query[:1024]}
        if channel_id:
            params["channel_id"] = str(channel_id)
        if author_id:
            params["author_id"] = str(author_id)
        if has:
            params["has"] = has
        if before:
            params["max_id"] = str(before)
        if after:
            params["min_id"] = str(after)
        if sort_by == "relevance":
            params["sort_by"] = "relevance"
        if sort_order == "asc":
            params["sort_order"] = "asc"
        params["offset"] = str(min(offset, 9975))

        url = f"{DISCORD_API_BASE}/guilds/{self.guild_id}/messages/search"

        try:
            session = await self.get_session()
            async with session.get(url, params=params, headers=self.headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    messages = data.get("messages", [])
                    total = data.get("total_results", 0)

                    # Filter to public channels only
                    filtered = []
                    for msg_group in messages:
                        if not msg_group:
                            continue
                        msg = msg_group[0] if isinstance(msg_group, list) else msg_group
                        ch_id = int(msg.get("channel_id", 0))
                        if ch_id in public_ids:
                            filtered.append({
                                "id": msg["id"],
                                "content": msg.get("content", "")[:500],
                                "author": msg.get("author", {}).get("username", "unknown"),
                                "author_id": msg.get("author", {}).get("id"),
                                "channel_id": str(ch_id),
                                "timestamp": msg.get("timestamp", "")[:19],
                                "attachments": len(msg.get("attachments", [])),
                                "embeds": len(msg.get("embeds", [])),
                            })
                        if len(filtered) >= limit:
                            break

                    return {
                        "success": True,
                        "messages": filtered,
                        "count": len(filtered),
                        "total_results": total,
                        "query": query,
                        "note": "Results limited to public channels only",
                    }
                elif resp.status == 403:
                    return {"error": "Bot doesn't have permission to search messages"}
                else:
                    text = await resp.text()
                    return {"error": f"Discord API error: {resp.status}"}

        except Exception as e:
            logger.error(f"Message search error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # CHANNEL LIST
    # =========================================================================

    async def list_channels(
        self,
        query: Optional[str] = None,
        channel_type: Optional[str] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """List public channels."""
        channels = await self.get_public_channels()

        type_map = {"text": 0, "voice": 2, "category": 4, "news": 5, "stage": 13, "forum": 15}
        type_names = {0: "text", 2: "voice", 4: "category", 5: "news", 13: "stage", 15: "forum"}

        if channel_type and channel_type.lower() in type_map:
            target = type_map[channel_type.lower()]
            channels = [c for c in channels if c.get("type") == target]

        if query:
            q = query.lower()
            channels = [c for c in channels if q in c.get("name", "").lower()]

        channels = channels[:limit]

        formatted = []
        for c in channels:
            formatted.append({
                "id": str(c["id"]),
                "name": c.get("name", ""),
                "type": type_names.get(c.get("type", 0), "unknown"),
                "topic": (c.get("topic") or "")[:100],
                "position": c.get("position", 0),
            })

        return {"success": True, "count": len(formatted), "channels": formatted}

    # =========================================================================
    # CHANNEL HISTORY
    # =========================================================================

    async def get_channel_history(
        self,
        channel_id: int,
        limit: int = 25,
        before: Optional[int] = None,
        after: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Get recent messages from a public channel."""
        public_ids = await self.get_public_channel_ids()
        if channel_id not in public_ids:
            return {"error": "Channel is not public or not found"}

        limit = min(limit, 100)
        url = f"{DISCORD_API_BASE}/channels/{channel_id}/messages?limit={limit}"
        if before:
            url += f"&before={before}"
        if after:
            url += f"&after={after}"

        data = await self._fetch_json(url)
        if isinstance(data, dict) and data.get("error"):
            return data

        messages = []
        for msg in data:
            messages.append({
                "id": msg["id"],
                "content": msg.get("content", "")[:500],
                "author": msg.get("author", {}).get("username", "unknown"),
                "author_id": msg.get("author", {}).get("id"),
                "timestamp": msg.get("timestamp", "")[:19],
                "attachments": [
                    {"filename": a.get("filename"), "url": a.get("url")}
                    for a in msg.get("attachments", [])
                ],
                "embeds": len(msg.get("embeds", [])),
                "reactions": [
                    {"emoji": r.get("emoji", {}).get("name"), "count": r.get("count", 0)}
                    for r in msg.get("reactions", [])
                ],
            })

        return {
            "success": True,
            "channel_id": str(channel_id),
            "count": len(messages),
            "messages": messages,
        }

    # =========================================================================
    # ROLES (public info)
    # =========================================================================

    async def list_roles(
        self,
        query: Optional[str] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """List guild roles (public info)."""
        url = f"{DISCORD_API_BASE}/guilds/{self.guild_id}/roles"
        data = await self._fetch_json(url)
        if isinstance(data, dict) and data.get("error"):
            return data

        roles = [r for r in data if r.get("name") != "@everyone"]

        if query:
            q = query.lower()
            roles = [r for r in roles if q in r.get("name", "").lower()]

        roles = sorted(roles, key=lambda r: r.get("position", 0), reverse=True)[:limit]

        formatted = []
        for r in roles:
            formatted.append({
                "id": str(r["id"]),
                "name": r["name"],
                "color": f"#{r.get('color', 0):06x}" if r.get("color") else None,
                "position": r.get("position", 0),
                "mentionable": r.get("mentionable", False),
            })

        return {"success": True, "count": len(formatted), "roles": formatted}

    # =========================================================================
    # THREADS (from public channels only)
    # =========================================================================

    async def list_threads(
        self,
        query: Optional[str] = None,
        include_archived: bool = True,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """List threads from public channels."""
        public_ids = await self.get_public_channel_ids()

        # Fetch active threads
        url = f"{DISCORD_API_BASE}/guilds/{self.guild_id}/threads/active"
        data = await self._fetch_json(url)
        if isinstance(data, dict) and data.get("error"):
            return data

        threads = []
        for t in data.get("threads", []):
            parent_id = int(t.get("parent_id", 0))
            if parent_id in public_ids:
                threads.append(t)

        if query:
            q = query.lower()
            threads = [t for t in threads if q in t.get("name", "").lower()]

        threads = threads[:limit]

        formatted = []
        for t in threads:
            formatted.append({
                "id": str(t["id"]),
                "name": t.get("name", ""),
                "parent_id": str(t.get("parent_id", "")),
                "archived": t.get("thread_metadata", {}).get("archived", False),
                "locked": t.get("thread_metadata", {}).get("locked", False),
                "message_count": t.get("message_count", 0),
                "member_count": t.get("member_count", 0),
            })

        return {"success": True, "count": len(formatted), "threads": formatted}

    # =========================================================================
    # MEMBERS (public info via REST)
    # =========================================================================

    async def search_members(
        self,
        query: Optional[str] = None,
        user_id: Optional[int] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """Search guild members."""
        if user_id:
            url = f"{DISCORD_API_BASE}/guilds/{self.guild_id}/members/{user_id}"
            data = await self._fetch_json(url)
            if isinstance(data, dict) and data.get("error"):
                return {"success": True, "count": 0, "members": [], "note": f"User {user_id} not found"}
            members_data = [data]
        elif query:
            url = f"{DISCORD_API_BASE}/guilds/{self.guild_id}/members/search?query={query}&limit={min(limit, 1000)}"
            data = await self._fetch_json(url)
            if isinstance(data, dict) and data.get("error"):
                return data
            members_data = data
        else:
            url = f"{DISCORD_API_BASE}/guilds/{self.guild_id}/members?limit={min(limit, 1000)}"
            data = await self._fetch_json(url)
            if isinstance(data, dict) and data.get("error"):
                return data
            members_data = data

        formatted = []
        for m in members_data[:limit]:
            user = m.get("user", {})
            formatted.append({
                "id": str(user.get("id", "")),
                "username": user.get("username", ""),
                "display_name": user.get("global_name") or m.get("nick") or user.get("username", ""),
                "nickname": m.get("nick"),
                "is_bot": user.get("bot", False),
                "joined_at": (m.get("joined_at") or "")[:10],
            })

        return {"success": True, "count": len(formatted), "members": formatted}


# Singleton
discord_client = DiscordRestClient()


# =============================================================================
# TOOL HANDLER
# =============================================================================


async def tool_discord_search(
    action: str,
    query: Optional[str] = None,
    channel_id: Optional[Union[int, str]] = None,
    channel_name: Optional[str] = None,
    user_id: Optional[Union[int, str]] = None,
    role_id: Optional[Union[int, str]] = None,
    has: Optional[str] = None,
    before: Optional[str] = None,
    after: Optional[str] = None,
    limit: int = 50,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
    channel_type: Optional[str] = None,
    include_archived: bool = True,
    offset: int = 0,
    _context: dict = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Search the Discord server (public channels only).

    Actions:
        - messages: Search message content (query required)
        - members: Search members by name
        - channels: List/search channels
        - threads: List/search threads
        - roles: List/search roles
        - history: Get recent messages from a channel

    All results are restricted to public channels only.
    """
    if not config.discord_token or not config.discord_guild_id:
        return {"error": "Discord not configured (DISCORD_TOKEN and DISCORD_GUILD_ID required)"}

    # Parse ID params - AI might pass "<#123>" format
    def extract_id(value, pattern):
        if value is None:
            return None
        if isinstance(value, int):
            return value
        try:
            return int(value)
        except (ValueError, TypeError):
            pass
        match = re.search(pattern, str(value))
        return int(match.group(1)) if match else None

    channel_id = extract_id(channel_id, r"<#(\d+)>")
    user_id = extract_id(user_id, r"<@!?(\d+)>")

    # Auto-parse mentions from query
    if query:
        mentions = parse_discord_mentions(query)
        if mentions["user_ids"] and not user_id:
            user_id = mentions["user_ids"][0]
        if mentions["channel_ids"] and not channel_id:
            channel_id = mentions["channel_ids"][0]

    # Resolve channel_name to channel_id
    if channel_name and not channel_id:
        public_channels = await discord_client.get_public_channels()
        for ch in public_channels:
            if channel_name.lower() in ch.get("name", "").lower():
                channel_id = int(ch["id"])
                break

    action = action.lower()

    if action == "messages":
        if not query:
            return {"error": "Query is required for message search"}
        return await discord_client.search_messages(
            query=query,
            channel_id=channel_id,
            author_id=user_id,
            has=has,
            before=before,
            after=after,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            offset=offset,
        )

    elif action == "members":
        return await discord_client.search_members(
            query=query,
            user_id=user_id,
            limit=limit,
        )

    elif action == "channels":
        return await discord_client.list_channels(
            query=query,
            channel_type=channel_type,
            limit=limit,
        )

    elif action == "threads":
        return await discord_client.list_threads(
            query=query,
            include_archived=include_archived,
            limit=limit,
        )

    elif action == "roles":
        return await discord_client.list_roles(
            query=query,
            limit=limit,
        )

    elif action == "history":
        if not channel_id:
            return {"error": "channel_id or channel_name required for history"}
        return await discord_client.get_channel_history(
            channel_id=channel_id,
            limit=limit,
            before=int(before) if before else None,
            after=int(after) if after else None,
        )

    else:
        return {
            "error": f"Unknown action: {action}",
            "valid_actions": ["messages", "members", "channels", "threads", "roles", "history"],
        }
