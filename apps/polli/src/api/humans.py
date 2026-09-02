"""Discord-backed OpenAI-compatible human responses."""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import re
import sys
import time
from functools import cache
from pathlib import Path
from typing import Protocol

import aiosqlite
import tiktoken

import discord

from ..utils.uuid import uuid4_hex

_URL = re.compile(r"https?://\S+", re.IGNORECASE)
_MENTION = re.compile(r"<[@#][!&]?\d+>")
_WEB_SEARCH_CONTEXT = re.compile(r"^\s*<details><summary>Web search:", re.IGNORECASE)
_MAX_DISCORD_CONTENT = 1_900
_DISCORD_PREVIEW_EDGE = 280
_MAX_THREAD_NAME = 100
_THREAD_CLEANUP_INTERVAL = 60
_THREAD_INACTIVE_SECONDS = 5 * 60

logger = logging.getLogger(__name__)


class HumanReply(Protocol):
    content: str


class HumanGateway(Protocol):
    async def create_thread(self, name: str) -> int: ...

    async def ask(self, thread_id: int, messages: list[dict], timeout: float) -> HumanReply: ...

    async def delete_inactive_threads(self, inactive_for: float) -> None: ...


class DiscordHumanGateway:
    def __init__(self, bot: discord.Client, guild_id: int, channel_id: int):
        self.bot = bot
        self.guild_id = guild_id
        self.channel_id = channel_id

    async def create_thread(self, name: str) -> int:
        if not self.bot.is_ready():
            raise RuntimeError("Discord bot is not ready")
        guild = self.bot.get_guild(self.guild_id)
        channel = guild and guild.get_channel(self.channel_id)
        if not isinstance(channel, discord.TextChannel):
            raise RuntimeError("Human model channel is unavailable")
        thread = await channel.create_thread(
            name=name,
            type=discord.ChannelType.public_thread,
            auto_archive_duration=60,
            reason="Human community model conversation",
        )
        return thread.id

    async def ask(self, thread_id: int, messages: list[dict], timeout: float) -> discord.Message:
        channel = self.bot.get_channel(thread_id)
        if not isinstance(channel, discord.Thread):
            channel = await self.bot.fetch_channel(thread_id)
        if not isinstance(channel, discord.Thread):
            raise RuntimeError("Human model conversation is unavailable")

        last_prompt: discord.Message | None = None
        for content in format_transcript(messages):
            last_prompt = await channel.send(
                content,
                allowed_mentions=discord.AllowedMentions.none(),
                suppress_embeds=True,
            )
        if last_prompt is None:
            raise RuntimeError("Human model prompt is empty")

        await notify_local_request(messages)

        def eligible(message: discord.Message) -> bool:
            return (
                message.channel.id == channel.id
                and not message.author.bot
                and message.webhook_id is None
                and not message.is_system()
                and bool(message.content.strip())
                and not message.attachments
                and not message.stickers
            )

        waiter = asyncio.create_task(self.bot.wait_for("message", check=eligible, timeout=timeout))
        async for message in channel.history(limit=100, after=last_prompt, oldest_first=True):
            if eligible(message):
                waiter.cancel()
                return message
        return await waiter

    async def delete_inactive_threads(self, inactive_for: float) -> None:
        if not self.bot.is_ready() or self.bot.user is None:
            return
        guild = self.bot.get_guild(self.guild_id)
        channel = guild and guild.get_channel(self.channel_id)
        if not isinstance(channel, discord.TextChannel):
            return

        now = discord.utils.utcnow()
        for thread in channel.threads:
            if thread.owner_id != self.bot.user.id:
                continue
            last_activity = discord.utils.snowflake_time(thread.last_message_id or thread.id)
            if (now - last_activity).total_seconds() < inactive_for:
                continue
            try:
                await thread.delete(reason="Human model thread inactive for five minutes")
            except (discord.Forbidden, discord.HTTPException) as error:
                logger.warning("Failed to delete inactive human thread %s: %s", thread.id, error)


class HumanService:
    def __init__(self, api_token: str, database_path: Path, gateway: HumanGateway, response_timeout: float):
        self.api_token = api_token
        self.database_path = database_path
        self.gateway = gateway
        self.response_timeout = response_timeout
        self.database: aiosqlite.Connection | None = None
        self.cleanup_task: asyncio.Task | None = None

    async def start(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.database = await aiosqlite.connect(self.database_path)
        await self.database.execute("PRAGMA journal_mode = WAL")
        await self.database.execute(
            """
            CREATE TABLE IF NOT EXISTS human_conversations (
                transcript TEXT PRIMARY KEY,
                thread_id INTEGER NOT NULL,
                message_count INTEGER NOT NULL,
                updated_at REAL NOT NULL
            ) STRICT
            """
        )
        await self.database.commit()
        self.cleanup_task = asyncio.create_task(self._cleanup_inactive_threads())

    async def close(self) -> None:
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
            self.cleanup_task = None
        if self.database:
            await self.database.close()
            self.database = None

    async def _cleanup_inactive_threads(self) -> None:
        while True:
            await asyncio.sleep(_THREAD_CLEANUP_INTERVAL)
            try:
                await self.gateway.delete_inactive_threads(_THREAD_INACTIVE_SECONDS)
            except Exception:
                logger.exception("Failed to clean up inactive human model threads")

    def authorize(self, authorization: str) -> None:
        prefix = "Bearer "
        if not authorization.startswith(prefix) or not hmac.compare_digest(
            authorization[len(prefix) :], self.api_token
        ):
            raise PermissionError("Unauthorized")

    async def complete(
        self,
        *,
        messages: list[dict],
        max_tokens: int | None,
        max_completion_tokens: int | None,
    ) -> dict:
        if not self.database:
            raise RuntimeError("Human model is not configured")

        match = await self._thread_for_messages(messages)
        if match is None:
            thread_id = await self.gateway.create_thread(conversation_thread_name(messages))
            prompt = messages
        else:
            thread_id, prompt_start = match
            prompt = messages[prompt_start:]

        reply = await self.gateway.ask(thread_id, prompt, self.response_timeout)

        limit_values = [value for value in (max_tokens, max_completion_tokens) if value is not None]
        limit = min(limit_values) if limit_values else None
        answer, completion_tokens, truncated = truncate_tokens(reply.content.strip(), limit)
        prompt_tokens = count_prompt_tokens(messages)
        await self.database.execute(
            """
            INSERT INTO human_conversations
                (transcript, thread_id, message_count, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (transcript) DO UPDATE SET
                thread_id = excluded.thread_id,
                updated_at = excluded.updated_at
            """,
            (
                serialize_identity([*messages, {"role": "assistant", "content": answer}]),
                thread_id,
                len(conversation_identity(messages)) + 1,
                time.time(),
            ),
        )
        await self.database.commit()
        return {
            "id": f"chatcmpl-human-{uuid4_hex()}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "humans",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": answer},
                    "finish_reason": "length" if truncated else "stop",
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }

    async def _thread_for_messages(self, messages: list[dict]) -> tuple[int, int] | None:
        assert self.database
        identity = conversation_identity(messages)
        if not identity:
            return None

        async with self.database.execute(
            """
            SELECT thread_id, transcript
            FROM human_conversations
            WHERE message_count < ?
            ORDER BY message_count DESC, updated_at DESC
            """,
            (len(identity),),
        ) as cursor:
            async for thread_id, transcript in cursor:
                stored = json.loads(transcript)
                if identity[: len(stored)] == stored:
                    return int(thread_id), identity_source_end(messages, len(stored))
        return None


def harden_content(content: str) -> str:
    content = _URL.sub("[link removed]", content)
    content = _MENTION.sub("[mention]", content)
    return discord.utils.escape_markdown(content)


def conversation_thread_name(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message["role"] != "user" or _WEB_SEARCH_CONTEXT.match(message["content"]):
            continue
        name = " ".join(message["content"].split())
        if name:
            return name[:_MAX_THREAD_NAME]
    return f"human-{uuid4_hex()[:12]}"


def discord_preview(content: str) -> str:
    if len(content) <= _DISCORD_PREVIEW_EDGE * 2:
        return content
    return f"{content[:_DISCORD_PREVIEW_EDGE]}\n...\n{content[-_DISCORD_PREVIEW_EDGE:]}"


def format_transcript(messages: list[dict]) -> list[str]:
    text = "\n\n".join(
        f"{message['role'].upper()}: {harden_content(discord_preview(message['content']))}" for message in messages
    )
    return [text[offset : offset + _MAX_DISCORD_CONTENT] for offset in range(0, len(text), _MAX_DISCORD_CONTENT)]


async def notify_local_request(messages: list[dict]) -> None:
    """Show a native notification when the adapter is running on macOS."""
    if sys.platform != "darwin":
        return
    environment = {**os.environ, "HUMANS_API_NOTIFICATION": conversation_thread_name(messages)}
    process = await asyncio.create_subprocess_exec(
        "/usr/bin/osascript",
        "-e",
        'display notification (system attribute "HUMANS_API_NOTIFICATION") with title "Humans API request"',
        env=environment,
    )
    await process.wait()


def count_prompt_tokens(messages: list[dict]) -> int:
    return 3 + sum(
        3 + len(encoding().encode(message["role"])) + len(encoding().encode(message["content"])) for message in messages
    )


def conversation_identity(messages: list[dict]) -> list[list[str]]:
    identity = []
    for message in messages:
        role = message["role"]
        content = message["content"].replace("\r\n", "\n").strip()
        if role not in {"assistant", "user"} or not content:
            continue
        if role == "user" and _WEB_SEARCH_CONTEXT.match(content):
            continue
        identity.append([role, content])
    return identity


def identity_source_end(messages: list[dict], identity_length: int) -> int:
    seen = 0
    for index, message in enumerate(messages):
        if conversation_identity([message]):
            seen += 1
            if seen == identity_length:
                return index + 1
    return 0


def serialize_identity(messages: list[dict]) -> str:
    return json.dumps(conversation_identity(messages), ensure_ascii=False, separators=(",", ":"))


def truncate_tokens(text: str, limit: int | None) -> tuple[str, int, bool]:
    tokens = encoding().encode(text)
    if limit is None or len(tokens) <= limit:
        return text, len(tokens), False
    return encoding().decode(tokens[:limit]), limit, True


def stream_completion(completion: dict):
    """Wrap a completed human reply in OpenAI-compatible SSE events."""
    choice = completion["choices"][0]
    base = {
        "id": completion["id"],
        "object": "chat.completion.chunk",
        "created": completion["created"],
        "model": completion["model"],
    }
    events = [
        {**base, "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]},
        {
            **base,
            "choices": [{"index": 0, "delta": {"content": choice["message"]["content"]}, "finish_reason": None}],
        },
        {
            **base,
            "choices": [{"index": 0, "delta": {}, "finish_reason": choice["finish_reason"]}],
        },
        {**base, "choices": [], "usage": completion["usage"]},
    ]
    for event in events:
        yield f"data: {json.dumps(event, separators=(',', ':'))}\n\n"
    yield "data: [DONE]\n\n"


@cache
def encoding():
    return tiktoken.get_encoding("cl100k_base")
