"""GitHub integration for creating issues directly via GitHub API."""

import aiohttp
from config import GITHUB_TOKEN, GITHUB_REPO


class GitHubManager:
    """Creates GitHub issues directly using the GitHub Issues API."""

    def __init__(self):
        self.token = GITHUB_TOKEN
        self.repo = GITHUB_REPO or "pollinations/pollinations"

    async def create_issue(self, title: str, description: str, original_message: str,
                           reporter: str, original_author: str = None) -> dict:
        """
        Create a GitHub issue directly via the GitHub Issues API.
        
        Args:
            title: Issue title (from AI)
            description: Enhanced issue description (from AI)
            original_message: Original Discord message
            reporter: Discord username who triggered the bot
            original_author: Original author if different from reporter
            
        Returns:
            Dict with success status and issue URL
        """
        if not self.token:
            return {"success": False, "error": "GITHUB_TOKEN not configured"}

        # Build the issue body
        body = f"{description}\n\n---\n"
        body += f"**Reported by:** {reporter} (via Discord)\n"
        if original_author and original_author != reporter:
            body += f"**Original author:** {original_author}\n"
        body += f"\n<details>\n<summary>Original Discord Message</summary>\n\n{original_message[:1000]}\n</details>"

        # Create issue directly via GitHub Issues API
        url = f"https://api.github.com/repos/{self.repo}/issues"
        
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": f"token {self.token}",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        
        payload = {
            "title": title,
            "body": body,
            "labels": ["discord-report"]
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=30) as response:
                    if response.status == 201:
                        data = await response.json()
                        return {
                            "success": True,
                            "issue_number": data["number"],
                            "issue_url": data["html_url"]
                        }
                    else:
                        error_text = await response.text()
                        return {"success": False, "error": f"GitHub API error: {response.status} - {error_text[:200]}"}
                        
        except Exception as e:
            return {"success": False, "error": str(e)}


# Singleton instance
github_manager = GitHubManager()