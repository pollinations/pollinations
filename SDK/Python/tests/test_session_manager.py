# tests/test_session_manager.py
"""Tests for session manager module."""

import pytest
import asyncio
import threading
from unittest.mock import Mock, patch
from blossom_ai.core.session_manager import (
    SyncSessionManager,
    AsyncSessionManager,
    get_sync_session,
    get_async_session,
)
from blossom_ai.core.config import SessionConfig


class TestSyncSessionManager:
    """Tests for SyncSessionManager."""

    def test_single_instance_per_config(self):
        """Test that same config returns same instance."""
        config = SessionConfig()
        manager1 = SyncSessionManager(config)
        manager2 = SyncSessionManager(config)
        assert manager1 is manager2

    def test_different_configs_different_instances(self):
        """Test that different configs return different instances."""
        config1 = SessionConfig(api_key="key1")
        config2 = SessionConfig(api_key="key2")
        manager1 = SyncSessionManager(config1)
        manager2 = SyncSessionManager(config2)
        assert manager1 is not manager2

    def test_create_session(self):
        """Test session creation with correct parameters."""
        config = SessionConfig(
            sync_pool_maxsize=50,
            sync_pool_connections=20,
            sync_pool_block=False,
            ssl=True
        )
        manager = SyncSessionManager(config)
        session = manager.get_session()

        assert session.headers["User-Agent"] == f"blossom-ai/{config.__version__}"
        assert session.verify is True

    def test_session_reuse(self):
        """Test that same session is reused."""
        config = SessionConfig()
        manager = SyncSessionManager(config)
        session1 = manager.get_session()
        session2 = manager.get_session()
        assert session1 is session2

    def test_close_session(self):
        """Test session close."""
        config = SessionConfig()
        manager = SyncSessionManager(config)
        session = manager.get_session()
        assert manager.is_closed() is False

        manager.close()
        assert manager.is_closed() is True
        assert manager._thread_sessions == {}

    def test_close_already_closed(self):
        """Test closing already closed manager doesn't error."""
        config = SessionConfig()
        manager = SyncSessionManager(config)
        manager.close()
        manager.close()  # Should not raise

    def test_context_manager(self):
        """Test context manager protocol."""
        config = SessionConfig()
        with SyncSessionManager(config) as manager:
            session = manager.get_session()
            assert session is not None
        assert manager.is_closed() is True

    def test_get_session_after_close_raises(self):
        """Test getting session after close raises error."""
        config = SessionConfig()
        manager = SyncSessionManager(config)
        manager.close()

        with pytest.raises(RuntimeError, match="SyncSessionManager is closed"):
            manager.get_session()


class TestAsyncSessionManager:
    """Tests for AsyncSessionManager."""

    @pytest.mark.asyncio
    async def test_single_instance_per_config(self):
        """Test that same config returns same instance."""
        config = SessionConfig()
        manager1 = AsyncSessionManager(config)
        manager2 = AsyncSessionManager(config)
        assert manager1 is manager2

    @pytest.mark.asyncio
    async def test_different_configs_different_instances(self):
        """Test that different configs return different instances."""
        config1 = SessionConfig(api_key="key1")
        config2 = SessionConfig(api_key="key2")
        manager1 = AsyncSessionManager(config1)
        manager2 = AsyncSessionManager(config2)
        assert manager1 is not manager2

    @pytest.mark.asyncio
    async def test_create_session(self):
        """Test async session creation."""
        config = SessionConfig(
            async_limit_total=100,
            async_limit_per_host=30,
            ssl=True
        )
        manager = AsyncSessionManager(config)
        session = await manager.get_session()

        assert session.connector.limit == 100
        assert session.connector.limit_per_host == 30
        assert session.connector._ssl is True

    @pytest.mark.asyncio
    async def test_session_reuse(self):
        """Test that same session is reused for same event loop."""
        config = SessionConfig()
        manager = AsyncSessionManager(config)
        session1 = await manager.get_session()
        session2 = await manager.get_session()
        assert session1 is session2

    @pytest.mark.asyncio
    async def test_different_loops_different_sessions(self):
        """Test that different event loops get different sessions."""
        config = SessionConfig()
        manager = AsyncSessionManager(config)
        session1 = await manager.get_session()
        def run_in_new_loop():
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                session = new_loop.run_until_complete(manager.get_session())
                return id(session)
            finally:
                new_loop.close()
        session2_id = await asyncio.get_event_loop().run_in_executor(None, run_in_new_loop)
        session1_id = id(session1)
        assert session1_id != session2_id

    @pytest.mark.asyncio
    async def test_close_session(self):
        """Test async session close."""
        config = SessionConfig()
        manager = AsyncSessionManager(config)
        session = await manager.get_session()
        assert manager.is_closed() is False

        await manager.close()
        assert manager.is_closed() is True
        assert session.closed is True

    @pytest.mark.asyncio
    async def test_close_already_closed(self):
        """Test closing already closed async manager."""
        config = SessionConfig()
        manager = AsyncSessionManager(config)
        await manager.close()
        await manager.close()  # Should not raise

    @pytest.mark.asyncio
    async def test_async_context_manager(self):
        """Test async context manager protocol."""
        config = SessionConfig()
        async with AsyncSessionManager(config) as manager:
            session = await manager.get_session()
            assert session is not None
        assert manager.is_closed() is True

    @pytest.mark.asyncio
    async def test_get_session_after_close_raises(self):
        """Test getting session after close raises error."""
        config = SessionConfig()
        manager = AsyncSessionManager(config)
        await manager.close()

        with pytest.raises(RuntimeError, match="AsyncSessionManager is closed"):
            await manager.get_session()

    @pytest.mark.asyncio
    async def test_concurrent_session_access(self):
        """Test concurrent access from same loop."""
        config = SessionConfig()
        manager = AsyncSessionManager(config)

        # Multiple coroutines accessing session
        async def get_session():
            return await manager.get_session()

        sessions = await asyncio.gather(*[get_session() for _ in range(5)])
        # All should be the same session
        assert all(s is sessions[0] for s in sessions)


class TestContextManagers:
    """Tests for session context managers."""

    def test_sync_context_manager_yields_session(self):
        """Test sync context manager yields session."""
        config = SessionConfig()
        with get_sync_session(config) as session:
            assert session is not None
            assert hasattr(session, 'get')

    @pytest.mark.asyncio
    async def test_async_context_manager_yields_session(self):
        """Test async context manager yields session."""
        config = SessionConfig()
        async with get_async_session(config) as session:
            assert session is not None
            assert hasattr(session, 'get')


class TestThreadAndLoopSafety:
    """Tests for thread and event loop safety."""

    def test_thread_local_sync_sessions(self):
        """Test sync sessions are thread-local."""
        config = SessionConfig()
        sessions = []

        def get_session_in_thread():
            manager = SyncSessionManager(config)
            session = manager.get_session()
            sessions.append((threading.current_thread().ident, session))
            manager.close()

        threads = [
            threading.Thread(target=get_session_in_thread)
            for _ in range(3)
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Should have different sessions for different threads
        assert len(sessions) == 3
        session_objs = [s[1] for s in sessions]
        assert len(set(id(s) for s in session_objs)) == 3