"""GitHub integration for creating issues via GitHub Actions."""

import aiohttp
from config import GITHUB_TOKEN, GITHUB_REPO


class GitHubManager:
    """Creates GitHub issues by triggering GitHub Actions workflow."""

    def __init__(self):
        self.token = GITHUB_TOKEN
        self.repo = GITHUB_REPO or "vaibhavcoding69/pollinations"

    async def create_issue(self, title: str, description: str, original_message: str,
                           reporter: str, original_author: str = None) -> dict:
        """
        Create a GitHub issue by triggering a repository_dispatch event.
        
        The GitHub Actions workflow will create the actual issue using GITHUB_TOKEN.
        
        Args:
            title: Issue title (from AI)
            description: Enhanced issue description (from AI)
            original_message: Original Discord message
            reporter: Discord username who triggered the bot
            original_author: Original author if different from reporter
            
        Returns:
            Dict with success status
        """
        if not self.token:
            return {"success": False, "error": "GITHUB_TOKEN not configured"}

        # Trigger repository_dispatch event
        url = f"https://api.github.com/repos/{self.repo}/dispatches"
        
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": f"Bearer {self.token}",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        
        payload = {
            "event_type": "discord-issue",
            "client_payload": {
                "title": title,
                "description": description,
                "original_message": original_message[:500],  # Limit size
                "reporter": reporter,
                "original_author": original_author
            }
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=30) as response:
                    if response.status == 204:
                        # Success - dispatch accepted (issue will be created by workflow)
                        return {
                            "success": True,
                            "issue_number": "pending",
                            "issue_url": f"https://github.com/{self.repo}/issues"
                        }
                    else:
                        error_text = await response.text()
                        return {"success": False, "error": f"GitHub API error: {response.status} - {error_text[:200]}"}
                        
        except Exception as e:
            return {"success": False, "error": str(e)}


# Singleton instance
github_manager = GitHubManager()