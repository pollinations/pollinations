"""
Professional logging configuration for Polly Bot.

Clean, minimal logs without colors (VPS compatible).
Format: TIME | LEVEL | MODULE | message
"""

import logging
import sys
from typing import Optional


class CleanFormatter(logging.Formatter):
    """
    Clean, professional log formatter.

    Output format:
        12:34:56 | INFO  | bot      | Bot started
        12:34:57 | DEBUG | sandbox  | Container running
        12:34:58 | ERROR | github   | API request failed

    Features:
    - Short time (HH:MM:SS only, no date - cleaner for terminal)
    - Fixed-width level names (5 chars)
    - Short module names (last part only, max 10 chars)
    - Clean separator with pipes
    """

    # Map full module paths to short names
    MODULE_ALIASES = {
        "src.bot": "bot",
        "src.config": "config",
        "src.services.github": "github",
        "src.services.github_auth": "gh-auth",
        "src.services.github_pr": "gh-pr",
        "src.services.github_graphql": "gh-gql",
        "src.services.pollinations": "ai",
        "src.services.subscriptions": "subs",
        "src.services.webhook_server": "webhook",
        "src.services.embeddings": "embed",
        "src.services.code_agent.sandbox": "sandbox",
        "src.services.code_agent.claude_code_agent": "agent",
        "src.services.code_agent.embed_builder": "discord",
        "src.services.code_agent.tools.polly_agent": "polly",
        "src.services.code_agent.models": "models",
        "src.services.code_agent.output_summarizer": "summary",
        "src.services.code_agent.session_embeddings": "sess-emb",
        "src.context.manager": "context",
        "__main__": "main",
    }

    def __init__(self):
        super().__init__()

    def format(self, record: logging.LogRecord) -> str:
        # Time - just HH:MM:SS
        time_str = self.formatTime(record, "%H:%M:%S")

        # Level - fixed 5 chars
        level = record.levelname[:5].ljust(5)

        # Module - use alias or shorten
        module = self.MODULE_ALIASES.get(record.name)
        if not module:
            # Take last part of module path
            parts = record.name.split(".")
            module = parts[-1] if parts else record.name
        module = module[:10].ljust(10)

        # Message
        message = record.getMessage()

        # Exception info if present
        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
            message = f"{message}\n{record.exc_text}"

        return f"{time_str} | {level} | {module} | {message}"


class SectionLogger:
    """
    Helper for logging sections with visual separators.

    Usage:
        section = SectionLogger(logger)
        section.start("Initializing")
        logger.info("Step 1")
        logger.info("Step 2")
        section.end()
    """

    def __init__(self, logger: logging.Logger):
        self.logger = logger

    def start(self, title: str):
        """Log section start."""
        self.logger.info(f"{'─' * 20} {title} {'─' * 20}")

    def end(self, title: str = ""):
        """Log section end."""
        if title:
            self.logger.info(f"{'─' * 20} {title} {'─' * 20}")
        else:
            self.logger.info("─" * 50)


def setup_logging(level: int = logging.INFO, debug_modules: Optional[list] = None):
    """
    Configure logging for the application.

    Args:
        level: Default log level (INFO recommended for production)
        debug_modules: List of module names to set to DEBUG level
    """
    # Create handler with our clean formatter
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CleanFormatter())

    # Configure root logger
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers = [handler]  # Replace any existing handlers

    # Reduce noise from third-party libraries
    logging.getLogger("discord").setLevel(logging.WARNING)
    logging.getLogger("discord.http").setLevel(logging.WARNING)
    logging.getLogger("discord.gateway").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    # Set debug level for specific modules if requested
    if debug_modules:
        for module in debug_modules:
            logging.getLogger(module).setLevel(logging.DEBUG)

    return root


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)
