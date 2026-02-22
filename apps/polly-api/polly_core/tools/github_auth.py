"""GitHub App authentication for organization repositories.

GitHub Apps use a two-step authentication process:
1. Generate a JWT signed with the App's private key
2. Exchange JWT for an installation access token

Installation tokens expire after 1 hour, so we auto-refresh them.
"""

import time
import logging
from typing import Optional

import jwt
import aiohttp

logger = logging.getLogger(__name__)

# Token refresh buffer (refresh 5 mins before expiry)
TOKEN_REFRESH_BUFFER = 300


class GitHubAppAuth:
    """Handles GitHub App authentication and token management."""

    def __init__(
        self,
        app_id: str,
        private_key: str,
        installation_id: str
    ):
        self.app_id = app_id
        self.private_key = private_key
        self.installation_id = installation_id

        # Cached installation token
        self._token: Optional[str] = None
        self._token_expires_at: float = 0

        # HTTP session for token requests
        self._session: Optional[aiohttp.ClientSession] = None

    def _generate_jwt(self) -> str:
        """
        Generate a JWT for GitHub App authentication.

        JWT is valid for 60 seconds (very conservative to handle clock skew).
        """
        now = int(time.time())
        logger.debug(f"Generating JWT at timestamp: {now}")
        payload = {
            "iat": now - 30,  # Issued 30s ago (clock skew buffer)
            "exp": now + 60,  # Expires in 60 seconds (very short to avoid "too far in future")
            "iss": self.app_id
        }
        return jwt.encode(payload, self.private_key, algorithm="RS256")

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def get_token(self) -> Optional[str]:
        """
        Get a valid installation access token.

        Automatically refreshes if expired or about to expire.
        """
        # Check if we have a valid cached token
        if self._token and time.time() < (self._token_expires_at - TOKEN_REFRESH_BUFFER):
            return self._token

        # Need to fetch new token
        logger.info("Fetching new GitHub App installation token...")

        try:
            jwt_token = self._generate_jwt()
            session = await self._get_session()

            url = f"https://api.github.com/app/installations/{self.installation_id}/access_tokens"
            headers = {
                "Authorization": f"Bearer {jwt_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }

            async with session.post(url, headers=headers) as response:
                if response.status == 201:
                    data = await response.json()
                    self._token = data["token"]
                    # Parse expiry time (ISO 8601 format)
                    # GitHub returns expires_at like "2024-01-01T12:00:00Z"
                    # For simplicity, we'll use 1 hour from now (tokens last ~1 hour)
                    self._token_expires_at = time.time() + 3600
                    logger.info("GitHub App token refreshed successfully")
                    return self._token
                else:
                    error = await response.text()
                    logger.error(f"Failed to get installation token: {response.status} - {error}")
                    return None

        except Exception as e:
            logger.error(f"Error getting GitHub App token: {e}")
            return None


# Global instance (initialized by config)
github_app_auth: Optional[GitHubAppAuth] = None


def init_github_app(app_id: str, private_key: str, installation_id: str):
    """Initialize the GitHub App authentication."""
    global github_app_auth
    github_app_auth = GitHubAppAuth(app_id, private_key, installation_id)
    logger.info(f"GitHub App auth initialized (App ID: {app_id}, Installation: {installation_id})")


async def get_github_token() -> Optional[str]:
    """Get a valid GitHub token (from App or fallback to PAT)."""
    if github_app_auth:
        return await github_app_auth.get_token()
    return None
