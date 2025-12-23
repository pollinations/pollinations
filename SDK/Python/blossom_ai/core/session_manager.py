# blossom_ai/core/session_manager.py
"""
Blossom AI — Session Manager
"""

from __future__ import annotations

import asyncio
import threading
import weakref
from contextlib import asynccontextmanager, contextmanager
from typing import Dict, Optional, ClassVar, Final

import aiohttp
import requests

from blossom_ai.core.config import SessionConfig


# --------------------------------------------------------------------------- #
# Sync manager — thread-local sessions
# --------------------------------------------------------------------------- #

class SyncSessionManager:
    __slots__ = ("_thread_sessions", "_lock", "_config", "_closed", "_initialized")
    _INSTANCES: ClassVar[threading.local] = threading.local()

    def __new__(cls, config: SessionConfig) -> SyncSessionManager:
        if not hasattr(cls._INSTANCES, "data"):
            cls._INSTANCES.data = {}
        key = id(config)
        if key not in cls._INSTANCES.data:
            cls._INSTANCES.data[key] = super().__new__(cls)
        return cls._INSTANCES.data[key]

    def __init__(self, config: SessionConfig) -> None:
        if hasattr(self, "_initialized"):
            return
        self._config = config
        self._thread_sessions: Dict[int, requests.Session] = {}
        self._lock = threading.Lock()
        self._closed = False
        self._initialized = True

    def _create_session(self) -> requests.Session:
        """Create configured requests session."""
        cfg = self._config

        adapter = requests.adapters.HTTPAdapter(
            pool_connections=cfg.sync_pool_connections,
            pool_maxsize=cfg.sync_pool_maxsize,
            max_retries=0,
            pool_block=cfg.sync_pool_block,
        )
        session = requests.Session()
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        session.headers["User-Agent"] = cfg.user_agent
        session.headers["Connection"] = "keep-alive"
        session.verify = cfg.ssl

        return session

    def get_session(self) -> requests.Session:
        """Get or create thread-local session (ИСПРАВЛЕНО)."""
        if self._closed:
            raise RuntimeError("SyncSessionManager is closed")

        thread_id = threading.get_ident()

        if thread_id not in self._thread_sessions:
            with self._lock:
                # Double-check после захвата лока
                if thread_id not in self._thread_sessions:
                    self._thread_sessions[thread_id] = self._create_session()

        return self._thread_sessions[thread_id]

    def close(self) -> None:
        """Close all sessions and cleanup resources."""
        with self._lock:
            if self._closed:
                return
            for session in self._thread_sessions.values():
                session.close()
            self._thread_sessions.clear()
            self._closed = True

    def is_closed(self) -> bool:
        return self._closed

    def __enter__(self) -> SyncSessionManager:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


# --------------------------------------------------------------------------- #
# Async manager — per-event-loop singleton
# --------------------------------------------------------------------------- #

class AsyncSessionManager:
    __slots__ = ("_sessions", "_connectors", "_lock", "_config", "_closed", "_initialized")
    _INSTANCES: ClassVar[Dict[int, AsyncSessionManager]] = {}

    def __new__(cls, config: SessionConfig) -> AsyncSessionManager:
        key = id(config)
        if key not in cls._INSTANCES:
            cls._INSTANCES[key] = super().__new__(cls)
        return cls._INSTANCES[key]

    def __init__(self, config: SessionConfig) -> None:
        if hasattr(self, "_initialized"):
            return
        self._config = config
        self._sessions: Dict[int, aiohttp.ClientSession] = {}
        self._connectors: Dict[int, aiohttp.TCPConnector] = {}
        self._lock = asyncio.Lock()
        self._closed = False
        self._initialized = True

    async def _create_session(self, loop: asyncio.AbstractEventLoop) -> aiohttp.ClientSession:
        """Create aiohttp session for specific event loop."""
        cfg = self._config
        connector = aiohttp.TCPConnector(
            limit=cfg.async_limit_total,
            limit_per_host=cfg.async_limit_per_host,
            ttl_dns_cache=cfg.async_ttl_dns_cache,
            ssl=cfg.ssl,
            use_dns_cache=True,
        )

        session = aiohttp.ClientSession(
            connector=connector,
            headers={"User-Agent": cfg.user_agent},
            timeout=aiohttp.ClientTimeout(
                connect=cfg.async_timeout_connect,
                sock_read=cfg.async_timeout_sock_read,
            ),
        )

        self._connectors[id(loop)] = connector

        return session

    async def get_session(self) -> aiohttp.ClientSession:
        """Get or create session for CURRENT event loop."""
        if self._closed:
            raise RuntimeError("AsyncSessionManager is closed")

        loop = asyncio.get_running_loop()
        loop_id = id(loop)

        session = self._sessions.get(loop_id)
        if session and self._is_alive(session):
            return session

        async with self._lock:
            session = self._sessions.get(loop_id)
            if session and self._is_alive(session):
                return session

            new_session = await self._create_session(loop)
            self._sessions[loop_id] = new_session
            return new_session

    @staticmethod
    def _is_alive(session: aiohttp.ClientSession) -> bool:
        return not session.closed and bool(session.connector and not session.connector.closed)

    async def close(self) -> None:
        """Close all sessions and cleanup resources."""
        if self._closed:
            return

        async with self._lock:
            for connector in self._connectors.values():
                if not connector.closed:
                    await connector.close()

            for session in self._sessions.values():
                if not session.closed:
                    await session.close()

            self._sessions.clear()
            self._connectors.clear()
            self._closed = True

    def is_closed(self) -> bool:
        return self._closed

    async def __aenter__(self) -> AsyncSessionManager:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()


# --------------------------------------------------------------------------- #
# Convenience context managers
# --------------------------------------------------------------------------- #

@contextmanager
def get_sync_session(config: SessionConfig):
    """Get sync session as context manager."""
    mgr = SyncSessionManager(config)
    try:
        yield mgr.get_session()
    finally:
        pass


@asynccontextmanager
async def get_async_session(config: SessionConfig):
    """Get async session as context manager."""
    mgr = AsyncSessionManager(config)
    try:
        yield await mgr.get_session()
    finally:
        await mgr.close()