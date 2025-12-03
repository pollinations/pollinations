"""GitHub integration for creating issues."""

from datetime import datetime
from github import Github, GithubException
from config import GITHUB_TOKEN, GITHUB_REPO


class GitHubManager:
    """Manages GitHub issue creation."""

    def __init__(self):
        self.github = Github(GITHUB_TOKEN) if GITHUB_TOKEN else None
        self.repo = None
        if self.github and GITHUB_REPO:
            try:
                self.repo = self.github.get_repo(GITHUB_REPO)
            except GithubException as e:
                print(f"Failed to connect to GitHub repo: {e}")

    async def create_issue(self, title: str, description: str, original_message: str,
                           reporter: str, original_author: str = None) -> dict:
        """
        Create a GitHub issue with enhanced description.
        
        Args:
            title: Issue title (from AI)
            description: Enhanced issue description (from AI)
            original_message: Original Discord message
            reporter: Discord username who triggered the bot
            original_author: Original author if different from reporter
            
        Returns:
            Dict with issue info or error
        """
        if not self.repo:
            return {"success": False, "error": "GitHub not configured"}

        # Build the issue body
        author_line = f"**Author:** {original_author}" if original_author else f"**Author:** {reporter}"
        reporter_line = f"**Reported by:** {reporter}" if original_author else ""
        
        body = f"""{description}

---

### Original Message
> {original_message}

### Discord Info
{author_line}
{reporter_line}
_Created: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC_
"""

        try:
            issue = self.repo.create_issue(
                title=title,
                body=body.strip(),
                labels=["discord-report"]
            )

            return {
                "success": True,
                "issue_number": issue.number,
                "issue_url": issue.html_url
            }
            
        except GithubException as e:
            return {"success": False, "error": str(e)}


# Singleton instance
github_manager = GitHubManager()