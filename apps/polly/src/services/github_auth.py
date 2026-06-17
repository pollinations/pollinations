import logging
import time

import aiohttp
import jwt

logger = logging.getLogger(__name__)

TOKEN_REFRESH_BUFFER = 300


class GitHubAppAuth:
    def __init__(self, app_id: str, private_key: str, installation_id: str):
        self.app_id = app_id
        self.private_key = private_key
        self.installation_id = installation_id
        self._token: str | None = None
        self._token_expires_at: float = 0
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

    async def get_token(self) -> str | None:
        if self._token and time.time() < (self._token_expires_at - TOKEN_REFRESH_BUFFER):
            return self._token

        logger.info("Fetching new GitHub App installation token...")

        try:
            jwt_token = self._generate_jwt()
            session = await self._get_session()

            url = f"https://api.github.com/app/installations/{self.installation_id}/access_tokens"
            headers = {
                "Authorization": f"Bearer {jwt_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }

            async with session.post(url, headers=headers) as response:
                if response.status == 201:
                    data = await response.json()
                    self._token = data["token"]
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


github_app_auth: GitHubAppAuth | None = None


def init_github_app(app_id: str, private_key: str, installation_id: str):
    global github_app_auth
    github_app_auth = GitHubAppAuth(app_id, private_key, installation_id)
    logger.info(f"GitHub App auth initialized (App ID: {app_id}, Installation: {installation_id})")


async def get_github_token() -> str | None:
    if github_app_auth:
        return await github_app_auth.get_token()
    return None
