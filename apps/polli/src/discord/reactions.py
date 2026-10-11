"""Discord message reaction handlers and tool execution."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import discord

from ..utils.regex import re

logger = logging.getLogger(__name__)

# Discord message URL pattern: https://discord.com/channels/{guild_id}/{channel_id}/{message_id}
DISCORD_MESSAGE_URL_PATTERN = re.compile(
    r"https?://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/channels/(?P<guild_id>\d+|@me)/(?P<channel_id>\d+)/(?P<message_id>\d+)",
    re.IGNORECASE,
)

# Custom emoji pattern: <:name:id> or <a:name:id>
CUSTOM_EMOJI_PATTERN = re.compile(r"^<a?:(?P<name>[a-zA-Z0-9_]+):(?P<id>\d+)>$")


def parse_discord_message_link(url: str) -> tuple[int | None, int | None, int | None]:
    """Extract guild_id, channel_id, message_id from a Discord message link."""
    match = DISCORD_MESSAGE_URL_PATTERN.search(url.strip())
    if not match:
        return None, None, None
    raw_guild = match.group("guild_id")
    guild_id = int(raw_guild) if raw_guild.isdigit() else None
    channel_id = int(match.group("channel_id"))
    message_id = int(match.group("message_id"))
    return guild_id, channel_id, message_id


def extract_id(value: int | str | None, mention_pattern: str = r"(\d+)") -> int | None:
    """Extract integer snowflake from ID, string, or mention."""
    if value is None:
        return None
    if isinstance(value, int) and not isinstance(value, bool):
        return value if value > 0 else None
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if cleaned.isdecimal():
        return int(cleaned) if int(cleaned) > 0 else None
    match = re.search(mention_pattern, cleaned)
    if match:
        return int(match.group(1))
    return None


def _clean_emoji_token(token: str) -> str:
    """Strip surrounding whitespace, commas, quotes."""
    return token.strip(" \t\n\r,;\"'")


def resolve_single_emoji(
    token: str, guild: discord.Guild | None = None
) -> discord.Emoji | discord.PartialEmoji | str | None:
    """Resolve an emoji token into a Discord emoji object or Unicode emoji string."""
    token = _clean_emoji_token(token)
    if not token:
        return None

    # 1. Custom emoji formatted as <:name:id> or <a:name:id>
    match = CUSTOM_EMOJI_PATTERN.match(token)
    if match:
        try:
            name = match.group("name")
            emoji_id = int(match.group("id"))
            is_animated = token.startswith("<a:")
            return discord.PartialEmoji(name=name, id=emoji_id, animated=is_animated)
        except Exception:
            return token

    # 2. Check if it matches a custom emoji in the guild by name or ID
    if guild and getattr(guild, "emojis", None):
        clean_name = token.strip(":")
        if clean_name.isdigit():
            found = discord.utils.get(guild.emojis, id=int(clean_name))
            if found:
                return found
        found = discord.utils.get(guild.emojis, name=clean_name)
        if found:
            return found

    # 3. Standard shortcode like :thumbsup: or :bee:
    try:
        import emoji

        shortcode = token if token.startswith(":") and token.endswith(":") else f":{token}:"
        emojized = emoji.emojize(shortcode, language="alias")
        if emojized != shortcode:
            return emojized
    except ImportError:
        pass

    # 4. Standard Unicode emoji or raw string
    return token


def parse_emoji_inputs(
    emoji: str | None = None,
    emojis: list[str] | str | None = None,
    guild: discord.Guild | None = None,
) -> list[discord.Emoji | discord.PartialEmoji | str]:
    """Parse and resolve single or multiple emoji inputs."""
    raw_tokens: list[str] = []

    if isinstance(emojis, list):
        for item in emojis:
            if isinstance(item, str):
                raw_tokens.extend(item.split())
    elif isinstance(emojis, str) and emojis.strip():
        raw_tokens.extend(emojis.split())

    if isinstance(emoji, str) and emoji.strip():
        # Check if the string contains custom emojis or multiple unicode emojis/words
        # E.g. "<:bee:123> 👍" or "👍, 🐝" or ":bee:"
        parts = re.findall(r"<a?:[a-zA-Z0-9_]+:\d+>|[^\s,;]+", emoji)
        raw_tokens.extend(parts)

    resolved: list[discord.Emoji | discord.PartialEmoji | str] = []
    seen = set()
    for token in raw_tokens:
        parsed = resolve_single_emoji(token, guild=guild)
        if parsed is not None:
            key = str(parsed)
            if key not in seen:
                seen.add(key)
                resolved.append(parsed)

    return resolved


def _thread_is_accessible(thread: Any, member: discord.Member | None) -> bool:
    """Check if thread is accessible to the member."""
    is_private = getattr(thread, "type", None) in {discord.ChannelType.private_thread, "private_thread"}
    if member is None:
        if getattr(thread, "guild", None):
            perms = thread.permissions_for(thread.guild.default_role)
            return not is_private and bool(perms.view_channel) and bool(getattr(perms, "read_message_history", False))
        return not is_private
    permissions = thread.permissions_for(member)
    if not permissions.view_channel or not getattr(permissions, "read_message_history", False):
        return False
    if not is_private or getattr(permissions, "manage_threads", False):
        return True
    return any(getattr(candidate, "id", None) == member.id for candidate in getattr(thread, "members", []))


def check_channel_access(
    channel: discord.abc.GuildChannel | discord.Thread,
    bot_member: discord.Member | None,
    requesting_member: discord.Member | None,
    is_http_api: bool = False,
) -> tuple[bool, str | None]:
    """Verify that both the bot and requesting user can view and react in the channel."""
    if not bot_member:
        return False, "Bot member not found in server guild."

    bot_perms = channel.permissions_for(bot_member)
    if not (bot_perms.view_channel and getattr(bot_perms, "read_message_history", False)):
        return False, f"Bot cannot view or read history in channel '{getattr(channel, 'name', channel.id)}'."
    if not bot_perms.add_reactions:
        return False, f"Bot lacks 'Add Reactions' permission in channel '{getattr(channel, 'name', channel.id)}'."

    if not is_http_api:
        if requesting_member is None:
            return False, "Unable to verify your Discord membership for this server."
        if isinstance(channel, discord.Thread):
            if not _thread_is_accessible(channel, requesting_member):
                return False, "You do not have permission to view that thread."
        else:
            user_perms = channel.permissions_for(requesting_member)
            if not (user_perms.view_channel and getattr(user_perms, "read_message_history", False)):
                return False, "You do not have permission to view that channel."

    return True, None


async def attach_reactions(
    message: discord.Message,
    emojis: list[discord.Emoji | discord.PartialEmoji | str],
    action: str = "add",
    bot_member: discord.Member | None = None,
) -> tuple[list[str], list[str]]:
    """
    Attach or remove a list of reactions on a message.

    Returns:
        (applied_emojis, failed_emojis)
    """
    applied: list[str] = []
    failed: list[str] = []

    for i, em in enumerate(emojis):
        if i > 0:
            # Brief pause to respect Discord sub-second rate limits for multiple reactions
            await asyncio.sleep(0.2)
        try:
            if action == "add":
                await message.add_reaction(em)
            elif action == "remove":
                if bot_member:
                    await message.remove_reaction(em, bot_member)
                else:
                    await message.remove_reaction(em, message.guild.me if message.guild else None)
            applied.append(str(em))
        except discord.HTTPException as exc:
            logger.warning("Failed to %s reaction %s on message %s: %s", action, em, message.id, exc)
            failed.append(str(em))

    return applied, failed


async def tool_discord_react(
    message_id: int | str | None = None,
    emoji: str | None = None,
    emojis: list[str] | str | None = None,
    channel_id: int | str | None = None,
    action: str = "add",
    _context: dict | None = None,
    **kwargs,
) -> dict[str, Any]:
    """
    Tool handler: Attach or remove emoji reactions on any Discord message.
    """
    if not _context:
        return {"error": "No context provided - cannot access Discord"}

    guild: discord.Guild | None = _context.get("discord_guild")
    if not guild:
        return {"error": "Discord guild not available in context"}

    action = (action or "add").strip().lower()
    if action not in {"add", "remove"}:
        return {"error": "action must be 'add' or 'remove'"}

    # Parse target from message link if provided in message_id
    extracted_channel_id: int | None = None
    extracted_message_id: int | None = None
    if isinstance(message_id, str) and (
        "discord.com/channels/" in message_id or "discordapp.com/channels/" in message_id
    ):
        _, url_channel_id, url_message_id = parse_discord_message_link(message_id)
        if url_channel_id:
            extracted_channel_id = url_channel_id
        if url_message_id:
            extracted_message_id = url_message_id

    # Resolve message_id
    target_message_id: int | None = extracted_message_id
    if target_message_id is None:
        if message_id is None or str(message_id).strip().lower() in {"", "current", "this", "none"}:
            target_message_id = extract_id(_context.get("message_id") or _context.get("source_message_id"))
        else:
            target_message_id = extract_id(message_id)

    if not target_message_id:
        return {"error": "message_id is required (specify a message ID snowflake or Discord message URL)"}

    # Resolve channel_id
    target_channel_id: int | None = extracted_channel_id or extract_id(channel_id, r"<#(\d+)>")
    target_channel: discord.abc.GuildChannel | discord.Thread | None = None

    if target_channel_id:
        target_channel = guild.get_channel(target_channel_id) or guild.get_thread(target_channel_id)
        if not target_channel:
            try:
                target_channel = await guild.fetch_channel(target_channel_id)
            except (discord.NotFound, discord.Forbidden, Exception) as exc:
                logger.debug("Failed to fetch channel %s: %s", target_channel_id, exc)
    elif isinstance(channel_id, str) and channel_id.strip():
        # Match by channel name
        c_name = channel_id.strip().lstrip("#").lower()
        for ch in guild.channels:
            if getattr(ch, "name", "").lower() == c_name:
                target_channel = ch
                break
        if not target_channel:
            for th in guild.threads:
                if th.name.lower() == c_name:
                    target_channel = th
                    break

    # If no target channel was found, try context channel
    if not target_channel:
        target_channel = _context.get("discord_channel")
        if not target_channel:
            ctx_ch_id = _context.get("channel_id") or _context.get("thread_id") or _context.get("source_channel_id")
            if ctx_ch_id:
                target_channel = guild.get_channel(ctx_ch_id) or guild.get_thread(ctx_ch_id)

    # Permission verification
    bot_member = guild.me
    is_http_api = bool(_context.get("is_http_api"))
    requesting_user_id = _context.get("user_id")
    requesting_member = guild.get_member(requesting_user_id) if requesting_user_id else None
    if not requesting_member and requesting_user_id:
        try:
            requesting_member = await guild.fetch_member(requesting_user_id)
        except Exception:
            pass

    # Parse and resolve emojis
    resolved_emojis = parse_emoji_inputs(emoji=emoji, emojis=emojis, guild=guild)
    if not resolved_emojis:
        return {"error": "emoji or emojis is required to attach reactions (e.g. '🐝' or '👍')"}

    # Attempt to fetch the target message
    target_message: discord.Message | None = None
    if target_channel:
        ok, perm_err = check_channel_access(target_channel, bot_member, requesting_member, is_http_api=is_http_api)
        if not ok:
            return {"error": perm_err}
        try:
            target_message = await target_channel.fetch_message(target_message_id)
        except discord.NotFound:
            # If not found in current channel and channel_id wasn't explicitly given, we can look elsewhere
            if not target_channel_id:
                target_message = None
            else:
                return {
                    "error": f"Message {target_message_id} not found in channel '{getattr(target_channel, 'name', target_channel.id)}'."
                }
        except discord.Forbidden:
            return {
                "error": f"No permission to read message {target_message_id} in channel '{getattr(target_channel, 'name', target_channel.id)}'."
            }
        except Exception as exc:
            return {"error": f"Failed to fetch message {target_message_id}: {exc}"}

    # If message was not found in default channel and no channel was explicitly requested,
    # search active threads and text channels the caller and bot have access to
    if not target_message and not target_channel_id:
        search_channels = [
            c for c in guild.text_channels if check_channel_access(c, bot_member, requesting_member, is_http_api)[0]
        ]
        search_channels.extend(
            [t for t in guild.threads if check_channel_access(t, bot_member, requesting_member, is_http_api)[0]]
        )
        for cand_ch in search_channels:
            try:
                target_message = await cand_ch.fetch_message(target_message_id)
                target_channel = cand_ch
                break
            except (discord.NotFound, discord.Forbidden):
                continue
            except Exception:
                continue

    if not target_message or not target_channel:
        return {
            "error": (
                f"Message {target_message_id} could not be found. "
                "Please specify channel_id or provide the full message link."
            )
        }

    # Re-verify permissions for the channel the message was actually found in
    ok, perm_err = check_channel_access(target_channel, bot_member, requesting_member, is_http_api=is_http_api)
    if not ok:
        return {"error": perm_err}

    # Attach / remove reactions
    applied, failed = await attach_reactions(
        target_message,
        resolved_emojis,
        action=action,
        bot_member=bot_member,
    )

    if not applied and failed:
        return {
            "error": f"Failed to {action} reactions: {', '.join(failed)}. Verify the emoji is valid and accessible.",
            "failed_emojis": failed,
        }

    return {
        "success": True,
        "action": action,
        "message_id": target_message.id,
        "channel_id": target_channel.id,
        "channel_name": getattr(target_channel, "name", str(target_channel.id)),
        "reactions": applied,
        "failed_reactions": failed if failed else None,
        "message_url": target_message.jump_url,
    }
