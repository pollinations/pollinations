"""Discord bot - Full GitHub Issues bridge with native tool calling."""

import asyncio
import base64
import io
import logging
import re
from typing import Optional, Union

import discord
from discord.ext import commands, tasks

from .config import config
from .context import session_manager, ConversationSession
from .services.github import github_manager, TOOL_HANDLERS
from .services.github_graphql import github_graphql
from .services.github_pr import github_pr_manager
from .services.github_auth import init_github_app, github_app_auth
from .services.pollinations import pollinations_client
from .services.subscriptions import subscription_manager, init_notifier
from .services.code_agent.tools import TOOL_HANDLERS as CODE_AGENT_HANDLERS
from .services.code_agent.sandbox import get_persistent_sandbox
from .services.webhook_server import start_webhook_server, stop_webhook_server

logger = logging.getLogger(__name__)

# =============================================================================
# PR MERGE NOTIFICATION (triggers embedding updates)
# =============================================================================
PR_MERGE_CHANNEL_ID = 1433858964658852081
PR_MERGE_WEBHOOK_ID = 1433141915397652532

# Thread settings
THREAD_AUTO_ARCHIVE_MINUTES = 60
THREAD_HISTORY_LIMIT = 50


def is_admin(user: discord.User | discord.Member) -> bool:
    """Check if a user has any of the configured admin roles."""
    if not config.admin_role_ids:
        logger.debug(f"No admin_role_ids configured, user {user} is not admin")
        return False
    if isinstance(user, discord.Member):
        user_role_ids = [r.id for r in user.roles]
        is_admin_user = any(
            role_id in config.admin_role_ids for role_id in user_role_ids
        )
        logger.debug(
            f"Admin check for {user}: roles={user_role_ids}, admin_role_ids={config.admin_role_ids}, is_admin={is_admin_user}"
        )
        return is_admin_user
    logger.debug(f"User {user} is not a Member (type={type(user).__name__}), not admin")
    return False


# Video file extensions and domains
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".gif", ".apng"}
VIDEO_DOMAINS = {"youtube.com", "youtu.be", "vimeo.com", "twitch.tv", "streamable.com"}

# Text/code file extensions - should NOT be sent as images
TEXT_FILE_EXTENSIONS = {
    ".txt",
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".json",
    ".yaml",
    ".yml",
    ".md",
    ".csv",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".log",
    ".ini",
    ".cfg",
    ".toml",
    ".env",
    ".sh",
    ".bash",
    ".zsh",
    ".bat",
    ".ps1",
    ".sql",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".swift",
    ".kt",
}

# Image file extensions - static images only (animated ones like .gif go as video)
IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tiff",
    ".tif",
    ".ico",
    ".svg",
    ".heic",
    ".heif",
    ".avif",
    ".jfif",
    ".pjpeg",
    ".pjp",
    ".raw",
    ".cr2",
    ".nef",
    ".orf",
    ".sr2",
    ".dng",  # RAW formats
}


def is_video_url(url: str) -> bool:
    """Check if URL points to a video (by extension or domain)."""
    url_lower = url.lower()
    # Check file extension
    for ext in VIDEO_EXTENSIONS:
        if ext in url_lower:
            return True
    # Check video hosting domains
    for domain in VIDEO_DOMAINS:
        if domain in url_lower:
            return True
    return False


def is_text_file_url(url: str) -> bool:
    """Check if URL points to a text/code file that shouldn't be sent as image."""
    url_lower = url.lower()
    for ext in TEXT_FILE_EXTENSIONS:
        if ext in url_lower:
            return True
    return False


def is_image_url(url: str) -> bool:
    """Check if URL is explicitly an image file."""
    url_lower = url.lower()
    for ext in IMAGE_EXTENSIONS:
        if ext in url_lower:
            return True
    return False


def decode_base64_images(content_blocks: list[dict], max_images: int = 10) -> list[discord.File]:
    """
    Decode base64 images from content_blocks to discord.File objects.

    content_blocks format from code_execution:
    [{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}]

    Args:
        content_blocks: List of content blocks from API response
        max_images: Maximum number of images to decode (Discord limit is 10)

    Returns:
        List of discord.File objects ready to send
    """
    files = []
    image_count = 0

    for block in content_blocks:
        if image_count >= max_images:
            break

        if block.get("type") != "image_url":
            continue

        image_url = block.get("image_url", {}).get("url", "")
        if not image_url.startswith("data:image/"):
            continue

        try:
            # Parse data URL: data:image/png;base64,<data>
            header, b64_data = image_url.split(",", 1)
            # Extract mime type: data:image/png;base64 -> image/png
            mime_type = header.split(":")[1].split(";")[0]
            # Get file extension from mime type
            ext = mime_type.split("/")[1]
            if ext == "jpeg":
                ext = "jpg"

            # Decode base64
            image_bytes = base64.b64decode(b64_data)

            # Create discord.File
            file_buffer = io.BytesIO(image_bytes)
            filename = f"code_execution_{image_count + 1}.{ext}"
            files.append(discord.File(file_buffer, filename=filename))

            image_count += 1
            logger.info(f"Decoded base64 image: {filename} ({len(image_bytes)} bytes)")

        except Exception as e:
            logger.warning(f"Failed to decode base64 image: {e}")
            continue

    return files


def extract_media_urls(
    message: discord.Message,
) -> tuple[list[str], list[str], list[str]]:
    """
    Extract media URLs from Discord message, separating images, videos, and text files.

    Returns:
        Tuple of (image_urls, video_urls, file_urls)

    Handles:
    - Direct attachments (uploaded files)
    - Embedded images (from links)
    - YouTube/video links (embed.video.url or embed.url)
    - GIFs (treated as video)
    - Tenor/Giphy GIFs
    - Text/code files (returned separately, NOT as images)
    """
    image_urls = []
    video_urls = []
    file_urls = []

    # Process attachments - use content_type FIRST (Discord provides this reliably)
    # Order: image -> video -> text file -> fallback
    for attachment in message.attachments:
        url = attachment.url
        content_type = getattr(attachment, "content_type", "") or ""

        # Images first (highest priority for vision)
        if content_type.startswith("image/") and "gif" not in content_type:
            image_urls.append(url)
        elif is_image_url(url) and ".gif" not in url.lower():
            image_urls.append(url)
        # Videos (including GIFs)
        elif content_type.startswith("video/") or content_type == "image/gif":
            video_urls.append(url)
        elif is_video_url(url):
            video_urls.append(url)
        # Text/code files
        elif content_type.startswith("text/") or content_type in ("application/json", "application/javascript"):
            file_urls.append(url)
        elif is_text_file_url(url):
            file_urls.append(url)
        # Fallback - unknown goes to files
        else:
            file_urls.append(url)

    # Process embeds
    for embed in message.embeds:
        # YouTube and other video embeds - check embed.url first (the actual link)
        if embed.url and is_video_url(embed.url):
            video_urls.append(embed.url)
        # Video embed URL (Tenor/Giphy GIFs, video players)
        elif embed.video and embed.video.url:
            video_urls.append(embed.video.url)
        # Regular embedded images
        elif embed.image and embed.image.url:
            if is_video_url(embed.image.url):
                video_urls.append(embed.image.url)
            else:
                image_urls.append(embed.image.url)
        # Thumbnail as fallback (static preview) - only if not a video embed
        elif embed.thumbnail and embed.thumbnail.url and not embed.video:
            image_urls.append(embed.thumbnail.url)

    return image_urls, video_urls, file_urls


def extract_attachment_urls(message: discord.Message) -> list[str]:
    """
    Extract ALL attachment URLs from Discord message (legacy, returns combined list).
    Use extract_media_urls() for separated image/video/file lists.
    """
    image_urls, video_urls, file_urls = extract_media_urls(message)
    return image_urls + video_urls + file_urls


# Keep old name for backward compatibility
extract_image_urls = extract_attachment_urls


async def _code_search_handler(query: str, top_k: int = 10, **kwargs) -> dict:
    """Handler for code_search tool - semantic search across repository."""
    from .services.embeddings import search_code, get_stats

    # Validate top_k
    top_k = min(max(1, top_k), 10)

    try:
        results = await search_code(query, top_k=top_k)

        if not results:
            stats = get_stats()
            return {
                "results": [],
                "message": f"No matching code found. Embeddings contain {stats['total_chunks']} chunks.",
            }

        return {
            "results": [
                {
                    "file": r["file_path"],
                    "lines": f"{r['start_line']}-{r['end_line']}",
                    "similarity": r["similarity"],
                    "code": r["content"],
                }
                for r in results
            ],
            "message": f"Found {len(results)} relevant code sections",
        }
    except Exception as e:
        logger.error(f"Code search failed: {e}")
        return {"error": str(e)}


async def _doc_search_handler(query: str, top_k: int = 5, **kwargs) -> dict:
    """Handler for doc_search tool - semantic search across documentation sites."""
    from .services.doc_embeddings import search_docs, get_doc_stats

    # Validate top_k
    top_k = min(max(1, top_k), 10)

    try:
        results = await search_docs(query, top_k=top_k)

        if not results:
            stats = get_doc_stats()
            return {
                "results": [],
                "message": f"No matching documentation found. Index contains {stats['total_chunks']} chunks.",
            }

        return {
            "results": [
                {
                    "title": r["page_title"],
                    "section": r.get("section", ""),
                    "url": r["url"],
                    "site": r.get("site", ""),
                    "similarity": r["similarity"],
                    "excerpt": r["content"][:500] + ("..." if len(r["content"]) > 500 else ""),
                }
                for r in results
            ],
            "message": f"Found {len(results)} relevant documentation sections",
        }
    except Exception as e:
        logger.error(f"Documentation search failed: {e}")
        return {"error": str(e)}


async def fetch_thread_history(
    thread: discord.Thread, limit: int = THREAD_HISTORY_LIMIT
) -> list[dict]:
    """
    Fetch message history from a thread and format for AI context.
    This is our "memory" - pulled fresh from Discord each time.

    Also includes existing task state if there's an active coding task for this thread.

    NOTE: We skip the most recent message (limit+1 then [1:]) because that's the
    current message being processed - it gets added separately in process_with_tools.
    """
    messages = []

    # Check for existing task state - this is CRITICAL for follow-up commands
    # Without this, the AI doesn't know what polly_agent already did in this thread
    task_context = _get_task_context_for_thread(str(thread.id))
    if task_context:
        messages.append({"role": "system", "content": task_context})

    try:
        # Add thread name as context
        messages.append({"role": "system", "content": f"Thread: {thread.name}"})

        # Fetch the starter message (the message the thread was created from)
        # and add it as the FIRST user message so AI sees it as the original question
        starter_msg = None
        try:
            # Thread ID == starter message ID, fetch from PARENT channel
            # Only TextChannel has fetch_message, ForumChannel does not
            if thread.parent and isinstance(thread.parent, discord.TextChannel):
                logger.info(
                    f"Fetching starter message: thread.id={thread.id}, parent={thread.parent}"
                )
                starter = await thread.parent.fetch_message(thread.id)
                logger.info(
                    f"Starter message fetched: author={starter.author if starter else None}, content={starter.content[:100] if starter and starter.content else 'EMPTY'}"
                )
                if starter and starter.content:
                    # Add starter as first user message in conversation
                    starter_msg = {
                        "role": "user",
                        "content": f"[{starter.author.name}] (THREAD STARTER MESSAGE): {starter.content}",
                    }
            else:
                logger.warning(f"Thread {thread.id} has no parent channel")
        except Exception as e:
            logger.warning(f"Failed to fetch starter message: {e}")

        # Fetch most recent messages (newest first), then reverse to chronological order
        # Skip the first message (newest) since that's the current message being processed
        # It will be added separately in process_with_tools to avoid duplication
        fetched = []
        is_first = True
        async for msg in thread.history(
            limit=limit + 1
        ):  # +1 to account for skipping current
            if is_first:
                is_first = False
                continue  # Skip the current message (newest)
            if msg.author.bot:
                fetched.append({"role": "assistant", "content": msg.content})
            else:
                fetched.append(
                    {"role": "user", "content": f"[{msg.author.name}]: {msg.content}"}
                )
        # Reverse to chronological order (oldest to newest)
        # Add starter message FIRST, then thread messages
        if starter_msg:
            messages.append(starter_msg)
        messages.extend(reversed(fetched))
    except Exception as e:
        logger.warning(f"Failed to fetch thread history: {e}")
    return messages


def _get_task_context_for_thread(thread_id: str) -> str | None:
    """
    Get existing task context for a thread to help AI understand what's already been done.

    This prevents the AI from calling polly_agent(action="task") again when the user
    asks to "open a branch" or "push changes" - instead it knows to use push/open_pr.
    """
    from .services.code_agent.tools.polly_agent import _running_tasks

    task = _running_tasks.get(thread_id)
    if not task:
        return None

    branch_name = task.get("branch_name")
    files_changed = task.get("files_changed", [])
    phase = task.get("phase", "unknown")
    original_task = task.get("task", "")
    ccr_history = task.get("ccr_history", [])

    if not branch_name:
        return None

    # Build context message for AI
    context_parts = [
        "## EXISTING TASK STATE (polly_agent already ran in this thread)",
        f"- **Branch**: `{branch_name}` (changes on local branch)",
        f"- **Phase**: {phase}",
        f"- **Original task**: {original_task}",
    ]

    # Include ccr interaction history - this is the SHORT-TERM MEMORY
    # Now with STRUCTURED summaries instead of raw truncated output
    if ccr_history:
        context_parts.append("")
        context_parts.append("### CCR Interaction History (bot AI ↔ ccr)")
        context_parts.append("*Showing last 5 interactions with structured summaries*")
        context_parts.append("")

        for i, interaction in enumerate(ccr_history[-5:], 1):  # Show last 5 (was 3)
            timestamp = interaction.get("timestamp", "unknown time")
            success = "✅" if interaction.get("success") else "❌"

            context_parts.append(f"**[{i}] {success} Task:**")
            context_parts.append(
                f"> {interaction.get('prompt', '')[:800]}"
            )  # Increased from 500

            # Show structured summary (new format)
            summary = interaction.get("summary", "")
            if summary:
                context_parts.append(f"**Summary:**")
                context_parts.append(f"```\n{summary}\n```")

            # Show actions taken
            actions = interaction.get("actions", [])
            if actions:
                context_parts.append(f"**Actions:** {', '.join(actions)}")

            # Show files changed
            files = interaction.get("files_changed", [])
            if files:
                files_str = ", ".join(files[:8])
                if len(files) > 8:
                    files_str += f" (+{len(files) - 8} more)"
                context_parts.append(f"**Files:** {files_str}")

            # Show errors if any
            errors = interaction.get("errors", [])
            if errors:
                context_parts.append(f"**Errors:** {errors[0][:200]}")

            # Show todos if available
            todos = interaction.get("todos", [])
            if todos:
                todo_summary = [
                    f"{'✓' if t['status']=='completed' else '○'} {t['content'][:50]}"
                    for t in todos[:5]
                ]
                context_parts.append(f"**Todos:** {', '.join(todo_summary)}")

            context_parts.append("")  # Blank line between interactions

    if files_changed:
        files_list = ", ".join(files_changed[:10])
        if len(files_changed) > 10:
            files_list += f" (+{len(files_changed) - 10} more)"
        context_parts.append(f"- **Files changed**: {files_list}")

    # Include bot AI notes - persistent "notes to self"
    bot_notes = task.get("bot_notes", [])
    if bot_notes:
        context_parts.append("")
        context_parts.append("### Bot AI Notes (your notes to self)")
        context_parts.append("*These are notes you saved in previous interactions*")
        context_parts.append("")

        # Group notes by category for readability
        notes_by_category = {}
        for note in bot_notes[-15:]:  # Show last 15 notes
            cat = note.get("category", "context")
            if cat not in notes_by_category:
                notes_by_category[cat] = []
            notes_by_category[cat].append(note)

        # Display order: decision > warning > todo > preference > context
        category_order = ["decision", "warning", "todo", "preference", "context"]
        for cat in category_order:
            if cat in notes_by_category:
                cat_icon = {
                    "decision": "🎯",
                    "warning": "⚠️",
                    "todo": "📋",
                    "preference": "💡",
                    "context": "📝",
                }.get(cat, "📝")
                context_parts.append(f"**{cat_icon} {cat.title()}:**")
                for note in notes_by_category[cat]:
                    context_parts.append(f"- {note['content']}")
                context_parts.append("")

    # Track original user for confirmation flow
    original_user = task.get("user")
    original_user_id = task.get("user_id")
    pending_confirmation = task.get("pending_confirmation")

    if original_user:
        context_parts.append(
            f"- **Task owner**: {original_user} (only they can confirm actions)"
        )

    # Show pending confirmation if any
    if pending_confirmation:
        context_parts.append("")
        context_parts.append(
            f"⏳ **WAITING FOR USER CONFIRMATION**: {pending_confirmation}"
        )
        context_parts.append("Wait for user response before proceeding.")

    context_parts.extend(
        [
            "",
            "⚠️ **FOLLOW-UP RULES**:",
            "- push/open_pr: Use these for follow-ups, NOT task again!",
            "- Only task owner can confirm destructive ops",
            "",
            "**Actions:**",
            "- `action='push'` - Push branch to GitHub",
            "- `action='open_pr'` - Create PR",
            "- `action='task'` - More coding (same branch)",
        ]
    )

    return "\n".join(context_parts)


class PollyBot(commands.Bot):
    """Discord bot for GitHub Issues bridge with tool calling."""

    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents)
        self.issue_notifier = None
        self.webhook_server = None

    async def setup_hook(self):
        """Called when the bot is starting up."""
        # Initialize GitHub App auth if configured
        if config.use_github_app:
            init_github_app(
                app_id=config.github_app_id,
                private_key=config.github_private_key,
                installation_id=config.github_installation_id,
            )
            logger.info("GitHub App authentication initialized")
        else:
            logger.info("Using GitHub PAT authentication")

        # Register tool handlers with pollinations client
        for name, handler in TOOL_HANDLERS.items():
            pollinations_client.register_tool_handler(name, handler)
        logger.info(f"Registered {len(TOOL_HANDLERS)} GitHub tool handlers")

        # Register code agent tool handlers
        for name, handler in CODE_AGENT_HANDLERS.items():
            pollinations_client.register_tool_handler(name, handler)
        logger.info(f"Registered {len(CODE_AGENT_HANDLERS)} code agent tool handlers")

        # Register code_search handler if embeddings enabled
        if config.local_embeddings_enabled:
            from .services.embeddings import search_code

            pollinations_client.register_tool_handler(
                "code_search", _code_search_handler
            )
            logger.info("Registered code_search tool handler (embeddings enabled)")

        # Register doc_search handler if doc embeddings enabled
        if config.doc_embeddings_enabled:
            from .services.doc_embeddings import search_docs

            pollinations_client.register_tool_handler(
                "doc_search", _doc_search_handler
            )
            logger.info("Registered doc_search tool handler (doc embeddings enabled)")

        # Register web_search handler (always available)
        from .services.pollinations import web_search_handler, web_handler

        pollinations_client.register_tool_handler("web_search", web_search_handler)
        logger.info("Registered web_search tool handler")

        # Register web handler (nomnom - deep research)
        pollinations_client.register_tool_handler("web", web_handler)
        logger.info("Registered web tool handler (nomnom)")

        # Register web_scrape handler (always available - Crawl4AI powered)
        from .services.web_scraper import web_scrape_handler

        pollinations_client.register_tool_handler("web_scrape", web_scrape_handler)
        logger.info("Registered web_scrape tool handler (Crawl4AI)")

        # Register discord_search handler (full guild search capabilities)
        from .services.discord_search import tool_discord_search

        pollinations_client.register_tool_handler("discord_search", tool_discord_search)
        logger.info("Registered discord_search tool handler")

        # Initialize and start the issue notifier
        self.issue_notifier = init_notifier(self)
        await self.issue_notifier.start()
        logger.info("Issue notification system started")

        # Start GitHub webhook server for bidirectional communication
        self.webhook_server = await start_webhook_server(self)
        logger.info("GitHub webhook server started")

        self.cleanup_sessions.start()
        self.check_stale_terminals.start()
        if config.doc_embeddings_enabled:
            self.update_doc_embeddings.start()
        logger.info("Bot setup complete")

    async def close(self):
        """Clean up resources when bot shuts down."""
        self.cleanup_sessions.cancel()
        self.check_stale_terminals.cancel()
        if config.doc_embeddings_enabled:
            self.update_doc_embeddings.cancel()
        if self.issue_notifier:
            await self.issue_notifier.stop()
        if self.webhook_server:
            await stop_webhook_server()
        await pollinations_client.close()
        await github_manager.close()
        await github_graphql.close()
        await github_pr_manager.close()
        if github_app_auth:
            await github_app_auth.close()
        # Clean up sandbox manager
        from .services.code_agent import sandbox_manager

        await sandbox_manager.stop()
        # Clean up embeddings if enabled
        if config.local_embeddings_enabled:
            from .services.embeddings import close as close_embeddings

            await close_embeddings()
        # Clean up doc embeddings if enabled
        if config.doc_embeddings_enabled:
            from .services.doc_embeddings import close as close_doc_embeddings

            await close_doc_embeddings()
        await super().close()

    @tasks.loop(minutes=1)
    async def cleanup_sessions(self):
        """Periodically clean up expired sessions."""
        cleaned = session_manager.cleanup_expired()
        if cleaned > 0:
            logger.debug(f"Cleaned {cleaned} expired sessions")

    @cleanup_sessions.before_loop
    async def before_cleanup(self):
        """Wait until the bot is ready before starting cleanup task."""
        await self.wait_until_ready()

    @tasks.loop(minutes=5)
    async def check_stale_terminals(self):
        """
        Auto-close idle terminal sessions to save resources.

        Runs every 5 minutes. Closes terminals idle for more than 5 minutes.
        Users can resume anytime - ccr sessions and git branches persist.
        """
        try:
            sandbox = get_persistent_sandbox()
            closed = await sandbox.cleanup_idle_terminals(max_idle_seconds=300)
            if closed > 0:
                logger.info(f"Auto-closed {closed} idle terminal(s)")
        except Exception as e:
            logger.error(f"Error cleaning up idle terminals: {e}")

    @check_stale_terminals.before_loop
    async def before_stale_check(self):
        """Wait until the bot is ready before starting terminal cleanup task."""
        await self.wait_until_ready()

    @tasks.loop(hours=6)
    async def update_doc_embeddings(self):
        """
        Periodically update documentation embeddings.

        Runs every 6 hours to keep documentation fresh for GSoC support.
        """
        if not config.doc_embeddings_enabled:
            return

        try:
            from .services.doc_embeddings import update_all_sites

            logger.info("Starting scheduled documentation update...")
            await update_all_sites()
            logger.info("Documentation update complete")
        except Exception as e:
            logger.error(f"Documentation update failed: {e}", exc_info=True)

    @update_doc_embeddings.before_loop
    async def before_doc_update(self):
        """Wait until the bot is ready before starting doc update task."""
        await self.wait_until_ready()


bot = PollyBot()


@bot.tree.context_menu(name="Assist")
async def assist_context_menu(
    interaction: discord.Interaction, message: discord.Message
):
    """Context menu command - right-click message → Apps → Assist. Treats message as if user @mentioned bot."""
    # Silently acknowledge
    await interaction.response.defer(ephemeral=True, thinking=False)

    text = message.content or ""
    image_urls, video_urls, file_urls = extract_media_urls(message)

    if not text and (image_urls or video_urls or file_urls):
        text = "[User attached media/files]"
    elif not text:
        text = "[User mentioned bot without text - greet them or ask how you can help]"

    # Check if already in a thread - if so, work directly in that thread
    if isinstance(message.channel, discord.Thread):
        # Already in a thread - get or create session and process directly
        session = session_manager.get_session(message.channel.id)
        if not session:
            # Create session for this thread
            session = session_manager.create_session(
                channel_id=message.channel.parent_id or message.channel.id,
                thread_id=message.channel.id,
                user_id=message.author.id,
                user_name=str(message.author),
                initial_message=text,
                topic_summary=pollinations_client.get_topic_summary_fast(text),
                image_urls=image_urls
                + video_urls,  # Combined for session storage (not files)
            )

        # Add to session and process like a normal thread message
        session_manager.add_to_session(
            session=session,
            role="user",
            content=text,
            author=str(message.author),
            author_id=message.author.id,
            image_urls=image_urls
            + video_urls,  # Combined for session storage (not files)
        )

        async with message.channel.typing():
            thread_history = await fetch_thread_history(message.channel)
            await process_message(
                channel=message.channel,
                user=message.author,
                text=text,
                image_urls=image_urls,
                session=session,
                thread_history=thread_history,
                source_message=message,
                video_urls=video_urls,
                file_urls=file_urls,
            )
    else:
        # Not in thread - create one (normal flow)
        await start_conversation(message, text, image_urls, video_urls)


@bot.event
async def on_ready():
    """Called when the bot is ready."""
    logger.info(f"{bot.user} is now online!")
    logger.info(f"Connected to {len(bot.guilds)} guild(s)")

    # Sync application commands (context menus, slash commands)
    try:
        # Clear guild-specific commands (removes duplicate from previous guild sync)
        guild = discord.Object(id=885844321461485618)
        bot.tree.clear_commands(guild=guild)
        await bot.tree.sync(guild=guild)
        # Sync global
        synced = await bot.tree.sync()
        logger.info(f"Synced {len(synced)} global command(s)")
    except Exception as e:
        logger.error(f"Failed to sync commands: {e}")

    # Initialize embeddings if enabled (runs in background)
    if config.local_embeddings_enabled:
        from .services.embeddings import initialize as init_embeddings

        asyncio.create_task(init_embeddings())
        logger.info("Local embeddings initialization started")

    # Initialize doc embeddings if enabled (runs in background)
    if config.doc_embeddings_enabled:
        from .services.doc_embeddings import initialize as init_doc_embeddings

        asyncio.create_task(init_doc_embeddings())
        logger.info("Documentation embeddings initialization started")


async def _check_reply_to_bot(
    message: discord.Message,
) -> tuple[bool, discord.Message | None]:
    """
    Check if message is a reply to bot. Returns (is_reply_to_bot, referenced_message).
    Caches the fetched message to avoid duplicate fetches.
    """
    if not message.reference or not message.reference.message_id:
        return False, None

    # Try cached reference first (Discord caches recent messages)
    if message.reference.cached_message:
        ref_msg = message.reference.cached_message
        return ref_msg.author == bot.user, ref_msg

    # Fetch if not cached
    try:
        ref_msg = await message.channel.fetch_message(message.reference.message_id)
        return ref_msg.author == bot.user, ref_msg
    except Exception:
        return False, None


@bot.event
async def on_message(message: discord.Message):
    """Handle incoming messages."""
    if message.author == bot.user:
        return

    # PR merge notification - triggers embedding update
    # Use webhook_id for reliable webhook detection (author.id also works but this is cleaner)
    if (
        config.local_embeddings_enabled
        and message.channel.id == PR_MERGE_CHANNEL_ID
        and message.webhook_id == PR_MERGE_WEBHOOK_ID
    ):
        from .services.embeddings import schedule_update

        await schedule_update()
        logger.info("PR merge detected - embedding update scheduled")
        return

    # Handle DMs - only subscription commands allowed
    if isinstance(message.channel, discord.DMChannel):
        await handle_dm_message(message)
        return

    # Check reply status ONCE (reuse result throughout)
    is_reply_to_bot, ref_msg = await _check_reply_to_bot(message)
    logger.info(f"MSG: '{message.content[:50]}' | is_reply_to_bot={is_reply_to_bot} | has_polly={'polly' in message.content.lower()} | is_@mention={bot.user and bot.user.mentioned_in(message) if bot.user else False} | in_thread={isinstance(message.channel, discord.Thread)}")

    # Check if in a thread
    if isinstance(message.channel, discord.Thread):
        logger.info(f"PATH: In thread (line 923)")
        session = session_manager.get_session(message.channel.id)

        # ONLY respond if: @mentioned OR replying to bot's message
        # Having a session is NOT enough - user must explicitly engage
        should_respond = (
            bot.user is not None and bot.user.mentioned_in(message) and not message.mention_everyone
        ) or is_reply_to_bot

        if not should_respond:
            # In thread but not mentioned and not replying to bot - ignore
            return

        # Check if this is an auto-created thread from inline reply (no session exists)
        # If so, treat it as inline and don't persist the thread
        if not session and is_reply_to_bot and not bot.user.mentioned_in(message):
            # This is a reply to inline polly in an auto-created thread
            # Respond inline-style without creating session
            await handle_inline_polly_mention(message)
            return

        # Extract text
        text = message.content
        for mention in message.mentions:
            text = text.replace(f"<@{mention.id}>", "").replace(f"<@!{mention.id}>", "")
        text = text.strip()

        # Handle reply context in threads too
        if message.reference and message.reference.message_id:
            text = await handle_reply_context(message, text, ref_msg)

        image_urls = extract_image_urls(message)

        # If no text but replying or has images, let AI handle it
        if not text and not image_urls:
            text = "[User mentioned bot - respond to the conversation context]"
        if not text and image_urls:
            text = "[User attached screenshot(s)]"

        # Create session if needed (handles bot restart scenario)
        if not session:
            topic = pollinations_client.get_topic_summary_fast(text)
            session = session_manager.create_session(
                channel_id=message.channel.parent_id or message.channel.id,
                thread_id=message.channel.id,
                user_id=message.author.id,
                user_name=str(message.author),
                initial_message=text,
                topic_summary=topic,
                image_urls=image_urls,
            )

        await handle_thread_message(message, session)
        return

    # Check for casual "polly" mention OR reply to bot (case-insensitive)
    # This triggers inline reply WITHOUT creating a thread
    # if "polly" in message.content.lower():
    #     await handle_inline_polly_mention(message)
    #     return

    # ONLY respond if @mentioned (not just replying)
    # Thread creation is ONLY for @polly, not replies
    if bot.user is None or not bot.user.mentioned_in(message):
        logger.info(f"Ignoring message (not @mentioned): {message.content[:50]}")
        return

    if message.mention_everyone:
        return

    # Extract message text
    text = message.content
    for mention in message.mentions:
        text = text.replace(f"<@{mention.id}>", "").replace(f"<@!{mention.id}>", "")
    text = text.strip()

    # Handle reply context (get context from referenced message)
    # Pass ref_msg if already fetched to avoid duplicate network call
    if message.reference and message.reference.message_id:
        text = await handle_reply_context(message, text, ref_msg)

    image_urls, video_urls, file_urls = extract_media_urls(message)

    # If no text but replying or has images/videos/files, let AI handle it
    if not text and not image_urls and not video_urls and not file_urls:
        text = "[User mentioned bot without text - greet them or ask how you can help]"
    if not text and (image_urls or video_urls or file_urls):
        text = "[User attached media/files]"

    # Create thread and start new conversation
    logger.info(f"PATH: CREATING THREAD (line 1020) - This should ONLY happen for @polly!")
    await start_conversation(message, text, image_urls, video_urls, file_urls)


async def handle_dm_message(message: discord.Message):
    """
    Handle DM messages - only subscription commands are allowed.

    Supported commands:
    - subscribe #123 or subscribe to 123
    - unsubscribe #123 or unsubscribe from 123
    - unsubscribe all
    - list subscriptions / my subscriptions
    """
    import re
    from .services.github import TOOL_HANDLERS

    text = message.content.strip().lower()
    user_id = message.author.id

    async with message.channel.typing():
        # Subscribe command
        subscribe_match = re.search(r"subscribe\s+(?:to\s+)?#?(\d+)", text)
        if subscribe_match and "unsubscribe" not in text:
            issue_number = int(subscribe_match.group(1))
            result = await TOOL_HANDLERS["subscribe_issue"](
                issue_number=issue_number,
                user_id=user_id,
                channel_id=message.channel.id,
                guild_id=None,  # DM has no guild
            )
            await message.reply(result.get("message", "Done!"))
            return

        # Unsubscribe all command
        if "unsubscribe" in text and "all" in text:
            result = await TOOL_HANDLERS["unsubscribe_all"](user_id=user_id)
            await message.reply(result.get("message", "Done!"))
            return

        # Unsubscribe from specific issue
        unsubscribe_match = re.search(r"unsubscribe\s+(?:from\s+)?#?(\d+)", text)
        if unsubscribe_match:
            issue_number = int(unsubscribe_match.group(1))
            result = await TOOL_HANDLERS["unsubscribe_issue"](
                issue_number=issue_number, user_id=user_id
            )
            await message.reply(result.get("message", "Done!"))
            return

        # List subscriptions
        if "subscriptions" in text or "list" in text or "my sub" in text:
            result = await TOOL_HANDLERS["list_subscriptions"](user_id=user_id)
            await message.reply(result.get("message", "No subscriptions found."))
            return

        # Unknown command - show help
        help_text = (
            "**DM Commands:**\n"
            "• `subscribe #123` - Subscribe to issue updates\n"
            "• `unsubscribe #123` - Unsubscribe from an issue\n"
            "• `unsubscribe all` - Unsubscribe from all issues\n"
            "• `list subscriptions` - See your subscriptions\n\n"
            "For other requests, please @mention me in a server channel!"
        )
        await message.reply(help_text)


async def handle_reply_context(
    message: discord.Message, text: str, ref_msg: Optional[discord.Message] = None
) -> str:
    """Handle when message is a reply to another message. Uses cached ref_msg if provided."""
    try:
        # Use provided ref_msg to avoid duplicate fetch
        if ref_msg is None:
            if message.reference is None or message.reference.message_id is None:
                return text  # No reference to fetch
            ref_msg = await message.channel.fetch_message(message.reference.message_id)

        # Include both authors when replying to someone else's message
        original_author = ref_msg.author.name if ref_msg.author else None
        requester = message.author.name

        # Only add dual authorship if replying to a DIFFERENT user's message
        if original_author and ref_msg.author.id != message.author.id:
            author_note = f"\n\n[Authors: `{original_author}`, `{requester}`]"
        else:
            author_note = ""

        if text and ref_msg.content:
            return f"{ref_msg.content}{author_note}\n\nAdditional context: {text}"
        elif not text:
            return f"{ref_msg.content}{author_note}"
    except Exception as e:
        logger.warning(f"Failed to fetch referenced message: {e}")
    return text


async def start_conversation(
    message: discord.Message,
    text: str,
    image_urls: list[str],
    video_urls: Optional[list[str]] = None,
    file_urls: Optional[list[str]] = None,
):
    """Start a new conversation in a thread."""
    video_urls = video_urls or []
    file_urls = file_urls or []
    # Quick topic extraction for thread name
    topic = pollinations_client.get_topic_summary_fast(text)
    thread_name = f"Issue: {topic}"[:100]

    try:
        thread = await message.create_thread(
            name=thread_name, auto_archive_duration=THREAD_AUTO_ARCHIVE_MINUTES
        )
    except discord.Forbidden:
        await message.reply(
            "I don't have permission to create threads. Please grant me 'Create Public Threads' permission."
        )
        return
    except discord.HTTPException as e:
        logger.error(f"Failed to create thread: {e}")
        await message.reply("Couldn't create a thread. Please try again.")
        return

    # Create session
    session = session_manager.create_session(
        channel_id=message.channel.id,
        thread_id=thread.id,
        user_id=message.author.id,
        user_name=str(message.author),
        initial_message=text,
        topic_summary=topic,
        image_urls=image_urls + video_urls,  # Combined for session storage (not files)
    )

    # Process the message with tool calling
    async with thread.typing():
        await process_message(
            channel=thread,
            user=message.author,
            text=text,
            image_urls=image_urls,
            session=session,
            source_message=message,
            video_urls=video_urls,
            file_urls=file_urls,
        )


async def handle_inline_polly_mention(message: discord.Message):
    """
    Handle casual "polly" mention - inline, focused, human-like reply.

    Key differences from @polly:
    - Has channel history for CONTEXT (like a human reading chat)
    - But ONLY replies to current message (not whole convo)
    - Concise, direct responses (1-3 sentences)
    - Human-like tone, not verbose
    """
    # Extract text and media
    text = message.content.strip()
    image_urls, video_urls, file_urls = extract_media_urls(message)

    if not text and (image_urls or video_urls or file_urls):
        text = "[User mentioned polly with media/files - respond briefly and naturally]"

    # Fetch recent channel history for CONTEXT (last 20 messages - lighter than @polly)
    channel_history = []
    try:
        async for msg in message.channel.history(limit=21):  # +1 to skip current
            if msg.id == message.id:
                continue  # Skip current message

            if msg.author.bot:
                channel_history.append({"role": "assistant", "content": msg.content})
            else:
                channel_history.append({
                    "role": "user",
                    "content": f"[{msg.author.name}]: {msg.content}"
                })

        # Reverse to chronological order (oldest to newest)
        channel_history.reverse()
    except Exception as e:
        logger.warning(f"Failed to fetch channel history for inline mention: {e}")

    # Check if user is admin
    user_is_admin = is_admin(message.author)

    # Build tool context (same structure as normal processing)
    tool_context = {
        "is_admin": user_is_admin,
        "user_id": message.author.id,
        "user_name": str(message.author),
        "reporter": str(message.author),
        "channel_id": message.channel.id,
        "thread_id": None,  # No thread for inline mentions
        "guild_id": message.guild.id if message.guild else None,
        "user_role_ids": (
            [r.id for r in message.author.roles] if isinstance(message.author, discord.Member) else []
        ),
        "message_url": message.jump_url,
        "discord_channel": message.channel,
        "discord_thread_id": None,
        "discord_bot": bot,
        "discord_guild": message.guild if hasattr(message, "guild") else None,
    }

    async with message.channel.typing():
        try:
            # Add system instruction for concise, human responses WITH CONTEXT
            inline_system_prompt = {
                "role": "system",
                "content": (
                    "You are Polly responding inline. Be EXTREMELY SHORT. "
                    "Ideal: 1-5 WORDS. Max: 1 sentence if absolutely necessary. "
                    "Examples of GOOD responses: "
                    "'yep works fine' / 'nope, down' / 'try gen.pollinations.ai' / 'doc search empty' "
                    "Examples of BAD responses: "
                    "'It seems the doc search is running but empty...' (TOO LONG) "
                    "Talk like texting a friend - minimal words, maximum info. "
                    "For anything complex, say '@polly for details'."
                )
            }

            # Build history with system prompt
            full_history = [inline_system_prompt] + channel_history

            # Process with tools AND history for context
            result = await pollinations_client.process_with_tools(
                user_message=text,
                discord_username=str(message.author),
                thread_history=full_history,  # System prompt + channel history for context
                image_urls=image_urls,
                video_urls=video_urls or [],
                file_urls=file_urls or [],
                is_admin=user_is_admin,
                tool_context=tool_context,
            )

            response_text = result.get("response", "")
            content_blocks = result.get("content_blocks", [])

            # Decode any base64 images
            image_files = decode_base64_images(content_blocks, max_images=10)
            if image_files:
                # Strip file paths from response
                response_text = re.sub(r'\[([^\]]*)\]\(file:///[^)]+\)\n?', '', response_text)
                response_text = re.sub(r'file:///[^\s\)]+', '', response_text)
                response_text = response_text.strip()

            # Fix double-wrapped URLs
            response_text = re.sub(r'\[(https?://[^\]]+)\]\(<\1>\)', r'<\1>', response_text)

            if response_text or image_files:
                # Reply to the message WITHOUT ping (mention_author=False)
                await send_long_message(
                    channel=message.channel,
                    text=response_text or "Here's the result:",
                    reply_to=message,
                    files=image_files,
                    mention_author=False,
                )
        except Exception as e:
            logger.error(f"Error processing inline polly mention: {e}")
            await message.reply("Sorry, I encountered an error processing your request.", mention_author=False)


async def handle_thread_message(message: discord.Message, session: ConversationSession):
    """Handle a message in an existing thread."""
    # Type guard: this function is only called for thread messages
    if not isinstance(message.channel, discord.Thread):
        logger.warning(f"handle_thread_message called with non-thread channel: {type(message.channel)}")
        return

    channel = message.channel  # Now typed as discord.Thread
    image_urls, video_urls, file_urls = extract_media_urls(message)

    # Check if there's a pending confirmation for this thread and validate user
    thread_id = str(channel.id)
    from .services.code_agent.tools.polly_agent import (
        clear_pending_confirmation,
        get_task_owner_id,
        _running_tasks,
    )

    # Check if task has pending confirmation
    task = _running_tasks.get(thread_id)
    if task and task.get("pending_confirmation"):
        owner_id = task.get("user_id")
        if owner_id and message.author.id != owner_id:
            # Not the task owner - ignore or inform
            await message.reply(
                f"⚠️ Only the task owner can respond to this confirmation. "
                f"Please wait for <@{owner_id}> to respond.",
                mention_author=False,
            )
            return
        # Clear pending confirmation - user is responding
        clear_pending_confirmation(thread_id)
        logger.info(f"Cleared pending confirmation for thread {thread_id}")

    # Add to session
    session_manager.add_to_session(
        session=session,
        role="user",
        content=message.content,
        author=str(message.author),
        author_id=message.author.id,
        image_urls=image_urls + video_urls,  # Combined for session storage (not files)
    )

    async with channel.typing():
        # Fetch thread history for context
        thread_history = await fetch_thread_history(channel)

        await process_message(
            channel=channel,
            user=message.author,
            text=message.content,
            image_urls=image_urls,
            session=session,
            thread_history=thread_history,
            reply_to=message,  # Reply to user's message so they get pinged
            source_message=message,
            video_urls=video_urls,
            file_urls=file_urls,
        )


async def process_message(
    channel: Union[discord.Thread, discord.TextChannel],
    user: Union[discord.User, discord.Member],
    text: str,
    image_urls: list[str],
    session: ConversationSession,
    thread_history: Optional[list[dict]] = None,
    reply_to: Optional[discord.Message] = None,
    source_message: Optional[discord.Message] = None,
    video_urls: Optional[list[str]] = None,
    file_urls: Optional[list[str]] = None,
):
    """
    Process a message using native tool calling.

    The AI will:
    1. Analyze the user's request
    2. Call appropriate tools (search, get_issue, create, etc.)
    3. Receive tool results
    4. Format a nice response

    All tool calls happen in parallel when possible.
    """
    # Check if user is admin (has admin role)
    user_is_admin = is_admin(user)
    logger.info(f"process_message: user={user}, user_is_admin={user_is_admin}")

    # Build tool context - this is passed to ALL tool handlers for permission checks
    # This is thread-safe because it's created per-request, not globally registered
    # Determine channel/thread IDs based on channel type
    if isinstance(channel, discord.Thread) and channel.parent_id:
        context_channel_id = channel.parent_id
        context_thread_id: Optional[int] = channel.id
    else:
        context_channel_id = channel.id
        context_thread_id = None

    tool_context = {
        "is_admin": user_is_admin,
        "user_id": user.id,
        "user_name": str(user),
        "reporter": session.original_author_name,
        "channel_id": context_channel_id,
        "thread_id": context_thread_id,
        "guild_id": (
            channel.guild.id if channel.guild else None
        ),
        "user_role_ids": (
            [r.id for r in user.roles] if isinstance(user, discord.Member) else []
        ),
        # For github_issue create - link back to Discord message
        "message_url": source_message.jump_url if source_message else None,
        # For polly_agent
        "discord_channel": channel,
        "discord_thread_id": session.thread_id,
        "discord_bot": bot,
        # For discord_search
        "discord_guild": channel.guild if hasattr(channel, "guild") else None,
    }

    try:
        # Process with native tool calling
        # Note: polly_agent handles task_id lookup via thread_id internally
        # tool_context is passed to handlers for per-request permission checks (thread-safe)
        result = await pollinations_client.process_with_tools(
            user_message=text,
            discord_username=str(user),
            thread_history=thread_history,
            image_urls=image_urls,
            video_urls=video_urls or [],
            file_urls=file_urls or [],
            is_admin=user_is_admin,
            tool_context=tool_context,
        )

        response_text = result.get("response", "")
        tool_calls = result.get("tool_calls", [])
        tool_results = result.get("tool_results", [])
        content_blocks = result.get("content_blocks", [])

        # Decode any base64 images from content_blocks (e.g., from code_execution)
        image_files = decode_base64_images(content_blocks, max_images=10)
        if image_files:
            logger.info(f"Decoded {len(image_files)} image(s) from content_blocks")
            # Strip useless file:/// local paths from response (images are sent as attachments)
            response_text = re.sub(r'\[([^\]]*)\]\(file:///[^)]+\)\n?', '', response_text)
            response_text = re.sub(r'file:///[^\s\)]+', '', response_text)
            response_text = response_text.strip()

        # Fix double-wrapped URLs: [https://example.com](<https://example.com>) -> <https://example.com>
        response_text = re.sub(r'\[(https?://[^\]]+)\]\(<\1>\)', r'<\1>', response_text)

        # Log tool usage for debugging
        if tool_calls:
            # Strip API prefix from tool names for cleaner logging
            tool_names = [
                (
                    tc["function"]["name"].split(":")[-1]
                    if ":" in tc["function"]["name"]
                    else tc["function"]["name"]
                )
                for tc in tool_calls
            ]
            logger.info(f"Tools called: {', '.join(tool_names)}")

        # Check if issue was created or comment added
        for tool_result in tool_results:
            if isinstance(tool_result, dict):
                # Handle successful issue creation
                if tool_result.get("success") and tool_result.get("issue_url"):
                    issue_url = tool_result["issue_url"]
                    issue_number = tool_result.get("issue_number")

                    if issue_number:
                        link = f"[Issue #{issue_number}](<{issue_url}>)"
                    else:
                        link = f"[Issue](<{issue_url}>)"

                    # Add link to response if not already there
                    if issue_url not in response_text:
                        response_text += f"\n\n{link}"

                    # Clear session after successful creation
                    session_manager.clear_session(session)

                    # Archive thread after issue creation
                    if response_text:
                        await send_long_message(
                            channel, response_text, reply_to=reply_to
                        )
                    await archive_thread(channel)
                    return

        # Send response - if empty, ask AI to generate a proper response
        if not response_text:
            # AI returned empty - ask it to respond properly
            retry_result = await pollinations_client._call_api_with_tools(
                messages=[
                    {
                        "role": "system",
                        "content": "You are Polly. The user sent a message but you didn't respond. Generate a helpful response - ask clarifying questions if you're unsure what they want, or summarize what you found if you used tools.",
                    },
                    {"role": "user", "content": text},
                ],
                tools=None,  # No tools, just respond
            )
            response_text = retry_result.get("content", "") if retry_result else ""

        if response_text or image_files:
            await send_long_message(
                channel, response_text or "Here's the result:", reply_to=reply_to, files=image_files
            )

    except Exception as e:
        logger.error(f"Error processing message: {e}")
        raise


async def send_long_message(
    channel: Union[discord.Thread, discord.TextChannel],
    text: str,
    max_length: int = 2000,
    reply_to: Optional[discord.Message] = None,
    files: Optional[list[discord.File]] = None,
    mention_author: bool = True,
):
    """
    Send a message, splitting if too long. First chunk replies to message if provided.

    Args:
        channel: Channel or thread to send to
        text: Message text
        max_length: Max characters per message (Discord limit 2000)
        reply_to: Optional message to reply to (only for first chunk)
        files: Optional list of discord.File to attach (only to first message, max 10)
        mention_author: Whether to ping the author when replying (default True)
    """
    # Files only go with the first message - Discord max 10 files
    files_to_send = files[:10] if files else []

    if len(text) <= max_length:
        if reply_to:
            if files_to_send:
                await reply_to.reply(text, files=files_to_send, mention_author=mention_author)
            else:
                await reply_to.reply(text, mention_author=mention_author)
        else:
            if files_to_send:
                await channel.send(text, files=files_to_send)
            else:
                await channel.send(text)
        return

    # Split on newlines first, then by length
    chunks = []
    current_chunk = ""

    for line in text.split("\n"):
        if len(current_chunk) + len(line) + 1 <= max_length:
            current_chunk += line + "\n"
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = line + "\n"

    if current_chunk:
        chunks.append(current_chunk.strip())

    for i, chunk in enumerate(chunks):
        if chunk:
            # Reply to user's message for first chunk only, with files
            if i == 0 and reply_to:
                if files_to_send:
                    await reply_to.reply(chunk, files=files_to_send, mention_author=mention_author)
                else:
                    await reply_to.reply(chunk, mention_author=mention_author)
            elif i == 0:
                if files_to_send:
                    await channel.send(chunk, files=files_to_send)
                else:
                    await channel.send(chunk)
            else:
                await channel.send(chunk)


async def archive_thread(channel: Union[discord.Thread, discord.TextChannel]):
    """Archive thread if applicable."""
    if isinstance(channel, discord.Thread):
        try:
            await channel.edit(archived=True)
        except discord.HTTPException:
            pass
