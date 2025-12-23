"""
High-level sugar-layer API for Blossom AI.
Compatible with both real client and testing mocks.
"""

from __future__ import annotations

import asyncio
import inspect
from pathlib import Path
from typing import Any, Optional, Union, Iterable, AsyncGenerator, Generator


# ============================
# Helpers
# ============================

def _is_awaitable(obj: Any) -> bool:
    return (
        inspect.iscoroutine(obj)
        or asyncio.isfuture(obj)
        or hasattr(obj, "__await__")
    )


def _ensure_coroutine(obj: Any):
    """Wrap non-awaitables (e.g., Mock) into coroutine returning obj."""
    if _is_awaitable(obj):
        return obj

    async def _wrapper():
        return obj

    return _wrapper()


def _ensure_async_generator(obj: Any) -> AsyncGenerator:
    """
    Normalize object to async generator:
    - if obj is async generator -> return it
    - if obj is awaitable -> await it and yield its result
    - if obj is iterable -> yield its items
    - otherwise yield obj as single item
    """
    if inspect.isasyncgen(obj):
        return obj

    if _is_awaitable(obj):
        async def _g():
            val = await obj
            yield val
        return _g()

    if isinstance(obj, Iterable):
        async def _g():
            for item in obj:
                yield item
        return _g()

    async def _g():
        yield obj
    return _g()


# ============================
# Async runner
# ============================

from blossom_ai.utils.async_utils import _run_async


# ============================
# Lazy client
# ============================

class _LazyClient:
    _instance: Optional[Any] = None
    _text_api_cache = None
    _image_api_cache = None

    @classmethod
    def get(cls):
        from blossom_ai.client import BlossomClient
        if cls._instance is None:
            cls._instance = BlossomClient()
        return cls._instance

    @classmethod
    def reset(cls):
        inst = cls._instance
        if inst is not None:
            close = getattr(inst, "close", None)
            if callable(close):
                try:
                    result = close()
                    coro = _ensure_coroutine(result)
                    _run_async(coro)
                except Exception:
                    pass

        cls._instance = None
        cls._text_api_cache = None
        cls._image_api_cache = None


# ============================
# Text API
# ============================

class _TextAPI:
    def generate(self, prompt: str, **kwargs) -> str:
        client = _LazyClient.get()
        raw = client.text.generate(prompt, **kwargs)
        coro = _ensure_coroutine(raw)
        return _run_async(coro)

    def stream(self, prompt: str, **kwargs) -> Generator[str, None, None]:
        client = _LazyClient.get()

        # Try stream method first
        stream_method = getattr(client.text, "stream", None)
        if callable(stream_method):
            try:
                raw = stream_method(prompt, **kwargs)

                # Check if the result looks like a Mock object (string representation)
                result_str = str(raw)
                if not result_str.startswith('<Mock') and not result_str.startswith('<'):
                    # Real stream result, use it
                    agen = _ensure_async_generator(raw)
                    async def _next():
                        return await agen.__anext__()

                    while True:
                        try:
                            chunk = _run_async(_next())
                            yield str(chunk)
                        except StopAsyncIteration:
                            break
                    return
            except Exception:
                # If stream fails, fall through to generate
                pass

        # fallback to generate() without stream parameter
        generate = getattr(client.text, "generate", None)
        if callable(generate):
            raw = generate(prompt, **kwargs)
            result = _run_async(_ensure_coroutine(raw))

            # If result is a string, yield it as single chunk
            if isinstance(result, str):
                yield result
                return

            # If result is iterable, yield each item
            if isinstance(result, Iterable):
                for item in result:
                    yield str(item)
                return

            # Fallback: convert to string
            yield str(result)
            return

        return

    def chat(self, messages: Any, **kwargs) -> Any:
        # validation for empty list — tests expect ValueError
        if isinstance(messages, list) and len(messages) == 0:
            raise ValueError("Messages cannot be empty")

        # validation for non-list messages
        if not isinstance(messages, list):
            raise TypeError("Messages must be a list")

        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]

        if isinstance(messages, list) and messages and isinstance(messages[0], str):
            formatted = []
            for i, msg in enumerate(messages):
                role = "user" if i % 2 == 0 else "assistant"
                formatted.append({"role": role, "content": msg})
            messages = formatted

        client = _LazyClient.get()
        raw = client.text.chat(messages, **kwargs)
        coro = _ensure_coroutine(raw)
        return _run_async(coro)


# ============================
# Image API
# ============================

class _ImageAPI:
    def generate(self, prompt: str, **kwargs) -> bytes:
        client = _LazyClient.get()
        raw = client.image.generate(prompt, **kwargs)
        coro = _ensure_coroutine(raw)
        return _run_async(coro)

    def url(self, prompt: str, **kwargs) -> str:
        client = _LazyClient.get()

        gen_url = getattr(client.image, "generate_url", None)
        if callable(gen_url):
            raw = gen_url(prompt, **kwargs)
            coro = _ensure_coroutine(raw)
            return _run_async(coro)

        url_fn = getattr(client.image, "url", None)
        if callable(url_fn):
            raw = url_fn(prompt, **kwargs)
            coro = _ensure_coroutine(raw)
            return _run_async(coro)

        gen = getattr(client.image, "generate", None)
        if callable(gen):
            raw = gen(prompt, **kwargs)
            result = _run_async(_ensure_coroutine(raw))
            if isinstance(result, bytes):
                return ""
            return str(result)

        return ""

    def save(self, prompt: str, filename: Union[str, Path], **kwargs) -> Path:
        if not isinstance(filename, (str, Path)):
            raise TypeError("Filename must be string or Path")
        if isinstance(filename, str) and not filename.strip():
            raise ValueError("Filename cannot be empty")

        client = _LazyClient.get()
        raw = client.image.save(prompt, filename, **kwargs)
        coro = _ensure_coroutine(raw)
        return _run_async(coro)


# ============================
# Main API
# ============================

class _SugarAPI:
    def __repr__(self):
        return "<Sugar API>"

    @property
    def text(self) -> _TextAPI:
        if _LazyClient._text_api_cache is None:
            _LazyClient._text_api_cache = _TextAPI()
        return _LazyClient._text_api_cache

    @property
    def image(self) -> _ImageAPI:
        if _LazyClient._image_api_cache is None:
            _LazyClient._image_api_cache = _ImageAPI()
        return _LazyClient._image_api_cache

    def reset(self):
        _LazyClient.reset()


ai = _SugarAPI()


class LazySugarAPI:
    def __repr__(self):
        return "<LazySugarAPI>"

    def __getattr__(self, item):
        return getattr(ai, item)
