import logging
import sys


class CleanFormatter(logging.Formatter):
    MODULE_ALIASES = {
        "src.bot": "bot",
        "src.core.config": "config",
        "src.ai.client": "ai",
        "src.search.code_search": "search",
        "src.integrations.github.client": "github",
        "src.integrations.github.handlers": "gh-tools",
        "src.integrations.github.auth": "gh-auth",
        "src.integrations.github.graphql": "gh-gql",
        "src.integrations.github.projects": "gh-proj",
        "src.integrations.github.repo_overview": "gh-repo",
        "src.integrations.github.pull_requests": "gh-pr",
        "src.integrations.github.pr_review": "gh-review",
        "src.integrations.subscriptions": "subs",
        "src.integrations.webhook_server": "webhook",
        "src.integrations.web_scraper": "scraper",
        "src.discord.search": "dc-search",
        "src.discord.media": "dc-media",
        "src.context.manager": "context",
        "__main__": "main",
    }

    def __init__(self):
        super().__init__()

    def format(self, record: logging.LogRecord) -> str:
        time_str = self.formatTime(record, "%H:%M:%S")
        level = record.levelname[:5].ljust(5)
        module = self.MODULE_ALIASES.get(record.name)
        if not module:
            parts = record.name.split(".")
            module = parts[-1] if parts else record.name
        module = module[:10].ljust(10)
        message = record.getMessage()
        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
            message = f"{message}\n{record.exc_text}"
        return f"{time_str} | {level} | {module} | {message}"


class SectionLogger:
    def __init__(self, logger: logging.Logger):
        self.logger = logger

    def start(self, title: str):
        self.logger.info(f"{'─' * 20} {title} {'─' * 20}")

    def end(self, title: str = ""):
        if title:
            self.logger.info(f"{'─' * 20} {title} {'─' * 20}")
        else:
            self.logger.info("─" * 50)


def setup_logging(level: int = logging.INFO, debug_modules: list | None = None):
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CleanFormatter())
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers = [handler]
    logging.getLogger("discord").setLevel(logging.WARNING)
    logging.getLogger("discord.http").setLevel(logging.WARNING)
    logging.getLogger("discord.gateway").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if debug_modules:
        for module in debug_modules:
            logging.getLogger(module).setLevel(logging.DEBUG)
    return root


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
