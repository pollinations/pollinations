import time
from dataclasses import dataclass, field


@dataclass
class Message:
    role: str
    content: str
    author: str
    author_id: int
    timestamp: float = field(default_factory=time.time)
    image_urls: list[str] = field(default_factory=list)


@dataclass
class ConversationSession:
    channel_id: int
    thread_id: int
    topic_summary: str
    messages: list[Message] = field(default_factory=list)
    participants: set[int] = field(default_factory=set)
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    original_author_id: int = 0
    original_author_name: str = ""

    def add_message(self, role: str, content: str, author: str, author_id: int, image_urls: list[str] | None = None):
        self.messages.append(
            Message(role=role, content=content, author=author, author_id=author_id, image_urls=image_urls or [])
        )
        self.participants.add(author_id)
        self.last_activity = time.time()
        if role == "user" and self.original_author_id == 0:
            self.original_author_id = author_id
            self.original_author_name = author

    def get_conversation_history(self) -> list[dict]:
        history = []
        for msg in self.messages:
            if msg.role == "user":
                content = []
                text = f"[{msg.author}]: {msg.content}" if msg.content else f"[{msg.author}]:"
                content.append({"type": "text", "text": text})
                for url in msg.image_urls:
                    content.append({"type": "image_url", "image_url": {"url": url}})
                history.append({"role": "user", "content": content})
            else:
                history.append({"role": "assistant", "content": msg.content})
        return history

    def get_all_image_urls(self) -> list[str]:
        urls = []
        for msg in self.messages:
            urls.extend(msg.image_urls)
        return urls

    def get_all_participants_names(self) -> list[str]:
        seen = set()
        names = []
        for msg in self.messages:
            if msg.role == "user" and msg.author not in seen:
                seen.add(msg.author)
                names.append(msg.author)
        return names

    def is_expired(self, timeout_seconds: int = 300) -> bool:
        return (time.time() - self.last_activity) > timeout_seconds

    def message_count(self) -> int:
        return len(self.messages)

    def user_message_count(self) -> int:
        return sum(1 for msg in self.messages if msg.role == "user")
