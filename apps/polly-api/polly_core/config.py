"""Configuration for Polly API.

All settings loaded from environment variables (no config.json needed).
"""

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Project root directory
PROJECT_ROOT = Path(__file__).parent.parent


class Config:
    """Application configuration loaded from environment variables."""

    def __init__(self):
        # =================================================================
        # POLLINATIONS AI
        # =================================================================
        self.pollinations_token = os.getenv("POLLINATIONS_TOKEN", "")
        self.pollinations_model = os.getenv("POLLINATIONS_MODEL", "kimi")
        self.pollinations_api_base = os.getenv("POLLINATIONS_API_BASE", "https://gen.pollinations.ai")

        # =================================================================
        # GITHUB
        # =================================================================
        self.github_token = os.getenv("GITHUB_TOKEN", "") or os.getenv("POLLI_PAT", "")
        self.github_app_id = os.getenv("GITHUB_APP_ID", "")
        self.github_installation_id = os.getenv("GITHUB_INSTALLATION_ID", "")
        self.github_private_key = self._load_private_key()
        self.github_project_pat = os.getenv("GITHUB_PROJECT_PAT", "")

        # Repository config
        self.github_repo = os.getenv("GITHUB_DEFAULT_REPO", "pollinations/pollinations")
        self.github_whitelisted_repos = [
            r.strip() for r in os.getenv("GITHUB_WHITELISTED_REPOS", "pollinations/pollinations").split(",") if r.strip()
        ]

        # =================================================================
        # OPENAI (for embeddings)
        # =================================================================
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")

        # =================================================================
        # DISCORD (optional, for discord_search tool only)
        # =================================================================
        self.discord_token = os.getenv("DISCORD_TOKEN", "")
        self.discord_guild_id = os.getenv("DISCORD_GUILD_ID", "")

        # =================================================================
        # FEATURES
        # =================================================================
        self.local_embeddings_enabled = os.getenv("LOCAL_EMBEDDINGS_ENABLED", "false").lower() == "true"
        self.doc_embeddings_enabled = os.getenv("DOC_EMBEDDINGS_ENABLED", "false").lower() == "true"
        self.discord_search_enabled = os.getenv("DISCORD_SEARCH_ENABLED", "false").lower() == "true"

        # Embeddings config
        self.embeddings_repo = os.getenv("EMBEDDINGS_REPO", "pollinations/pollinations")
        self.doc_sites = [
            s.strip() for s in os.getenv(
                "DOC_SITES",
                "https://enter.pollinations.ai,https://kpi.myceli.ai,https://gsoc.pollinations.ai"
            ).split(",") if s.strip()
        ]

        # =================================================================
        # SERVER
        # =================================================================
        self.host = os.getenv("HOST", "0.0.0.0")
        self.port = int(os.getenv("PORT", "8006"))
        self.log_level = os.getenv("LOG_LEVEL", "INFO")

    def _load_private_key(self) -> str:
        """Load GitHub App private key from env var or file path."""
        key_value = os.getenv("GITHUB_PRIVATE_KEY", "")
        if not key_value:
            key_path_env = os.getenv("GITHUB_PRIVATE_KEY_PATH", "")
            if key_path_env:
                key_path = Path(key_path_env)
                if not key_path.is_absolute():
                    key_path = PROJECT_ROOT / key_path_env
                if key_path.is_file():
                    try:
                        return key_path.read_text()
                    except Exception as e:
                        logger.error(f"Failed to read private key: {e}")
            return ""

        # Check if it's a file path
        key_path = Path(key_value)
        if not key_path.is_absolute():
            key_path = PROJECT_ROOT / key_value
        if key_path.is_file():
            try:
                return key_path.read_text()
            except Exception as e:
                logger.error(f"Failed to read private key: {e}")
                return ""

        # Inline key with \n escapes
        return key_value.replace("\\n", "\n")

    @property
    def default_repo(self) -> str:
        """Alias for github_repo."""
        return self.github_repo

    @property
    def use_github_app(self) -> bool:
        return bool(self.github_app_id and self.github_installation_id and self.github_private_key)

    @property
    def has_project_access(self) -> bool:
        return bool(self.github_project_pat)

    def validate(self) -> bool:
        """Validate required configuration."""
        errors = []

        if not self.pollinations_token:
            errors.append("POLLINATIONS_TOKEN is required")

        if not self.use_github_app and not self.github_token:
            errors.append(
                "GitHub auth required. Set GITHUB_TOKEN (PAT) or "
                "GITHUB_APP_ID + GITHUB_INSTALLATION_ID + GITHUB_PRIVATE_KEY"
            )

        if errors:
            for error in errors:
                logger.error(f"Config error: {error}")
            return False

        # Log config summary
        logger.info(f"Pollinations model: {self.pollinations_model}")
        logger.info(f"GitHub repo: {self.github_repo}")
        logger.info(f"GitHub auth: {'App' if self.use_github_app else 'PAT'}")
        logger.info(f"Embeddings: code={'on' if self.local_embeddings_enabled else 'off'}, docs={'on' if self.doc_embeddings_enabled else 'off'}")
        logger.info(f"Discord search: {'on' if self.discord_search_enabled else 'off'}")
        logger.info(f"Server: {self.host}:{self.port}")

        return True


# Global config instance
config = Config()
