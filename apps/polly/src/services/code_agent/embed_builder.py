"""
Discord embed builder for code task progress updates.

Creates a single embed that updates in real-time with:
- Task header (issue title, PR title, etc.)
- Checklist of steps (✅ 🔄 ⬜)
- Current status message
- Footer with elapsed time
"""

import asyncio
import discord
from discord.ui import View
from datetime import datetime
from typing import Optional, List
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# PROGRESS EMBED - CLAUDE CODE STYLE
# =============================================================================

class StepStatus(Enum):
    """Status of a todo item."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TodoItem:
    """A todo item in the progress list."""
    content: str
    status: StepStatus = StepStatus.PENDING

    def to_string(self) -> str:
        """Convert to Claude Code style string."""
        # Claude Code style: ☐ pending, ◉ in progress, ✓ done, ✗ failed
        emoji_map = {
            StepStatus.PENDING: "☐",
            StepStatus.IN_PROGRESS: "◉",
            StepStatus.COMPLETED: "✓",
            StepStatus.FAILED: "✗",
        }
        emoji = emoji_map.get(self.status, "☐")
        return f"{emoji} {self.content}"


@dataclass
class ProgressEmbed:
    """
    Live progress embed for polly agent tasks.

    Shows real-time status:
    - Title: Current action with spinner (✻ Working on X...)
    - Progress: Todo list with nested sub-actions
    - Files: Files being modified (updated live)
    - Branch: Git branch info
    - Footer: Elapsed time

    Usage:
        embed = ProgressEmbed(current_action="Analyzing code")
        embed.add_todo("Read the file")
        embed.set_sub_action("Reading src/app.py")
        embed.add_file("src/app.py")

        discord_embed = embed.build()
    """

    current_action: str = "Working..."
    todos: List[TodoItem] = field(default_factory=list)
    started_at: datetime = field(default_factory=datetime.utcnow)
    color: int = 0x5865F2  # Discord blurple

    # State
    is_complete: bool = False
    is_failed: bool = False

    # Live status fields
    sub_action: str = ""  # Nested action under current todo (e.g., "Reading file X")
    files_changed: List[str] = field(default_factory=list)  # Files being modified
    branch_name: str = ""  # Git branch
    base_branch: str = "main"  # Target branch for PR
    queue_position: int = 0  # Position in task queue (0 = running)

    # Legacy compatibility
    title: str = ""
    description: str = ""
    status_message: str = ""
    issue_url: Optional[str] = None
    pr_url: Optional[str] = None
    repo_url: Optional[str] = None

    @property
    def steps(self) -> List[TodoItem]:
        """Alias for todos (backward compatibility)."""
        return self.todos

    def add_todo(self, content: str) -> int:
        """Add a todo item. Returns index."""
        self.todos.append(TodoItem(content=content))
        return len(self.todos) - 1

    def add_step(self, name: str, details: Optional[str] = None) -> int:
        """Backward compatible alias for add_todo."""
        return self.add_todo(name)

    def start_todo(self, index: int):
        """Mark a todo as in progress and update current action."""
        if 0 <= index < len(self.todos):
            self.todos[index].status = StepStatus.IN_PROGRESS
            self.current_action = self.todos[index].content

    def start_step(self, index: int, details: Optional[str] = None):
        """Backward compatible alias."""
        self.start_todo(index)

    def complete_todo(self, index: int):
        """Mark a todo as completed."""
        if 0 <= index < len(self.todos):
            self.todos[index].status = StepStatus.COMPLETED

    def complete_step(self, index: int, details: Optional[str] = None):
        """Backward compatible alias."""
        self.complete_todo(index)

    def fail_todo(self, index: int):
        """Mark a todo as failed."""
        if 0 <= index < len(self.todos):
            self.todos[index].status = StepStatus.FAILED

    def fail_step(self, index: int, details: Optional[str] = None):
        """Backward compatible alias."""
        self.fail_todo(index)

    def skip_step(self, index: int, details: Optional[str] = None):
        """Mark as completed (no skip in Claude Code style)."""
        self.complete_todo(index)

    def set_action(self, action: str):
        """Set the current action shown in title."""
        self.current_action = action
        self.sub_action = ""  # Clear sub-action when main action changes

    def set_sub_action(self, sub_action: str):
        """Set a nested sub-action (shown under current todo)."""
        self.sub_action = sub_action

    def set_status(self, message: str):
        """Backward compatible - sets current action."""
        self.current_action = message

    def add_file(self, file_path: str):
        """Add a file to the files changed list."""
        if file_path and file_path not in self.files_changed:
            self.files_changed.append(file_path)

    def set_files(self, files: List[str]):
        """Set all files changed at once."""
        self.files_changed = list(files) if files else []

    def set_branch(self, branch_name: str, base_branch: str = "main"):
        """Set the git branch info."""
        self.branch_name = branch_name
        self.base_branch = base_branch

    def set_queue_position(self, position: int):
        """Set queue position (0 = running, >0 = waiting)."""
        self.queue_position = position

    def mark_complete(self, success: bool = True):
        """Mark the task as complete."""
        self.is_complete = True
        self.is_failed = not success
        self.color = 0x57F287 if success else 0xED4245  # Green or red

    def elapsed_time(self) -> str:
        """Get formatted elapsed time."""
        seconds = int((datetime.utcnow() - self.started_at).total_seconds())
        if seconds < 60:
            return f"{seconds}s"
        minutes = seconds // 60
        secs = seconds % 60
        if minutes < 60:
            return f"{minutes}m {secs}s"
        hours = minutes // 60
        mins = minutes % 60
        return f"{hours}h {mins}m"

    def _get_title(self) -> str:
        """Build the title with spinner/status."""
        if self.is_complete:
            emoji = "✓" if not self.is_failed else "✗"
            status = "Done" if not self.is_failed else "Failed"
            return f"{emoji} {status}"
        else:
            # Spinner + current action
            return f"✻ {self.current_action}…"

    def build(self) -> discord.Embed:
        """Build the Discord embed object with live status."""
        embed = discord.Embed(
            title=self._get_title(),
            color=self.color,
        )

        # Build description with all sections
        sections = []

        # Queue status (if waiting)
        if self.queue_position > 0:
            sections.append(f"⏳ **Queue position:** #{self.queue_position}")
            sections.append("")

        # Todo list with sub-action
        if self.todos:
            todo_lines = []
            for i, todo in enumerate(self.todos):
                todo_lines.append(todo.to_string())
                # Show sub-action under the in-progress todo
                if todo.status == StepStatus.IN_PROGRESS and self.sub_action:
                    todo_lines.append(f"   └─ {self.sub_action}")
            sections.append("\n".join(todo_lines))

        # Files changed section
        if self.files_changed:
            sections.append("")
            file_count = len(self.files_changed)
            sections.append(f"📁 **Files** ({file_count})")
            # Show up to 8 files, then summarize
            for f in self.files_changed[:8]:
                # Shorten long paths
                display_path = f if len(f) < 40 else "…" + f[-38:]
                sections.append(f"  • `{display_path}`")
            if file_count > 8:
                sections.append(f"  • *+{file_count - 8} more*")

        embed.description = "\n".join(sections) if sections else None

        # Footer with branch info and time
        footer_parts = []
        if self.branch_name:
            footer_parts.append(f"🔀 {self.branch_name} → {self.base_branch}")
        footer_parts.append(f"⏱ {self.elapsed_time()}")
        embed.set_footer(text="  │  ".join(footer_parts))

        return embed


class ProgressEmbedManager:
    """
    Manages a progress embed with Discord message updates.

    Usage:
        manager = ProgressEmbedManager(channel)
        await manager.start(title="Fixing Issue #5735", description="Bug in URL encoding")

        manager.add_step("Analyze")
        manager.add_step("Fix")
        manager.add_step("Test")
        await manager.update()

        manager.complete_step(0)
        manager.start_step(1)
        manager.set_status("Found the bug!")
        await manager.update()
    """

    def __init__(self, channel: discord.TextChannel):
        self.channel = channel
        self.message: Optional[discord.Message] = None
        self.embed: Optional[ProgressEmbed] = None
        self._update_lock = asyncio.Lock()
        self._last_update: datetime = datetime.utcnow()
        self._min_update_interval = 1.0  # Minimum seconds between updates

    async def start(
        self,
        title: str = "",
        description: str = "",
        issue_url: Optional[str] = None,
        repo_url: Optional[str] = None,
        current_action: str = "Starting...",
    ) -> discord.Message:
        """Create and send the initial embed."""
        self.embed = ProgressEmbed(
            current_action=current_action or title or "Working...",
        )

        discord_embed = self.embed.build()
        self.message = await self.channel.send(embed=discord_embed)
        return self.message

    def set_action(self, action: str):
        """Set the current action (shown in title)."""
        if self.embed:
            self.embed.set_action(action)

    def add_step(self, name: str, details: Optional[str] = None) -> int:
        """Add a step. Returns step index."""
        if self.embed:
            return self.embed.add_step(name, details)
        return -1

    def reset_steps(self):
        """Clear all steps for reuse (e.g., continuation tasks)."""
        if self.embed:
            self.embed.steps.clear()
            self.embed.is_complete = False
            self.embed.is_failed = False

    def start_step(self, index: int, details: Optional[str] = None):
        """Mark step as in progress."""
        if self.embed:
            self.embed.start_step(index, details)

    def complete_step(self, index: int, details: Optional[str] = None):
        """Mark step as completed."""
        if self.embed:
            self.embed.complete_step(index, details)

    def fail_step(self, index: int, details: Optional[str] = None):
        """Mark step as failed."""
        if self.embed:
            self.embed.fail_step(index, details)

    def set_status(self, message: str):
        """Set status message."""
        if self.embed:
            self.embed.set_status(message)

    def set_sub_action(self, sub_action: str):
        """Set nested sub-action under current step."""
        if self.embed:
            self.embed.set_sub_action(sub_action)

    def add_file(self, file_path: str):
        """Add a file to the changed files list."""
        if self.embed:
            self.embed.add_file(file_path)

    def set_files(self, files: List[str]):
        """Set all files changed at once."""
        if self.embed:
            self.embed.set_files(files)

    def set_branch(self, branch_name: str, base_branch: str = "main"):
        """Set git branch info."""
        if self.embed:
            self.embed.set_branch(branch_name, base_branch)

    def set_queue_position(self, position: int):
        """Set queue position."""
        if self.embed:
            self.embed.set_queue_position(position)

    def set_pr_url(self, url: str):
        """Set the PR URL."""
        if self.embed:
            self.embed.pr_url = url

    def mark_complete(self, success: bool = True):
        """Mark task as complete."""
        if self.embed:
            self.embed.mark_complete(success)

    async def update(self, force: bool = False):
        """
        Update the Discord message with current embed state.

        Throttles updates to avoid rate limiting.
        """
        if not self.message or not self.embed:
            return

        async with self._update_lock:
            # Throttle updates
            now = datetime.utcnow()
            elapsed = (now - self._last_update).total_seconds()
            if not force and elapsed < self._min_update_interval:
                return

            try:
                discord_embed = self.embed.build()
                await self.message.edit(embed=discord_embed)
                self._last_update = now
            except discord.HTTPException as e:
                # Log but don't crash on rate limits
                logging.getLogger(__name__).warning(f"Failed to update embed: {e}")

    async def finish(
        self,
        success: bool = True,
        final_status: Optional[str] = None,
        view: Optional[View] = None,
    ):
        """
        Mark complete and do final update.

        Args:
            success: Whether task completed successfully
            final_status: Final status message to display
            view: Optional Discord View to attach to the message
        """
        if self.embed:
            self.embed.mark_complete(success)
            if final_status:
                self.embed.set_status(final_status)

        if not self.message or not self.embed:
            return

        async with self._update_lock:
            try:
                discord_embed = self.embed.build()
                if view:
                    await self.message.edit(embed=discord_embed, view=view)
                else:
                    await self.message.edit(embed=discord_embed)
                self._last_update = datetime.utcnow()
            except discord.HTTPException as e:
                logger.warning(f"Failed to finish embed: {e}")
