import threading
from contextlib import contextmanager

from fastapi import HTTPException


class GenerationQueue:
    def __init__(self, limit: int):
        if limit < 1:
            raise ValueError("QUEUE_LIMIT must be at least 1")
        self._slots = threading.BoundedSemaphore(limit)

    @contextmanager
    def slot(self):
        if not self._slots.acquire(blocking=False):
            raise HTTPException(status_code=503, detail="Queue full")
        try:
            yield
        finally:
            self._slots.release()
