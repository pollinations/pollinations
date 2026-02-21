# blossom_ai/core/models.py

"""
Blossom AI – Models and Enums
Dynamic model discovery with caching and LRU eviction.
Uses endpoints from config. No hardcoded URLs.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import List, Optional, Set, NamedTuple, Final, Any, ClassVar
from collections import OrderedDict

from blossom_ai.core.config import ENDPOINTS
from blossom_ai.core.session_manager import get_sync_session, get_async_session

logger = logging.getLogger("blossom_ai")


# --------------------------------------------------------------------------- #
# Model info
# --------------------------------------------------------------------------- #

class ModelInfo(NamedTuple):
    """Model metadata from API."""
    name: str
    aliases: List[str]
    description: Optional[str] = None
    tier: Optional[str] = None

    @property
    def all_identifiers(self) -> Set[str]:
        """All valid names for this model."""
        return {self.name, *self.aliases}


# --------------------------------------------------------------------------- #
# Cache layer with LRU eviction and configurable limits
# --------------------------------------------------------------------------- #

class _ModelCache:

    ttl: Final = 14400  # 4 hours
    DEFAULT_MAX_SIZE: Final = 1000

    def __init__(self, max_size: Optional[int] = None) -> None:
        self.max_size = max_size or self.DEFAULT_MAX_SIZE
        self.known: OrderedDict[str, None] = OrderedDict()
        self.info: List[ModelInfo] = []
        self.initialized = False
        self.timestamp = 0.0
        self.sync_lock = threading.RLock()  # FIXED: Use RLock for reentrancy
        self._async_lock: Optional[Any] = None
        self._cleanup_scheduled = False

    @property
    def async_lock(self) -> Any:

        if self._async_lock is None:
            try:
                self._async_lock = asyncio.Lock()
            except RuntimeError:
                # No event loop running (e.g., during import)
                class DummyAsyncLock:
                    async def __aenter__(self): return self

                    async def __aexit__(self, *args): pass

                self._async_lock = DummyAsyncLock()
        return self._async_lock

    def is_valid(self) -> bool:
        """Check if cache is fresh and not expired."""
        return self.initialized and (time.time() - self.timestamp) < self.ttl

    def _add_known_unsafe(self, name: str) -> bool:

        if not name or not isinstance(name, str):
            return False

        # Move to end if exists (MRU)
        if name in self.known:
            self.known.move_to_end(name)  # O(1) operation in Python 3.2+
            return True

        # Evict oldest if at capacity
        if len(self.known) >= self.max_size:
            oldest = next(iter(self.known))
            self.known.pop(oldest)
            logger.warning(f"Model cache full, evicted: {oldest}")

        self.known[name] = None
        return True

    def add_known(self, name: str) -> bool:
        """Thread-safe add model name."""
        with self.sync_lock:
            return self._add_known_unsafe(name)

    def reset(self) -> None:

        with self.sync_lock:
            self.known.clear()
            self.info.clear()
            self.initialized = False
            self.timestamp = 0.0
            self._cleanup_scheduled = False
            logger.debug("Model cache reset")

    def schedule_cleanup(self) -> None:

        if self._cleanup_scheduled:
            return

        self._cleanup_scheduled = True
        # Cleanup runs in background
        threading.Thread(target=self._cleanup_thread, daemon=True).start()

    def _cleanup_thread(self) -> None:
        """
        Background thread for periodic cleanup.

        Runs every half TTL to check for expired entries.
        """
        while True:
            time.sleep(self.ttl / 2)  # Check every half TTL
            if not self.initialized:
                continue

            if time.time() - self.timestamp > self.ttl:
                logger.debug("Model cache expired, scheduling refresh")
                # Cache will be refreshed on next access


# --------------------------------------------------------------------------- #
# Base dynamic model class
# --------------------------------------------------------------------------- #

class DynamicModel:

    _cache: ClassVar[_ModelCache] = _ModelCache()
    _max_cache_size: ClassVar[Optional[int]] = None

    @classmethod
    def configure_cache(cls, max_size: int) -> None:
        """
        Set max cache size. Must be called before first use.

        Args:
            max_size: Maximum number of models to cache

        Raises:
            ValueError: If max_size <= 0
        """
        if max_size <= 0:
            raise ValueError("max_size must be positive")
        cls._max_cache_size = max_size
        cls._cache = _ModelCache(max_size)

    @classmethod
    def get_defaults(cls) -> List[str]:
        """Default models when API is unavailable."""
        raise NotImplementedError

    @classmethod
    def get_api_endpoints(cls) -> List[str]:
        """API endpoints to fetch models from. Uses ENDPOINTS from config.py."""
        raise NotImplementedError

    # ---------- Sync fetch ----------
    @classmethod
    def _fetch_models(cls, endpoint: str, api_token: Optional[str] = None) -> List[ModelInfo]:

        try:
            with get_sync_session() as session:
                headers = {}
                if api_token:
                    headers["Authorization"] = f"Bearer {api_token}"

                resp = session.get(endpoint, headers=headers, timeout=5)
                if resp.status_code != 200:
                    logger.debug(f"API {endpoint} returned {resp.status_code}")
                    return []

                return cls._parse(resp.json())
        except Exception as exc:
            logger.debug(f"Failed to fetch from {endpoint}: {exc}")
            return []

    # ---------- Async fetch ----------
    @classmethod
    async def _afetch_models(cls, endpoint: str, api_token: Optional[str] = None) -> List[ModelInfo]:
        try:
            async with get_async_session() as session:
                headers = {}
                if api_token:
                    headers["Authorization"] = f"Bearer {api_token}"

                async with session.get(endpoint, headers=headers, timeout=5) as resp:
                    if resp.status != 200:
                        logger.debug(f"API {endpoint} returned {resp.status}")
                        return []

                    data = await resp.json()
                    return cls._parse(data)
        except Exception as exc:
            logger.debug(f"Async fetch failed from {endpoint}: {exc}")
            return []

    # ---------- Parse response ----------
    @staticmethod
    def _parse(data: list) -> List[ModelInfo]:
        models: List[ModelInfo] = []

        if not isinstance(data, list):
            logger.warning(f"Expected list from API, got {type(data)}")
            return models

        for item in data:
            try:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("id") or item.get("model")
                    if not name or not isinstance(name, str):
                        continue

                    aliases = item.get("aliases", [])
                    if not isinstance(aliases, list):
                        aliases = []

                    models.append(ModelInfo(
                        name=name,
                        aliases=aliases,
                        description=item.get("description"),
                        tier=item.get("tier"),
                    ))
                elif isinstance(item, str):
                    models.append(ModelInfo(name=item, aliases=[]))
            except Exception as e:
                logger.debug(f"Skipping malformed model item: {e}")

        return models

    # ---------- Initialization ----------
    @classmethod
    def _ensure_initialized(cls, api_token: Optional[str] = None, force: bool = False) -> bool:
        cache = cls._cache

        # Quick check without lock
        if not force and cache.is_valid():
            return True

        # Double-checked locking
        with cache.sync_lock:
            if not force and cache.is_valid():
                return True

            # Load defaults first
            if not cache.initialized:
                for model in cls.get_defaults():
                    cache._add_known_unsafe(model)

            # Try to fetch from API
            endpoints = cls.get_api_endpoints()
            all_models: List[ModelInfo] = []

            for ep in endpoints:
                all_models.extend(cls._fetch_models(ep, api_token))

            if all_models:
                cache.info = all_models
                for m in all_models:
                    cache._add_known_unsafe(m.name)
                    for alias in m.aliases:
                        cache._add_known_unsafe(alias)
                cache.timestamp = time.time()
                cache.initialized = True
                logger.info(f"Initialized {cls.__name__} with {len(all_models)} models via API")
                cache.schedule_cleanup()
                return True
            else:
                # Fallback to defaults only
                cache.timestamp = time.time()
                cache.initialized = True
                logger.warning(f"Using fallback defaults for {cls.__name__} (API unavailable)")
                cache.schedule_cleanup()
                return False

    @classmethod
    async def _aensure_initialized(cls, api_token: Optional[str] = None, force: bool = False) -> bool:
        cache = cls._cache

        if not force and cache.is_valid():
            return True

        async with cache.async_lock:
            # Double-check after acquiring lock
            if not force and cache.is_valid():
                return False

            # Load defaults
            with cache.sync_lock:
                if not cache.initialized:
                    for model in cls.get_defaults():
                        cache._add_known_unsafe(model)

            endpoints = cls.get_api_endpoints()
            all_models: List[ModelInfo] = []

            for ep in endpoints:
                all_models.extend(await cls._afetch_models(ep, api_token))

            if all_models:
                with cache.sync_lock:
                    cache.info = all_models
                    for m in all_models:
                        cache._add_known_unsafe(m.name)
                        for alias in m.aliases:
                            cache._add_known_unsafe(alias)
                    cache.timestamp = time.time()
                    cache.initialized = True
                logger.info(f"Async initialized {cls.__name__} with {len(all_models)} models")
                cache.schedule_cleanup()
                return True
            else:
                with cache.sync_lock:
                    cache.timestamp = time.time()
                    cache.initialized = True
                logger.warning(f"Async using fallback defaults for {cls.__name__}")
                cache.schedule_cleanup()
                return False

    # ---------- Public API ----------
    @classmethod
    def from_string(cls, value: str) -> str:
        """
        Validate and register model name.

        Args:
            value: Model name to validate

        Returns:
            Validated model name

        Raises:
            ValueError: If value is not a valid string
        """
        if not isinstance(value, str):
            raise ValueError("Model name must be a string")
        value = value.strip()
        if not value:
            raise ValueError("Model name cannot be empty")

        cls._ensure_initialized()
        cls._cache.add_known(value)
        return value

    @classmethod
    async def afrom_string(cls, value: str) -> str:
        """
        Async validate and register model name.

        Args:
            value: Model name to validate

        Returns:
            Validated model name

        Raises:
            ValueError: If value is not a valid string
        """
        if not isinstance(value, str):
            raise ValueError("Model name must be a string")
        value = value.strip()
        if not value:
            raise ValueError("Model name cannot be empty")

        await cls._aensure_initialized()
        cls._cache.add_known(value)
        return value

    @classmethod
    def get_all_known(cls) -> List[str]:
        """Get all known model names."""
        cls._ensure_initialized()
        all_models = set(cls.get_defaults()) | set(cls._cache.known.keys())
        return sorted(all_models)

    @classmethod
    async def aget_all_known(cls) -> List[str]:
        """Async get all known model names."""
        await cls._aensure_initialized()
        all_models = set(cls.get_defaults()) | set(cls._cache.known.keys())
        return sorted(all_models)

    @classmethod
    def get_model_info(cls, name: str) -> Optional[ModelInfo]:
        """Get detailed info for a model."""
        cls._ensure_initialized()
        for m in cls._cache.info:
            if name in m.all_identifiers:
                return m
        return None

    @classmethod
    async def aget_model_info(cls, name: str) -> Optional[ModelInfo]:
        """Async get detailed info for a model."""
        await cls._aensure_initialized()
        for m in cls._cache.info:
            if name in m.all_identifiers:
                return m
        return None

    @classmethod
    def is_known(cls, name: str) -> bool:
        """Check if model is known."""
        cls._ensure_initialized()
        return name in cls._cache.known or name in cls.get_defaults()

    @classmethod
    async def ais_known(cls, name: str) -> bool:
        """Async check if model is known."""
        await cls._aensure_initialized()
        return name in cls._cache.known or name in cls.get_defaults()

    @classmethod
    def reset(cls) -> None:
        """
        Reset cache completely (for testing).
        Ensures clean state between tests.
        """
        cls._cache.reset()


# --------------------------------------------------------------------------- #
# Concrete model classes
# --------------------------------------------------------------------------- #

class TextModel(DynamicModel):
    """Text generation models."""

    @classmethod
    def get_defaults(cls) -> List[str]:
        return [
            "openai", "openai-fast", "openai-large", "openai-reasoning",
            "deepseek", "gemini", "gemini-search", "mistral", "mistral-fast",
            "claude", "claude-large", "qwen-coder", "grok",
            "perplexity-fast", "perplexity-reasoning", "searchgpt",
        ]

    @classmethod
    def get_api_endpoints(cls) -> List[str]:
        """Use endpoint from config.py."""
        return [ENDPOINTS.TEXT_MODELS]


class ImageModel(DynamicModel):
    """Image generation models."""

    @classmethod
    def get_defaults(cls) -> List[str]:
        return ["flux", "turbo", "gptimage", "seedream", "kontext", "nanobanana"]

    @classmethod
    def get_api_endpoints(cls) -> List[str]:
        """Use endpoint from config.py."""
        return [ENDPOINTS.IMAGE_MODELS]


# --------------------------------------------------------------------------- #
# Public constants for backward compatibility with generators
# --------------------------------------------------------------------------- #

DEFAULT_TEXT_MODELS = TextModel.get_defaults()
DEFAULT_IMAGE_MODELS = ImageModel.get_defaults()