"""
GitHub Webhook Server for bidirectional GitHub ↔ Discord communication.

Receives webhooks when @mentioned in GitHub issues/PRs/comments and:
1. Processes the mention with AI (reusing bot's tool system)
2. Posts response back to GitHub
3. Optionally notifies Discord
"""

import hashlib
import hmac
import json
import logging
from typing import Optional

from aiohttp import web

from ..config import config

logger = logging.getLogger(__name__)


class GitHubWebhookServer:
    """
    HTTP server that receives GitHub webhooks for @mentions.

    Supports:
    - Issue comments (@mention in issue)
    - PR comments (@mention in PR)
    - PR review comments (@mention in review)
    - Issue/PR body (@mention when created/edited)
    """

    def __init__(self, discord_bot=None):
        self.app = web.Application()
        self.runner: Optional[web.AppRunner] = None
        self.site: Optional[web.TCPSite] = None
        self.discord_bot = discord_bot

        # Setup routes
        self.app.router.add_post("/webhook", self.handle_webhook)
        self.app.router.add_get("/health", self.health_check)

    async def start(self):
        """Start the webhook server."""
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, "0.0.0.0", config.webhook_port)
        await self.site.start()
        logger.info(f"GitHub webhook server started on port {config.webhook_port}")

    async def stop(self):
        """Stop the webhook server."""
        if self.runner:
            await self.runner.cleanup()
        logger.info("GitHub webhook server stopped")

    async def health_check(self, request: web.Request) -> web.Response:
        """Health check endpoint."""
        return web.json_response({"status": "ok", "service": "polly-webhook"})

    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """Verify GitHub webhook signature."""
        if not config.webhook_secret:
            # SECURITY: Reject all webhooks if no secret configured
            logger.error(
                "GITHUB_WEBHOOK_SECRET not configured - rejecting webhook for security"
            )
            return False

        if not signature:
            logger.warning("Webhook received without signature header")
            return False

        # GitHub sends signature as "sha256=<hash>"
        if signature.startswith("sha256="):
            signature = signature[7:]

        expected = hmac.new(
            config.webhook_secret.encode(), payload, hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected, signature)

    async def handle_webhook(self, request: web.Request) -> web.Response:
        """Handle incoming GitHub webhook."""
        # Read payload
        payload = await request.read()

        # Verify signature
        signature = request.headers.get("X-Hub-Signature-256", "")
        if not self.verify_signature(payload, signature):
            logger.warning("Invalid webhook signature")
            return web.json_response({"error": "Invalid signature"}, status=401)

        # Parse JSON
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        # Check repo whitelist
        repo = data.get("repository", {}).get("full_name", "")
        if not config.is_repo_whitelisted(repo):
            logger.info(f"Ignoring webhook from non-whitelisted repo: {repo}")
            return web.json_response(
                {"status": "ignored", "reason": "repo not whitelisted"}
            )

        # Get event type
        event_type = request.headers.get("X-GitHub-Event", "")
        logger.info(f"Received webhook: {event_type} from {repo}")

        # Route to appropriate handler
        try:
            if event_type == "issue_comment":
                await self.handle_issue_comment(data)
            elif event_type == "issues":
                await self.handle_issue_event(data)
            elif event_type == "pull_request":
                await self.handle_pr_event(data)
            elif event_type == "pull_request_review_comment":
                await self.handle_pr_review_comment(data)
            elif event_type == "pull_request_review":
                await self.handle_pr_review(data)
            else:
                logger.debug(f"Ignoring event type: {event_type}")

        except Exception as e:
            logger.error(f"Error handling webhook: {e}", exc_info=True)
            # Still return 200 to prevent GitHub retries

        return web.json_response({"status": "ok"})

    def is_mentioned(self, body: str) -> bool:
        """Check if bot is @mentioned in the body."""
        if not body:
            return False
        mention = f"@{config.github_bot_username}"
        return mention.lower() in body.lower()

    async def handle_issue_comment(self, data: dict):
        """Handle issue_comment event - someone commented on an issue/PR."""
        action = data.get("action")
        if action not in ("created", "edited"):
            return

        comment = data.get("comment", {})
        body = comment.get("body", "")

        if not self.is_mentioned(body):
            return

        # Don't respond to our own comments
        commenter = comment.get("user", {}).get("login", "")
        if commenter.lower() == config.github_bot_username.lower():
            return

        issue = data.get("issue", {})
        repo = data.get("repository", {})

        context = {
            "type": "issue_comment",
            "repo": repo.get("full_name"),
            "issue_number": issue.get("number"),
            "issue_title": issue.get("title"),
            "issue_state": issue.get("state"),
            "is_pr": "pull_request" in issue,
            "comment_id": comment.get("id"),
            "comment_body": body,
            "commenter": commenter,
            "issue_body": issue.get("body", ""),
        }

        await self.process_mention(context)

    async def handle_issue_event(self, data: dict):
        """Handle issues event - issue opened/edited with @mention."""
        action = data.get("action")
        if action not in ("opened", "edited"):
            return

        issue = data.get("issue", {})
        body = issue.get("body", "")

        if not self.is_mentioned(body):
            return

        author = issue.get("user", {}).get("login", "")
        if author.lower() == config.github_bot_username.lower():
            return

        repo = data.get("repository", {})

        context = {
            "type": "issue_body",
            "repo": repo.get("full_name"),
            "issue_number": issue.get("number"),
            "issue_title": issue.get("title"),
            "issue_state": issue.get("state"),
            "is_pr": False,
            "issue_body": body,
            "author": author,
        }

        await self.process_mention(context)

    async def handle_pr_event(self, data: dict):
        """Handle pull_request event - PR opened/edited with @mention."""
        action = data.get("action")
        if action not in ("opened", "edited"):
            return

        pr = data.get("pull_request", {})
        body = pr.get("body", "")

        if not self.is_mentioned(body):
            return

        author = pr.get("user", {}).get("login", "")
        if author.lower() == config.github_bot_username.lower():
            return

        repo = data.get("repository", {})

        context = {
            "type": "pr_body",
            "repo": repo.get("full_name"),
            "pr_number": pr.get("number"),
            "pr_title": pr.get("title"),
            "pr_state": pr.get("state"),
            "is_pr": True,
            "pr_body": body,
            "author": author,
            "head_branch": pr.get("head", {}).get("ref"),
            "base_branch": pr.get("base", {}).get("ref"),
        }

        await self.process_mention(context)

    async def handle_pr_review_comment(self, data: dict):
        """Handle PR review comment (inline code comment)."""
        action = data.get("action")
        if action not in ("created", "edited"):
            return

        comment = data.get("comment", {})
        body = comment.get("body", "")

        if not self.is_mentioned(body):
            return

        commenter = comment.get("user", {}).get("login", "")
        if commenter.lower() == config.github_bot_username.lower():
            return

        pr = data.get("pull_request", {})
        repo = data.get("repository", {})

        context = {
            "type": "pr_review_comment",
            "repo": repo.get("full_name"),
            "pr_number": pr.get("number"),
            "pr_title": pr.get("title"),
            "is_pr": True,
            "comment_id": comment.get("id"),
            "comment_body": body,
            "commenter": commenter,
            "file_path": comment.get("path"),
            "line": comment.get("line"),
            "diff_hunk": comment.get("diff_hunk", ""),
        }

        await self.process_mention(context)

    async def handle_pr_review(self, data: dict):
        """Handle PR review submission with @mention."""
        action = data.get("action")
        if action != "submitted":
            return

        review = data.get("review", {})
        body = review.get("body", "")

        if not self.is_mentioned(body):
            return

        reviewer = review.get("user", {}).get("login", "")
        if reviewer.lower() == config.github_bot_username.lower():
            return

        pr = data.get("pull_request", {})
        repo = data.get("repository", {})

        context = {
            "type": "pr_review",
            "repo": repo.get("full_name"),
            "pr_number": pr.get("number"),
            "pr_title": pr.get("title"),
            "is_pr": True,
            "review_id": review.get("id"),
            "review_body": body,
            "review_state": review.get("state"),
            "reviewer": reviewer,
        }

        await self.process_mention(context)

    async def process_mention(self, context: dict):
        """
        Process a @mention from GitHub.

        1. Build a prompt from the context
        2. Call AI with tools
        3. Post response back to GitHub
        """
        logger.info(
            f"Processing GitHub mention: {context['type']} in {context.get('repo')}"
        )

        from .pollinations import pollinations_client

        # Get the GitHub username
        github_user = (
            context.get("commenter") or context.get("author") or context.get("reviewer")
        )

        # Check if user is a GitHub admin
        is_admin = config.is_github_admin(github_user or "")
        logger.info(f"GitHub user @{github_user} is_admin={is_admin}")

        # If admin_only_mentions is enabled, reject non-admin users
        if config.github_admin_only_mentions and not is_admin:
            logger.info(
                f"Rejecting mention from non-admin user @{github_user} (admin_only_mentions=true)"
            )
            error_msg = (
                f"Sorry @{github_user}, I'm currently configured to only respond to authorized team members. "
                "If you need assistance, please reach out to the maintainers or join our Discord."
            )
            await self._post_github_response(context, error_msg)
            return

        # Build the user message from context
        user_message = self._build_prompt(context, is_admin)

        # Process with AI
        try:
            result = await pollinations_client.process_with_tools(
                user_message=user_message,
                discord_username=f"github:{github_user}",
                thread_history=None,
                image_urls=[],
                is_admin=is_admin,
            )

            response_text = result.get("response", "")

            if response_text:
                await self._post_github_response(context, response_text)

        except Exception as e:
            logger.error(f"Error processing GitHub mention: {e}", exc_info=True)
            error_msg = "Sorry, I encountered an error processing your request. Please try again or ask in Discord."
            await self._post_github_response(context, error_msg)

    def _build_prompt(self, context: dict, is_admin: bool) -> str:
        """Build a prompt for the AI from the GitHub context."""
        ctx_type = context["type"]
        admin_note = (
            ""
            if is_admin
            else "\n\n**Note: This user does NOT have admin privileges. Read-only operations only.**"
        )

        if ctx_type == "issue_comment":
            return f"""[GitHub Issue Comment]
Repository: {context['repo']}
Issue #{context['issue_number']}: {context['issue_title']} ({context['issue_state']})
Is PR: {context['is_pr']}

Issue description:
{context.get('issue_body', 'No description')}

Comment from @{context['commenter']}:
{context['comment_body']}

Respond to their request. You can use tools to help. Keep response concise for GitHub.{admin_note}"""

        elif ctx_type == "issue_body":
            return f"""[GitHub Issue Mention]
Repository: {context['repo']}
Issue #{context['issue_number']}: {context['issue_title']}
Author: @{context['author']}

Issue body:
{context['issue_body']}

The author mentioned you in this issue. Respond helpfully. You can use tools.{admin_note}"""

        elif ctx_type == "pr_body":
            return f"""[GitHub PR Mention]
Repository: {context['repo']}
PR #{context['pr_number']}: {context['pr_title']}
Author: @{context['author']}
Branch: {context['head_branch']} → {context['base_branch']}

PR description:
{context['pr_body']}

The author mentioned you in this PR. Respond helpfully. You can use tools like github_pr to review.{admin_note}"""

        elif ctx_type == "pr_review_comment":
            return f"""[GitHub PR Review Comment]
Repository: {context['repo']}
PR #{context['pr_number']}: {context['pr_title']}
File: {context['file_path']} (line {context.get('line', '?')})

Code context:
```
{context.get('diff_hunk', 'No diff available')}
```

Comment from @{context['commenter']}:
{context['comment_body']}

Respond to their code question/request. Be concise.{admin_note}"""

        elif ctx_type == "pr_review":
            return f"""[GitHub PR Review]
Repository: {context['repo']}
PR #{context['pr_number']}: {context['pr_title']}
Review by @{context['reviewer']} ({context['review_state']})

Review comment:
{context['review_body']}

Respond to the reviewer's feedback.{admin_note}"""

        else:
            return f"[GitHub Mention]\n{json.dumps(context, indent=2)}{admin_note}"

    async def _post_github_response(self, context: dict, response: str):
        """Post response back to GitHub using shared session."""
        from .github_auth import github_app_auth
        from .github import github_manager

        repo = context.get("repo")
        if not repo:
            logger.error("No repo in context, cannot post response")
            return

        # Get authenticated client
        if github_app_auth:
            token = await github_app_auth.get_token()
            headers = {
                "Authorization": f"token {token}",
                "Accept": "application/vnd.github.v3+json",
            }
        else:
            headers = {
                "Authorization": f"token {config.github_token}",
                "Accept": "application/vnd.github.v3+json",
            }

        import aiohttp

        ctx_type = context["type"]

        # Build URL based on context type
        if ctx_type in ("issue_comment", "issue_body"):
            issue_number = context["issue_number"]
            url = f"https://api.github.com/repos/{repo}/issues/{issue_number}/comments"

        elif ctx_type in ("pr_body", "pr_review"):
            pr_number = context["pr_number"]
            url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"

        elif ctx_type == "pr_review_comment":
            comment_id = context["comment_id"]
            pr_number = context["pr_number"]
            url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/comments/{comment_id}/replies"

        else:
            logger.warning(f"Unknown context type for response: {ctx_type}")
            return

        payload = {"body": response}

        # Use shared session from github_manager for connection pooling
        try:
            session = await github_manager.get_session()
            async with session.post(
                url,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status in (200, 201):
                    logger.info(f"Posted response to GitHub: {url}")
                else:
                    error = await resp.text()
                    logger.error(f"Failed to post to GitHub ({resp.status}): {error}")
        except Exception as e:
            logger.error(f"Error posting to GitHub: {e}")


# Global instance
webhook_server: Optional[GitHubWebhookServer] = None


async def start_webhook_server(discord_bot=None):
    """Start the webhook server if enabled."""
    global webhook_server

    if not config.webhook_enabled:
        logger.info("Webhook server disabled in config")
        return None

    webhook_server = GitHubWebhookServer(discord_bot)
    await webhook_server.start()
    return webhook_server


async def stop_webhook_server():
    """Stop the webhook server."""
    global webhook_server
    if webhook_server:
        await webhook_server.stop()
        webhook_server = None
