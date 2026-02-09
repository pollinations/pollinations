"""Conversation session for tracking issue discussions."""

import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Message:
    """A single message in the conversation."""
    role: str  # "user" or "assistant"
    content: str
    author: str  # Discord username
    author_id: int  # Discord user ID
    timestamp: float = field(default_factory=time.time)
    image_urls: list[str] = field(default_factory=list)  # Discord CDN image URLs


@dataclass
class ConversationSession:
    """
    Tracks a conversation about a specific issue topic.

    Multiple users can participate in the same session if they're
    discussing the same issue. Each session is tied to a Discord thread.
    """
    channel_id: int
    thread_id: int  # Discord thread ID where the conversation happens
    topic_summary: str  # Brief summary of what the issue is about
    messages: list[Message] = field(default_factory=list)
    participants: set[int] = field(default_factory=set)  # User IDs involved
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)

    # Track the original reporter
    original_author_id: int = 0
    original_author_name: str = ""

    def add_message(self, role: str, content: str, author: str, author_id: int, image_urls: Optional[list[str]] = None):
        """Add a message to the conversation."""
        self.messages.append(Message(
            role=role,
            content=content,
            author=author,
            author_id=author_id,
            image_urls=image_urls or []
        ))
        self.participants.add(author_id)
        self.last_activity = time.time()

        # First user message sets the original author
        if role == "user" and self.original_author_id == 0:
            self.original_author_id = author_id
            self.original_author_name = author

    def get_conversation_history(self) -> list[dict]:
        """Get messages formatted for the AI API with vision support."""
        history = []
        for msg in self.messages:
            if msg.role == "user":
                # Build content array for OpenAI vision format
                content = []

                # Add text content
                text = f"[{msg.author}]: {msg.content}" if msg.content else f"[{msg.author}]:"
                content.append({"type": "text", "text": text})

                # Add images if present
                for url in msg.image_urls:
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": url}
                    })

                history.append({"role": "user", "content": content})
            else:
                # Assistant messages are just text
                history.append({"role": "assistant", "content": msg.content})
        return history

    def get_all_image_urls(self) -> list[str]:
        """Get all image URLs from the conversation for including in GitHub issue."""
        urls = []
        for msg in self.messages:
            urls.extend(msg.image_urls)
        return urls

    def get_all_participants_names(self) -> list[str]:
        """Get names of all users who participated."""
        seen = set()
        names = []
        for msg in self.messages:
            if msg.role == "user" and msg.author not in seen:
                seen.add(msg.author)
                names.append(msg.author)
        return names

    def is_expired(self, timeout_seconds: int = 300) -> bool:
        """Check if session has timed out (default 5 minutes)."""
        return (time.time() - self.last_activity) > timeout_seconds

    def message_count(self) -> int:
        """Get total number of messages."""
        return len(self.messages)

    def user_message_count(self) -> int:
        """Get number of user messages."""
        return sum(1 for msg in self.messages if msg.role == "user")
