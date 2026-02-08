"""
Code Agent - Coding agent for Polli Discord bot.

Architecture:
- Bot AI handles user intent and conversation
- ccr handles all actual coding work
- Single Discord embed updates in real-time (no message spam)
- Sandbox stays alive for follow-up commands

Flow:
1. User requests coding task via Discord
2. Bot AI interprets intent, builds context
3. Creates Docker sandbox, clones repo
4. Runs ccr with the task prompt
5. Streams output, updates Discord embed
6. Sandbox persists for follow-ups (more changes, PR creation, etc.)
"""

from .models import ModelRouter, model_router
from .sandbox import SandboxManager, sandbox_manager, Sandbox
from .claude_code_agent import (
    ClaudeCodeAgent,
    ClaudeCodeConfig,
    ClaudeCodeResult,
    TaskProgress,
    AgentStatus,
    get_claude_code_agent,
)
from .embed_builder import (
    ProgressEmbed,
    ProgressEmbedManager,
    TodoItem,
    StepStatus,
)
from .output_summarizer import OutputSummarizer, OutputSummary, output_summarizer
from .session_embeddings import SessionEmbeddings, SessionEmbeddingsManager, session_embeddings_manager

__all__ = [
    # Code agent
    "ClaudeCodeAgent",
    "ClaudeCodeConfig",
    "ClaudeCodeResult",
    "TaskProgress",
    "AgentStatus",
    "get_claude_code_agent",
    # Progress embeds
    "ProgressEmbed",
    "ProgressEmbedManager",
    "TodoItem",
    "StepStatus",
    # Output summarizer
    "OutputSummarizer",
    "OutputSummary",
    "output_summarizer",
    # Model router
    "ModelRouter",
    "model_router",
    # Sandbox & Session Embeddings
    "SandboxManager",
    "sandbox_manager",
    "Sandbox",
    "SessionEmbeddings",
    "SessionEmbeddingsManager",
    "session_embeddings_manager",
]
