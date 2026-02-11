"""Session manager for handling multiple conversation sessions."""

import logging
from typing import Optional

from .session import ConversationSession

logger = logging.getLogger(__name__)

# Session timeout in seconds (5 minutes)
SESSION_TIMEOUT = 300

# Max sessions to prevent memory issues (LRU eviction when exceeded)
MAX_SESSIONS = 500


class SessionManager:
    """
    Manages conversation sessions using Discord threads.

    Sessions are keyed by thread_id, making management much simpler:
    - One thread = one session
    - All messages in the thread are part of the same conversation
    - No complex topic hashing needed
    - LRU eviction when max sessions reached
    """

    def __init__(self, max_sessions: int = MAX_SESSIONS):
        # Key: thread_id -> ConversationSession
        self._sessions: dict[int, ConversationSession] = {}
        self._max_sessions = max_sessions

    def get_session(self, thread_id: int) -> Optional[ConversationSession]:
        """Get the active session for a thread."""
        session = self._sessions.get(thread_id)

        if session and session.is_expired(SESSION_TIMEOUT):
            self._cleanup_session(thread_id)
            return None

        return session

    def create_session(
        self,
        channel_id: int,
        thread_id: int,
        user_id: int,
        user_name: str,
        initial_message: str,
        topic_summary: str,
        image_urls: Optional[list[str]] = None
    ) -> ConversationSession:
        """Create a new conversation session for a thread."""
        # Evict oldest sessions if at capacity (LRU eviction)
        if len(self._sessions) >= self._max_sessions:
            self._evict_oldest()

        # Create new session
        session = ConversationSession(
            channel_id=channel_id,
            thread_id=thread_id,
            topic_summary=topic_summary
        )
        session.add_message("user", initial_message, user_name, user_id, image_urls)

        self._sessions[thread_id] = session

        logger.info(f"Created session for thread {thread_id} - topic: '{topic_summary}'")
        return session

    def add_to_session(
        self,
        session: ConversationSession,
        role: str,
        content: str,
        author: str,
        author_id: int,
        image_urls: Optional[list[str]] = None
    ):
        """Add a message to an existing session."""
        session.add_message(role, content, author, author_id, image_urls)

    def clear_session(self, session: ConversationSession):
        """Clear/remove a session after issue is created."""
        self._cleanup_session(session.thread_id)
        logger.info(f"Cleared session for thread {session.thread_id}")

    def _cleanup_session(self, thread_id: int):
        """Internal cleanup of a session."""
        if thread_id in self._sessions:
            del self._sessions[thread_id]

    def _evict_oldest(self, count: int = 10):
        """Evict the oldest sessions by last_activity time (LRU)."""
        if not self._sessions:
            return

        # Sort by last_activity and evict oldest
        sorted_sessions = sorted(
            self._sessions.items(),
            key=lambda x: x[1].last_activity
        )

        to_evict = min(count, len(sorted_sessions))
        for thread_id, _ in sorted_sessions[:to_evict]:
            del self._sessions[thread_id]

        logger.info(f"LRU evicted {to_evict} oldest sessions (capacity: {self._max_sessions})")

    def cleanup_expired(self) -> int:
        """Remove all expired sessions. Returns count of cleaned sessions."""
        expired = [
            thread_id
            for thread_id, session in self._sessions.items()
            if session.is_expired(SESSION_TIMEOUT)
        ]
        for thread_id in expired:
            self._cleanup_session(thread_id)

        if expired:
            logger.info(f"Cleaned up {len(expired)} expired sessions")

        return len(expired)

    def active_session_count(self) -> int:
        """Get count of active sessions."""
        return len(self._sessions)


# Global session manager instance
session_manager = SessionManager()
