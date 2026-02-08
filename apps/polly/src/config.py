"""Configuration loading from config.json and .env (secrets only)."""

import json
import logging
import sys
from pathlib import Path
from typing import List

from dotenv import load_dotenv
import os

load_dotenv()

logger = logging.getLogger(__name__)

# Project root directory
PROJECT_ROOT = Path(__file__).parent.parent


def load_config_json() -> dict:
    """Load config.json file."""
    config_path = PROJECT_ROOT / "config.json"
    if not config_path.exists():
        logger.warning(f"config.json not found at {config_path}, using defaults")
        return {}

    try:
        with open(config_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load config.json: {e}")
        return {}


class Config:
    """Application configuration loaded from config.json and environment variables."""

    def __init__(self):
        # Load config.json
        cfg = load_config_json()

        # =================================================================
        # BOT CONFIG (from config.json)
        # =================================================================
        bot_cfg = cfg.get("bot", {})
        self.bot_name = bot_cfg.get("name", "Polly")
        self.default_repo = bot_cfg.get("default_repo", "pollinations/pollinations")

        # =================================================================
        # DISCORD CONFIG
        # =================================================================
        discord_cfg = cfg.get("discord", {})
        self.admin_role_ids: List[int] = discord_cfg.get("admin_role_ids", [])

        # Secret from .env
        self.discord_token = os.getenv("DISCORD_TOKEN")

        # =================================================================
        # GITHUB CONFIG
        # =================================================================
        github_cfg = cfg.get("github", {})
        self.github_bot_username = github_cfg.get("bot_username", "pollinations-ci")
        self.github_admin_users: List[str] = [u.lower() for u in github_cfg.get("admin_users", [])]
        self.whitelisted_repos: List[str] = [r.lower() for r in github_cfg.get("whitelisted_repos", [])]
        self.github_admin_only_mentions: bool = github_cfg.get("admin_only_mentions", False)

        # Secrets from .env
        self.github_token = os.getenv("POLLI_PAT", "")
        self.github_app_id = os.getenv("GITHUB_APP_ID", "")
        self.github_installation_id = os.getenv("GITHUB_INSTALLATION_ID", "")
        self.github_private_key = self._load_private_key()
        self.github_project_pat = os.getenv("GITHUB_PROJECT_PAT", "")

        # =================================================================
        # WEBHOOK CONFIG
        # =================================================================
        webhook_cfg = cfg.get("webhook", {})
        self.webhook_port = webhook_cfg.get("port", 8002)
        self.webhook_enabled = webhook_cfg.get("enabled", True)

        # Secret from .env
        self.webhook_secret = os.getenv("GITHUB_WEBHOOK_SECRET", "")

        # =================================================================
        # AI CONFIG
        # =================================================================
        ai_cfg = cfg.get("ai", {})
        self.pollinations_model = ai_cfg.get("model", "gemini-large")
        self.fallback_model = ai_cfg.get("fallback_model", "openai-large")

        # Secret from .env
        self.pollinations_token = os.getenv("POLLINATIONS_TOKEN", "")

        # =================================================================
        # FEATURES CONFIG
        # =================================================================
        features_cfg = cfg.get("features", {})
        self.sandbox_enabled = features_cfg.get("sandbox_enabled", False)
        self.local_embeddings_enabled = features_cfg.get("local_embeddings_enabled", False)
        self.embeddings_repo = features_cfg.get("embeddings_repo", "pollinations/pollinations")

        # Doc embeddings (separate from code embeddings)
        self.doc_embeddings_enabled = features_cfg.get("doc_embeddings_enabled", True)
        self.doc_sites = features_cfg.get("doc_sites", [
            "https://enter.pollinations.ai",
            "https://kpi.myceli.ai",
            "https://gsoc.pollinations.ai"
        ])

    def _load_private_key(self) -> str:
        """Load GitHub App private key from env var or file path."""
        key_value = os.getenv("GITHUB_PRIVATE_KEY", "")
        if not key_value:
            return ""

        # Check if it's a file path
        key_path = Path(key_value)
        if not key_path.is_absolute():
            key_path = PROJECT_ROOT / key_value

        if key_path.is_file():
            try:
                content = key_path.read_text()
                logger.info(f"Loaded private key from {key_path}")
                return content
            except Exception as e:
                logger.error(f"Failed to read private key file {key_path}: {e}")
                return ""

        # Otherwise treat as inline key with \n escapes
        return key_value.replace("\\n", "\n")

    @property
    def github_repo(self) -> str:
        """Alias for default_repo (backward compatibility)."""
        return self.default_repo

    @property
    def use_github_app(self) -> bool:
        """Check if GitHub App credentials are configured."""
        return bool(
            self.github_app_id and
            self.github_installation_id and
            self.github_private_key
        )

    @property
    def has_project_access(self) -> bool:
        """Check if project PAT is configured for ProjectV2 access."""
        return bool(self.github_project_pat)

    def is_github_admin(self, username: str) -> bool:
        """Check if a GitHub username has admin privileges."""
        if not username:
            return False
        return username.lower() in self.github_admin_users

    def is_repo_whitelisted(self, repo: str) -> bool:
        """Check if a repo is whitelisted for webhook processing."""
        if not self.whitelisted_repos:
            return True  # No whitelist = all repos allowed
        return repo.lower() in self.whitelisted_repos

    def validate(self) -> bool:
        """Validate that all required configuration is present."""
        errors = []

        if not self.discord_token:
            errors.append("DISCORD_TOKEN is required in .env")

        if not self.use_github_app and not self.github_token:
            errors.append(
                "GitHub auth required in .env. Either:\n"
                "  - Set GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and GITHUB_PRIVATE_KEY\n"
                "  - Or set POLLI_PAT"
            )

        if errors:
            logger.error("Configuration errors:")
            for error in errors:
                logger.error(f"  - {error}")
            logger.error("\nCheck your .env file and config.json")
            sys.exit(1)

        # Log config summary
        logger.info(f"Bot: {self.bot_name}")
        logger.info(f"Default repo: {self.default_repo}")
        logger.info(f"GitHub auth: {'App' if self.use_github_app else 'PAT'}")
        logger.info(f"Webhook: {'enabled' if self.webhook_enabled else 'disabled'} on port {self.webhook_port}")
        logger.info(f"AI model: {self.pollinations_model}")
        logger.info(f"GitHub admins: {len(self.github_admin_users)} users")
        logger.info(f"Whitelisted repos: {len(self.whitelisted_repos) if self.whitelisted_repos else 'all'}")

        if self.has_project_access:
            logger.info("ProjectV2 access: enabled")

        return True


# Global config instance
config = Config()
