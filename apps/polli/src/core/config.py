"""Single source of truth for all configuration.

Non-secret settings live in `config.json` at the project root. Secrets live in `.env`.
Nothing else in the codebase should read `config.json` or `os.environ` directly — import
`config` from here instead, so every tunable value has exactly one home.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = PROJECT_ROOT / "config.json"


@dataclass(frozen=True)
class BotConfig:
    name: str
    default_repo: str
    session_timeout_seconds: int
    thread_auto_archive_minutes: int
    thread_history_limit: int


@dataclass(frozen=True)
class DiscordConfig:
    token: str
    guild_id: int
    admin_role_ids: tuple[int, ...]
    collaborator_role_ids: tuple[int, ...]
    api_base: str
    max_message_length: int
    max_title_length: int
    max_images_per_reply: int
    pr_merge_channel_id: int
    pr_merge_webhook_id: int


@dataclass(frozen=True)
class GitHubConfig:
    bot_username: str
    admin_users: tuple[str, ...]
    whitelisted_repos: tuple[str, ...]
    admin_only_mentions: bool
    api_base: str
    graphql_url: str
    web_base: str
    request_timeout_seconds: int
    short_request_timeout_seconds: int
    search_timeout_seconds: int
    cache_ttl_seconds: int
    # Secrets
    token: str
    app_id: str
    installation_id: str
    private_key: str
    project_pat: str

    @property
    def use_app_auth(self) -> bool:
        return bool(self.app_id and self.installation_id and self.private_key)

    @property
    def has_project_access(self) -> bool:
        return bool(self.project_pat)

    def is_admin(self, username: str) -> bool:
        return bool(username) and username.lower() in self.admin_users

    def is_repo_whitelisted(self, repo: str) -> bool:
        if not self.whitelisted_repos:
            return True
        return repo.lower() in self.whitelisted_repos


@dataclass(frozen=True)
class AIConfig:
    api_base: str
    model: str
    fallback_model: str
    request_timeout_seconds: int
    max_tokens: int
    temperature: float
    task_models: dict[str, str]
    token: str

    def model_for(self, task: str) -> str:
        """Model override for a specific task (web_search, data_viz), else the default."""
        return self.task_models.get(task, self.model)

    @property
    def chat_url(self) -> str:
        return f"{self.api_base}/v1/chat/completions"

    @property
    def embeddings_url(self) -> str:
        return f"{self.api_base}/v1/embeddings"


@dataclass(frozen=True)
class CodeSearchConfig:
    enabled: bool
    vectorize_index: str
    embed_model: str
    embed_dimensions: int
    cloudflare_api_base: str
    timeout_seconds: int
    cache_ttl_seconds: int
    default_top_k: int
    max_top_k: int
    local_repo_enabled: bool
    local_repo_url: str
    local_repo_branch: str
    graph_enabled: bool
    codegraph_binary: str
    # Secrets
    cloudflare_account_id: str
    cloudflare_api_token: str

    @property
    def is_configured(self) -> bool:
        return bool(self.enabled and self.cloudflare_account_id and self.cloudflare_api_token)

    @property
    def query_url(self) -> str:
        return (
            f"{self.cloudflare_api_base}/accounts/{self.cloudflare_account_id}"
            f"/vectorize/v2/indexes/{self.vectorize_index}/query"
        )


@dataclass(frozen=True)
class ServerConfig:
    enabled: bool
    port: int
    cors_origins: tuple[str, ...]


@dataclass(frozen=True)
class WebhookConfig:
    enabled: bool
    port: int
    secret: str


@dataclass(frozen=True)
class PathsConfig:
    data_dir: Path
    logs_dir: Path


@dataclass(frozen=True)
class Config:
    bot: BotConfig
    discord: DiscordConfig
    github: GitHubConfig
    ai: AIConfig
    code_search: CodeSearchConfig
    api: ServerConfig
    webhook: WebhookConfig
    paths: PathsConfig
    log_level: str

    def validate(self) -> None:
        """Fail fast on missing required secrets, then log a startup summary."""
        errors: list[str] = []

        if not self.discord.token:
            errors.append("DISCORD_TOKEN is required in .env")
        if not self.github.use_app_auth and not self.github.token:
            errors.append(
                "GitHub auth required in .env — set GITHUB_APP_ID + GITHUB_INSTALLATION_ID + "
                "GITHUB_PRIVATE_KEY, or POLLI_PAT"
            )
        if not self.ai.token:
            errors.append("POLLINATIONS_TOKEN is required in .env")

        if errors:
            for error in errors:
                logger.error("Config error: %s", error)
            sys.exit(1)

        logger.info("Bot: %s | repo: %s", self.bot.name, self.bot.default_repo)
        logger.info("AI: %s (fallback: %s)", self.ai.model, self.ai.fallback_model)
        logger.info("GitHub auth: %s", "App" if self.github.use_app_auth else "PAT")
        logger.info("code_search: %s", "on" if self.code_search.is_configured else "off")
        logger.info(
            "API: %s | webhook: %s",
            f"port {self.api.port}" if self.api.enabled else "off",
            f"port {self.webhook.port}" if self.webhook.enabled else "off",
        )


def _load_private_key() -> str:
    """GitHub App private key, either an inline PEM or a path to one."""
    value = os.getenv("GITHUB_PRIVATE_KEY", "").strip()
    if not value:
        return ""

    key_path = Path(value)
    if not key_path.is_absolute():
        key_path = PROJECT_ROOT / value
    if key_path.is_file():
        return key_path.read_text()

    return value.replace("\\n", "\n")


def _read_config_json() -> dict:
    if not CONFIG_PATH.exists():
        logger.error("config.json not found at %s", CONFIG_PATH)
        sys.exit(1)
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        logger.error("config.json is not valid JSON: %s", e)
        sys.exit(1)


def load_config() -> Config:
    raw = _read_config_json()

    bot_raw = raw["bot"]
    discord_raw = raw["discord"]
    github_raw = raw["github"]
    ai_raw = raw["ai"]
    code_search_raw = raw["code_search"]
    paths_raw = raw["paths"]

    return Config(
        bot=BotConfig(
            name=bot_raw["name"],
            default_repo=bot_raw["default_repo"],
            session_timeout_seconds=bot_raw["session_timeout_seconds"],
            thread_auto_archive_minutes=bot_raw["thread_auto_archive_minutes"],
            thread_history_limit=bot_raw["thread_history_limit"],
        ),
        discord=DiscordConfig(
            token=os.getenv("DISCORD_TOKEN", ""),
            guild_id=discord_raw["guild_id"],
            admin_role_ids=tuple(discord_raw["admin_role_ids"]),
            collaborator_role_ids=tuple(discord_raw["collaborator_role_ids"]),
            api_base=discord_raw["api_base"],
            max_message_length=discord_raw["max_message_length"],
            max_title_length=discord_raw["max_title_length"],
            max_images_per_reply=discord_raw["max_images_per_reply"],
            pr_merge_channel_id=discord_raw["pr_merge_channel_id"],
            pr_merge_webhook_id=discord_raw["pr_merge_webhook_id"],
        ),
        github=GitHubConfig(
            bot_username=github_raw["bot_username"],
            admin_users=tuple(u.lower() for u in github_raw["admin_users"]),
            whitelisted_repos=tuple(r.lower() for r in github_raw["whitelisted_repos"]),
            admin_only_mentions=github_raw["admin_only_mentions"],
            api_base=github_raw["api_base"],
            graphql_url=github_raw["graphql_url"],
            web_base=github_raw["web_base"],
            request_timeout_seconds=github_raw["request_timeout_seconds"],
            short_request_timeout_seconds=github_raw["short_request_timeout_seconds"],
            search_timeout_seconds=github_raw["search_timeout_seconds"],
            cache_ttl_seconds=github_raw["cache_ttl_seconds"],
            token=os.getenv("POLLI_PAT", ""),
            app_id=os.getenv("GITHUB_APP_ID", ""),
            installation_id=os.getenv("GITHUB_INSTALLATION_ID", ""),
            private_key=_load_private_key(),
            project_pat=os.getenv("GITHUB_PROJECT_PAT", ""),
        ),
        ai=AIConfig(
            api_base=ai_raw["api_base"],
            model=ai_raw["model"],
            fallback_model=ai_raw["fallback_model"],
            request_timeout_seconds=ai_raw["request_timeout_seconds"],
            max_tokens=ai_raw["max_tokens"],
            temperature=ai_raw["temperature"],
            task_models=dict(ai_raw.get("task_models", {})),
            token=os.getenv("POLLINATIONS_TOKEN", "").strip(),
        ),
        code_search=CodeSearchConfig(
            enabled=code_search_raw["enabled"],
            vectorize_index=code_search_raw["vectorize_index"],
            embed_model=code_search_raw["embed_model"],
            embed_dimensions=code_search_raw["embed_dimensions"],
            cloudflare_api_base=code_search_raw["cloudflare_api_base"],
            timeout_seconds=code_search_raw["timeout_seconds"],
            cache_ttl_seconds=code_search_raw["cache_ttl_seconds"],
            default_top_k=code_search_raw["default_top_k"],
            max_top_k=code_search_raw["max_top_k"],
            local_repo_enabled=code_search_raw["local_repo_enabled"],
            local_repo_url=code_search_raw["local_repo_url"],
            local_repo_branch=code_search_raw["local_repo_branch"],
            graph_enabled=code_search_raw["graph_enabled"],
            codegraph_binary=code_search_raw["codegraph_binary"],
            cloudflare_account_id=os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip(),
            cloudflare_api_token=os.getenv("VECTORIZE_API_TOKEN", "").strip(),
        ),
        api=ServerConfig(
            enabled=raw["api"]["enabled"],
            port=raw["api"]["port"],
            cors_origins=tuple(raw["api"]["cors_origins"]),
        ),
        webhook=WebhookConfig(
            enabled=raw["webhook"]["enabled"],
            port=raw["webhook"]["port"],
            secret=os.getenv("GITHUB_WEBHOOK_SECRET", ""),
        ),
        paths=PathsConfig(
            data_dir=PROJECT_ROOT / paths_raw["data_dir"],
            logs_dir=PROJECT_ROOT / paths_raw["logs_dir"],
        ),
        log_level=raw["logging"]["level"],
    )


config = load_config()
