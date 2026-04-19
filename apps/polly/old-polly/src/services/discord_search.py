import logging
import re
from typing import Any

import aiohttp
import discord

from ..config import config

logger = logging.getLogger(__name__)


def parse_discord_mentions(text: str) -> dict[str, list[int]]:
    result = {"user_ids": [], "channel_ids": [], "role_ids": []}
    user_pattern = r"<@!?(\d+)>"
    for match in re.finditer(user_pattern, text):
        user_id = int(match.group(1))
        if user_id not in result["user_ids"]:
            result["user_ids"].append(user_id)
    channel_pattern = r"<#(\d+)>"
    for match in re.finditer(channel_pattern, text):
        channel_id = int(match.group(1))
        if channel_id not in result["channel_ids"]:
            result["channel_ids"].append(channel_id)
    role_pattern = r"<@&(\d+)>"
    for match in re.finditer(role_pattern, text):
        role_id = int(match.group(1))
        if role_id not in result["role_ids"]:
            result["role_ids"].append(role_id)
    return result


DISCORD_API_BASE = "https://discord.com/api/v10"


class DiscordSearchClient:
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None

    @property
    def headers(self) -> dict:
        return {
            "Authorization": f"Bot {config.discord_token}",
            "Content-Type": "application/json",
        }

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def search_messages(
        self,
        guild_id: int,
        query: str,
        channel_id: int | None = None,
        author_id: int | None = None,
        author_type: str | None = None,
        mentions: int | None = None,
        mention_everyone: bool | None = None,
        has: str | None = None,
        pinned: bool | None = None,
        before: str | None = None,
        after: str | None = None,
        sort_by: str = "timestamp",
        sort_order: str = "desc",
        link_hostname: str | None = None,
        attachment_extension: str | None = None,
        limit: int = 25,
        offset: int = 0,
        accessible_channel_ids: set | None = None,
    ) -> dict[str, Any]:
        import asyncio

        session = await self.get_session()
        params = {"content": query[:1024]}
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
            params["offset"] = min(offset, 9975)
        params["include_nsfw"] = "true"
        url = f"{DISCORD_API_BASE}/guilds/{guild_id}/messages/search"
        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with session.get(url, headers=self.headers, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        messages = self._format_messages(data.get("messages", []))
                        total_results = data.get("total_results", len(messages))
                        if accessible_channel_ids is not None:
                            original_count = len(messages)
                            messages = [m for m in messages if int(m.get("channel_id", 0)) in accessible_channel_ids]
                            filtered_count = original_count - len(messages)
                            if filtered_count > 0:
                                logger.info(f"SECURITY: Filtered {filtered_count} messages from private channels")
                        return {
                            "success": True,
                            "total_results": total_results,
                            "returned": len(messages),
                            "offset": offset,
                            "messages": messages,
                        }
                    elif resp.status == 202:
                        retry_after = 2
                        try:
                            data = await resp.json()
                            retry_after = data.get("retry_after", 2)
                        except Exception:
                            pass
                        if attempt < max_retries - 1:
                            logger.info(f"Search index not ready, retrying in {retry_after}s...")
                            await asyncio.sleep(retry_after)
                            continue
                        return {"error": "Search index not ready. Try again in a few seconds."}
                    elif resp.status == 403:
                        return {"error": "Bot doesn't have permission to search messages in this guild"}
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

    def _format_messages(self, messages: list[list[dict]]) -> list[dict]:
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

    async def search_members(
        self,
        guild: discord.Guild,
        query: str | None = None,
        user_id: int | None = None,
        role_id: int | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        try:
            members = []
            if user_id:
                member = guild.get_member(user_id)
                if not member:
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
                found = await guild.query_members(query=query, limit=limit)
                members = found
            elif role_id:
                role = guild.get_role(role_id)
                if role:
                    members = role.members[:limit]
                else:
                    return {"error": f"Role {role_id} not found"}
            else:
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

    async def search_channels(
        self,
        guild: discord.Guild,
        query: str | None = None,
        channel_type: str | None = None,
        limit: int = 50,
        can_view_channel: callable = None,
    ) -> dict[str, Any]:
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
            if can_view_channel:
                channels = [c for c in channels if can_view_channel(c)]
            if channel_type and channel_type.lower() in type_map:
                target_type = type_map[channel_type.lower()]
                channels = [c for c in channels if c.type == target_type]
            if query:
                query_lower = query.lower()
                channels = [c for c in channels if query_lower in c.name.lower()]
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

    async def search_threads(
        self,
        guild: discord.Guild,
        query: str | None = None,
        include_archived: bool = True,
        limit: int = 50,
        can_view_channel: callable = None,
    ) -> dict[str, Any]:
        try:
            threads = []
            active_threads = guild.threads
            for t in active_threads:
                if can_view_channel and t.parent:
                    if not can_view_channel(t.parent):
                        continue
                threads.append(t)
            if include_archived:
                for channel in guild.text_channels:
                    if can_view_channel and not can_view_channel(channel):
                        continue
                    try:
                        async for thread in channel.archived_threads(limit=50):
                            threads.append(thread)
                    except discord.Forbidden:
                        continue
                    except Exception:
                        continue
            if query:
                query_lower = query.lower()
                threads = [t for t in threads if query_lower in t.name.lower()]
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
                        "created_at": (t.created_at.isoformat() if t.created_at else None),
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

    async def search_roles(
        self,
        guild: discord.Guild,
        query: str | None = None,
        include_members: bool = False,
        limit: int = 50,
    ) -> dict[str, Any]:
        try:
            roles = list(guild.roles)
            if query:
                query_lower = query.lower()
                roles = [r for r in roles if query_lower in r.name.lower()]
            roles = [r for r in roles if r.name != "@everyone"]
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
                    role_data["members"] = [{"id": str(m.id), "name": m.display_name} for m in r.members[:20]]
                formatted.append(role_data)
            return {
                "success": True,
                "count": len(formatted),
                "roles": formatted,
            }
        except Exception as e:
            logger.error(f"Role search error: {e}")
            return {"error": str(e)}

    async def get_channel_history(
        self,
        channel: discord.TextChannel,
        limit: int = 25,
        before: int | None = None,
        after: int | None = None,
    ) -> dict[str, Any]:
        try:
            limit = min(limit, 100)
            messages = []
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

    async def get_message_context(
        self,
        channel: discord.TextChannel,
        message_id: int,
        before_count: int = 5,
        after_count: int = 5,
    ) -> dict[str, Any]:
        try:
            try:
                target_msg = await channel.fetch_message(message_id)
            except discord.NotFound:
                return {"error": f"Message {message_id} not found"}
            before_msgs = []
            async for msg in channel.history(limit=before_count, before=target_msg):
                before_msgs.append(msg)
            before_msgs.reverse()
            after_msgs = []
            async for msg in channel.history(limit=after_count, after=target_msg, oldest_first=True):
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

    async def get_thread_history(
        self,
        thread: discord.Thread,
        limit: int = 50,
        before: int | None = None,
    ) -> dict[str, Any]:
        try:
            limit = min(limit, 100)
            messages = []
            kwargs = {"limit": limit}
            if before:
                kwargs["before"] = discord.Object(id=before)
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
                if str(msg.author.id) not in participants:
                    participants[str(msg.author.id)] = msg.author.name
            return {
                "success": True,
                "thread_name": thread.name,
                "thread_id": str(thread.id),
                "parent_channel": thread.parent.name if thread.parent else None,
                "owner_id": str(thread.owner_id) if thread.owner_id else None,
                "created_at": (thread.created_at.isoformat() if thread.created_at else None),
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
                    if messages and thread.message_count and len(messages) < thread.message_count
                    else None
                ),
            }
        except discord.Forbidden:
            return {"error": f"No permission to read thread '{thread.name}'"}
        except Exception as e:
            logger.error(f"Thread history error: {e}")
            return {"error": str(e)}


discord_search_client = DiscordSearchClient()


async def tool_discord_search(
    action: str,
    query: str | None = None,
    channel_id: int | str | None = None,
    channel_name: str | None = None,
    user_id: int | str | None = None,
    role_id: int | str | None = None,
    role_name: str | None = None,
    channel_type: str | None = None,
    message_id: int | str | None = None,
    thread_id: int | str | None = None,
    include_archived: bool = True,
    include_members: bool = False,
    has: str | None = None,
    before: str | None = None,
    after: str | None = None,
    limit: int = 50,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
    author_type: str | None = None,
    pinned: bool | None = None,
    link_hostname: str | None = None,
    attachment_extension: str | None = None,
    offset: int = 0,
    _context: dict = None,
    **kwargs,
) -> dict[str, Any]:
    if not _context:
        return {"error": "No context provided - cannot access Discord guild"}
    guild = _context.get("discord_guild")
    if not guild:
        return {"error": "Discord guild not available in context"}

    def extract_id(value: int | str | None, pattern: str) -> int | None:
        if value is None:
            return None
        if isinstance(value, int):
            return value
        try:
            return int(value)
        except (ValueError, TypeError):
            pass
        match = re.search(pattern, str(value))
        if match:
            return int(match.group(1))
        return None

    channel_id = extract_id(channel_id, r"<#(\d+)>")
    user_id = extract_id(user_id, r"<@!?(\d+)>")
    role_id = extract_id(role_id, r"<@&(\d+)>")
    message_id = extract_id(message_id, r"(\d+)")
    thread_id = extract_id(thread_id, r"(\d+)")
    bot = _context.get("discord_bot")
    bot_member = guild.me if guild else None
    requesting_user_id = _context.get("user_id")
    requesting_member = guild.get_member(requesting_user_id) if requesting_user_id else None
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

    def bot_can_access(channel) -> bool:
        if not bot_member:
            return True
        perms = channel.permissions_for(bot_member)
        return perms.view_channel

    def user_can_view(channel) -> bool:
        if requesting_member:
            perms = channel.permissions_for(requesting_member)
            return perms.view_channel
        else:
            everyone_role = guild.default_role
            if everyone_role:
                perms = channel.permissions_for(everyone_role)
                return perms.view_channel
            return False

    def can_view_channel(channel) -> bool:
        return bot_can_access(channel) and user_can_view(channel)

    accessible_channel_ids = set()
    for ch in guild.channels:
        if hasattr(ch, "permissions_for"):
            if can_view_channel(ch):
                accessible_channel_ids.add(ch.id)
    for thread in guild.threads:
        parent = guild.get_channel(thread.parent_id)
        if parent and can_view_channel(parent):
            accessible_channel_ids.add(thread.id)
    action = action.lower()
    if query:
        mentions = parse_discord_mentions(query)
        if mentions["user_ids"] and not user_id:
            user_id = mentions["user_ids"][0]
        if mentions["channel_ids"] and not channel_id:
            channel_id = mentions["channel_ids"][0]
        if mentions["role_ids"] and not role_id:
            role_id = mentions["role_ids"][0]
    if channel_name and not channel_id:
        ch_mentions = parse_discord_mentions(channel_name)
        if ch_mentions["channel_ids"]:
            channel_id = ch_mentions["channel_ids"][0]
    if channel_name and not channel_id:
        for ch in guild.channels:
            if channel_name.lower() in ch.name.lower():
                if can_view_channel(ch):
                    channel_id = ch.id
                    break
    if channel_id:
        target_channel = guild.get_channel(channel_id)
        if target_channel and not can_view_channel(target_channel):
            return {"error": "You don't have permission to access that channel"}
    if role_name and not role_id:
        for r in guild.roles:
            if role_name.lower() in r.name.lower():
                role_id = r.id
                break
    if action == "messages":
        if not query:
            return {"error": "Query is required for message search"}
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
        return await discord_search_client.search_channels(
            guild=guild,
            query=query,
            channel_type=channel_type,
            limit=limit,
            can_view_channel=can_view_channel,
        )
    elif action == "threads":
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
        if not channel_id:
            channel_id = _context.get("channel_id")
        channel = guild.get_channel(channel_id)
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
        if not thread_id:
            return {"error": "thread_id required for thread_history action"}
        thread = guild.get_thread(thread_id)
        if not thread:
            try:
                thread = await guild.fetch_channel(thread_id)
            except Exception:
                return {"error": f"Thread {thread_id} not found"}
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
