import os
import asyncio
import concurrent.futures
import threading
import atexit
from typing import Any, Callable, Coroutine, Optional

# Global thread pool with proper cleanup
_thread_pool: Optional[concurrent.futures.ThreadPoolExecutor] = None
_pool_lock = threading.Lock()


def _get_thread_pool() -> concurrent.futures.ThreadPoolExecutor:
    global _thread_pool
    if _thread_pool is None:
        with _pool_lock:
            if _thread_pool is None:
                _thread_pool = concurrent.futures.ThreadPoolExecutor(
                    max_workers=min(32, (os.cpu_count() or 1) + 4),
                    thread_name_prefix="blossom-ai",
                )
    return _thread_pool


def cleanup_thread_pool() -> None:
    global _thread_pool
    if _thread_pool is not None:
        try:
            _thread_pool.shutdown(wait=True, cancel_futures=True)
        except Exception:
            pass
        finally:
            _thread_pool = None


atexit.register(cleanup_thread_pool)


def _run_async(coro: Coroutine[Any, Any, Any]) -> Any:
    """
    Run coroutine synchronously with proper error handling.

    Uses get_running_loop() instead of deprecated get_event_loop().
    Safe for Jupyter, FastAPI, console, and multi-threading.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No event loop in this thread - use asyncio.run()
        try:
            return asyncio.run(coro)
        except KeyboardInterrupt:
            raise
        except Exception:
            raise
    else:
        # Event loop is running - submit to thread pool
        pool = _get_thread_pool()
        future = asyncio.run_coroutine_threadsafe(coro, loop)

        try:
            return future.result()
        except KeyboardInterrupt:
            future.cancel()
            raise
        except concurrent.futures.CancelledError:
            raise
        except Exception:
            raise


def run_sync_in_pool(fn: Callable[..., Any], *args, **kwargs) -> Any:
    """Run synchronous function in thread pool."""
    pool = _get_thread_pool()
    return pool.submit(fn, *args, **kwargs).result()


class AsyncExecutor:
    """
    Context manager for safe async execution with automatic cleanup.

    Example:
        with AsyncExecutor() as executor:
            result = executor.run(coro())
    """

    def __init__(self):
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._executor: Optional[concurrent.futures.ThreadPoolExecutor] = None

    def run(self, coro: Coroutine[Any, Any, Any]) -> Any:
        """Run coroutine and return result."""
        return _run_async(coro)

    def __enter__(self) -> 'AsyncExecutor':
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Cleanup on exit."""
        if self._executor is not None:
            self._executor.shutdown(wait=True, cancel_futures=True)


__all__ = ["_run_async", "run_sync_in_pool", "cleanup_thread_pool", "AsyncExecutor"]