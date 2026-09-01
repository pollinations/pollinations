"""Discord-backed OpenAI-compatible human responses."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import re
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
_MAX_DISCORD_CONTENT = 1_900


class HumanReply(Protocol):
    content: str


class HumanGateway(Protocol):
    async def create_thread(self) -> int: ...

    async def ask(self, thread_id: int, messages: list[dict], timeout: float) -> HumanReply: ...


class DiscordHumanGateway:
    def __init__(self, bot: discord.Client, guild_id: int, channel_id: int):
        self.bot = bot
        self.guild_id = guild_id
        self.channel_id = channel_id

    async def create_thread(self) -> int:
        if not self.bot.is_ready():
            raise RuntimeError("Discord bot is not ready")
        guild = self.bot.get_guild(self.guild_id)
        channel = guild and guild.get_channel(self.channel_id)
        if not isinstance(channel, discord.TextChannel):
            raise RuntimeError("Human model channel is unavailable")
        thread = await channel.create_thread(
            name=f"human-{uuid4_hex()[:12]}",
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


class HumanService:
    def __init__(self, api_token: str, database_path: Path, gateway: HumanGateway, response_timeout: float):
        self.api_token = api_token
        self.database_path = database_path
        self.gateway = gateway
        self.response_timeout = response_timeout
        self.database: aiosqlite.Connection | None = None

    async def start(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.database = await aiosqlite.connect(self.database_path)
        await self.database.execute("PRAGMA journal_mode = WAL")
        await self.database.execute(
            """
            CREATE TABLE IF NOT EXISTS human_history (
                caller_id TEXT NOT NULL,
                history_hash TEXT NOT NULL,
                thread_id INTEGER NOT NULL,
                PRIMARY KEY (caller_id, history_hash)
            ) STRICT
            """
        )
        await self.database.commit()

    async def close(self) -> None:
        if self.database:
            await self.database.close()
            self.database = None

    def authorize(self, authorization: str) -> None:
        prefix = "Bearer "
        if not authorization.startswith(prefix) or not hmac.compare_digest(
            authorization[len(prefix) :], self.api_token
        ):
            raise PermissionError("Unauthorized")

    async def complete(
        self,
        *,
        caller_id: str,
        messages: list[dict],
        max_tokens: int | None,
        max_completion_tokens: int | None,
    ) -> dict:
        if not self.database:
            raise RuntimeError("Human model is not configured")

        thread_id = await self._thread_id_for_history(caller_id, messages[:-1]) if len(messages) > 1 else None
        if thread_id is not None:
            prompt = [messages[-1]]
        else:
            thread_id = await self.gateway.create_thread()
            prompt = messages

        reply = await self.gateway.ask(thread_id, prompt, self.response_timeout)

        limit_values = [value for value in (max_tokens, max_completion_tokens) if value is not None]
        limit = min(limit_values) if limit_values else None
        answer, completion_tokens, truncated = truncate_tokens(reply.content.strip(), limit)
        prompt_tokens = count_prompt_tokens(messages)
        await self.database.execute(
            """
            INSERT INTO human_history (caller_id, history_hash, thread_id)
            VALUES (?, ?, ?)
            ON CONFLICT (caller_id, history_hash) DO UPDATE SET thread_id = excluded.thread_id
            """,
            (
                caller_id,
                transcript_hash([*messages, {"role": "assistant", "content": answer}]),
                thread_id,
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

    async def _thread_id_for_history(self, caller_id: str, messages: list[dict]) -> int | None:
        assert self.database
        async with self.database.execute(
            "SELECT thread_id FROM human_history WHERE caller_id = ? AND history_hash = ?",
            (caller_id, transcript_hash(messages)),
        ) as cursor:
            row = await cursor.fetchone()
        return int(row[0]) if row else None


def harden_content(content: str) -> str:
    content = _URL.sub("[link removed]", content)
    content = _MENTION.sub("[mention]", content)
    return discord.utils.escape_markdown(content)


def format_transcript(messages: list[dict]) -> list[str]:
    text = "\n\n".join(f"{message['role'].upper()}: {harden_content(message['content'])}" for message in messages)
    return [text[offset : offset + _MAX_DISCORD_CONTENT] for offset in range(0, len(text), _MAX_DISCORD_CONTENT)]


def count_prompt_tokens(messages: list[dict]) -> int:
    return 3 + sum(
        3 + len(encoding().encode(message["role"])) + len(encoding().encode(message["content"])) for message in messages
    )


def transcript_hash(messages: list[dict]) -> str:
    transcript = [[message["role"], message["content"]] for message in messages]
    serialized = json.dumps(transcript, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(serialized.encode()).hexdigest()


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
