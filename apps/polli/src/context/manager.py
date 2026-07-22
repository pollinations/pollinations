import logging

from .session import ConversationSession

logger = logging.getLogger(__name__)

SESSION_TIMEOUT = 300
MAX_SESSIONS = 500


class SessionManager:
    def __init__(self, max_sessions: int = MAX_SESSIONS):
        self._sessions: dict[int, ConversationSession] = {}
        self._max_sessions = max_sessions

    def get_session(self, thread_id: int) -> ConversationSession | None:
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
        image_urls: list[str] | None = None,
    ) -> ConversationSession:
        if len(self._sessions) >= self._max_sessions:
            self._evict_oldest()

        session = ConversationSession(channel_id=channel_id, thread_id=thread_id, topic_summary=topic_summary)
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
        image_urls: list[str] | None = None,
    ):
        session.add_message(role, content, author, author_id, image_urls)

    def clear_session(self, session: ConversationSession):
        self._cleanup_session(session.thread_id)
        logger.info(f"Cleared session for thread {session.thread_id}")

    def _cleanup_session(self, thread_id: int):
        if thread_id in self._sessions:
            del self._sessions[thread_id]

    def _evict_oldest(self, count: int = 10):
        if not self._sessions:
            return

        sorted_sessions = sorted(self._sessions.items(), key=lambda x: x[1].last_activity)

        to_evict = min(count, len(sorted_sessions))
        for thread_id, _ in sorted_sessions[:to_evict]:
            del self._sessions[thread_id]

        logger.info(f"LRU evicted {to_evict} oldest sessions (capacity: {self._max_sessions})")

    def cleanup_expired(self) -> int:
        expired = [thread_id for thread_id, session in self._sessions.items() if session.is_expired(SESSION_TIMEOUT)]
        for thread_id in expired:
            self._cleanup_session(thread_id)

        if expired:
            logger.info(f"Cleaned up {len(expired)} expired sessions")

        return len(expired)

    def active_session_count(self) -> int:
        return len(self._sessions)


session_manager = SessionManager()
