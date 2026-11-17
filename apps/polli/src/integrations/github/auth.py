import logging
import time

import aiohttp
import jwt

from ...core.config import config

logger = logging.getLogger(__name__)

TOKEN_REFRESH_BUFFER = 300
READ_ONLY_PERMISSIONS = {"contents": "read", "issues": "read", "pull_requests": "read", "metadata": "read"}


class GitHubAppAuth:
    def __init__(self, app_id: str, private_key: str, installation_id: str):
        self.app_id = app_id
        self.private_key = private_key
        self.installation_id = installation_id
        self._tokens: dict[str, tuple[str, float]] = {}
        self._session: aiohttp.ClientSession | None = None

    def _generate_jwt(self) -> str:
        now = int(time.time())
        logger.debug(f"Generating JWT at timestamp: {now}")
        payload = {"iat": now - 30, "exp": now + 60, "iss": self.app_id}
        return jwt.encode(payload, self.private_key, algorithm="RS256")

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def get_token(self, read_only_repo: str | None = None) -> str | None:
        """Installation token; with ``read_only_repo``, one that can only read that repo."""
        key = read_only_repo or ""
        token, expires_at = self._tokens.get(key, (None, 0))
        if token and time.time() < (expires_at - TOKEN_REFRESH_BUFFER):
            return token
        body = {"repositories": [read_only_repo], "permissions": READ_ONLY_PERMISSIONS} if read_only_repo else None

        logger.info("Fetching new GitHub App installation token%s...", " (read-only)" if read_only_repo else "")

        try:
            jwt_token = self._generate_jwt()
            session = await self._get_session()

            url = f"https://api.github.com/app/installations/{self.installation_id}/access_tokens"
            headers = {
                "Authorization": f"Bearer {jwt_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }

            async with session.post(url, headers=headers, json=body) as response:
                if response.status == 201:
                    data = await response.json()
                    self._tokens[key] = (data["token"], time.time() + 3600)
                    logger.info("GitHub App token refreshed successfully")
                    return data["token"]
                else:
                    error = await response.text()
                    logger.error(f"Failed to get installation token: {response.status} - {error}")
                    return None

        except Exception as e:
            logger.error(f"Error getting GitHub App token: {e}")
            return None


github_app_auth: GitHubAppAuth | None = None


def init_github_app(app_id: str, private_key: str, installation_id: str):
    global github_app_auth
    github_app_auth = GitHubAppAuth(app_id, private_key, installation_id)
    logger.info(f"GitHub App auth initialized (App ID: {app_id}, Installation: {installation_id})")


def has_github_auth() -> bool:
    return github_app_auth is not None or bool(config.github.token)


async def get_github_token(*, for_projects: bool = False) -> str | None:
    if github_app_auth:
        token = await github_app_auth.get_token()
        if token:
            if for_projects:
                logger.debug("Using GitHub App token for project operation")
            return token
    if for_projects:
        if config.github.project_pat:
            logger.debug("Falling back to GITHUB_PROJECT_PAT for project operation")
            return config.github.project_pat
        logger.warning("ProjectV2 operation: No GitHub App or GITHUB_PROJECT_PAT configured")
        return None
    return config.github.token or None


async def get_github_read_token() -> str | None:
    """Token for requests the model writes itself: read-only and limited to the bot's repo,
    so GitHub refuses anything else. No PAT fallback, since a PAT can't be narrowed."""
    if not github_app_auth:
        return None
    return await github_app_auth.get_token(read_only_repo=config.bot.default_repo.split("/")[-1])
