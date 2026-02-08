"""
Code Agent - Uses ccr CLI for coding tasks.

Architecture:
- Bot AI interprets user intent and builds context
- Uses persistent Docker sandbox with ccr
- Each task gets its own git branch for isolation
- Runs coding tasks via `ccr code "prompt"`
- Bot AI handles all git operations (push, PR, etc.)

The sandbox is persistent (24/7) and survives bot restarts.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable, List
from datetime import datetime
from enum import Enum

from .sandbox import (
    get_persistent_sandbox,
    PersistentSandbox,
    TaskBranch,
    CommandResult,
)

logger = logging.getLogger(__name__)


@dataclass
class TodoItem:
    """A todo item extracted from Claude Code output."""
    content: str
    status: str = "pending"  # pending, in_progress, completed


def parse_todos_from_output(output: str) -> List[TodoItem]:
    """
    Parse todo items from Claude Code output.

    Claude Code outputs todos in various formats:
    - [ ] Pending task
    -  In progress task
    -  Completed task
    - [ ] Unchecked
    - [x] Checked
    - "- task name" in todo lists
    """
    todos = []
    seen = set()

    lines = output.split('\n')

    for line in lines:
        line = line.strip()
        if not line or len(line) < 3:
            continue

        status = "pending"
        content = None

        # Check for emoji-based todos
        if line.startswith('⬜') or line.startswith('◻'):
            content = line[1:].strip().lstrip('- ').strip()
            status = "pending"
        elif line.startswith('🔄') or line.startswith('⏳'):
            content = line[1:].strip().lstrip('- ').strip()
            status = "in_progress"
        elif line.startswith('✅') or line.startswith('✓'):
            content = line[1:].strip().lstrip('- ').strip()
            status = "completed"
        elif line.startswith('❌'):
            content = line[1:].strip().lstrip('- ').strip()
            status = "failed"
        # Check for markdown checkbox todos
        elif line.startswith('- [ ]') or line.startswith('* [ ]'):
            content = line[5:].strip()
            status = "pending"
        elif line.startswith('- [x]') or line.startswith('* [x]') or line.startswith('- [X]'):
            content = line[5:].strip()
            status = "completed"
        # Check for numbered todos like "1. [in_progress] Fix bug"
        elif re.match(r'^\d+\.\s*\[(pending|in_progress|completed)\]', line):
            match = re.match(r'^\d+\.\s*\[(pending|in_progress|completed)\]\s*(.+)', line)
            if match:
                status = match.group(1)
                content = match.group(2).strip()

        if content and len(content) > 2 and content not in seen:
            # Skip generic/noisy items and heartbeat messages
            skip_patterns = [
                'token', 'cost', 'session', 'api', 'model',
                'working on the task', 'analyzing code', 'thinking',
                'processing', 'making changes', 'working...',
            ]
            if not any(skip in content.lower() for skip in skip_patterns):
                seen.add(content)
                todos.append(TodoItem(content=content[:100], status=status))

    return todos[:10]  # Limit to 10 todos


# Callback types
ProgressCallback = Callable[[str], Awaitable[None]]


class AgentStatus(Enum):
    """Current status of the Claude Code agent."""
    INITIALIZING = "initializing"
    SETTING_UP = "setting_up"
    WORKING = "working"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ClaudeCodeConfig:
    """Configuration for Claude Code agent."""
    # Timeouts (None = no timeout)
    setup_timeout: int = 300  # 5 min for initial setup only
    task_timeout: Optional[int] = None  # No timeout for tasks

    # Heartbeat interval for progress updates
    heartbeat_interval: int = 30  # seconds


@dataclass
class TaskProgress:
    """Progress information for a task."""
    status: AgentStatus = AgentStatus.INITIALIZING
    current_step: str = ""
    steps_completed: list = field(default_factory=list)
    steps_pending: list = field(default_factory=list)
    last_output: str = ""
    error: Optional[str] = None
    started_at: datetime = field(default_factory=datetime.utcnow)

    def elapsed_seconds(self) -> int:
        return int((datetime.utcnow() - self.started_at).total_seconds())


@dataclass
class ClaudeCodeResult:
    """Result from Claude Code execution."""
    success: bool
    output: str
    files_changed: list = field(default_factory=list)
    branch_name: Optional[str] = None
    error: Optional[str] = None
    duration_seconds: int = 0
    todos: List[TodoItem] = field(default_factory=list)


class ClaudeCodeAgent:
    """
    Agent that uses Claude Code CLI for coding tasks.

    Uses persistent sandbox with branch-based task isolation.
    Bot AI handles all git operations (push, PR, etc.) after ccr completes.

    Usage:
        agent = ClaudeCodeAgent()
        result = await agent.run_task(
            user_id="user123",
            prompt="Fix the URL encoding bug in getImageURL.js",
            on_progress=update_discord_embed
        )
    """

    def __init__(self, config: Optional[ClaudeCodeConfig] = None):
        self.config = config or ClaudeCodeConfig()
        self._sandbox: Optional[PersistentSandbox] = None
        self._progress: dict[str, TaskProgress] = {}
        self._active_branches: dict[str, TaskBranch] = {}

    async def _get_sandbox(self) -> PersistentSandbox:
        """Get the persistent sandbox, ensuring it's running."""
        if self._sandbox is None:
            self._sandbox = get_persistent_sandbox()

        # Ensure sandbox is running
        if not await self._sandbox.is_running():
            await self._sandbox.ensure_running()
            await self._sandbox.sync_repo()

        return self._sandbox

    async def run_task(
        self,
        user_id: str,
        prompt: str,
        task_description: str = "",
        on_progress: Optional[ProgressCallback] = None,
        thread_id: Optional[int] = None,  # Discord thread ID - universal key
        discord_user_id: Optional[int] = None,  # Discord user ID (numeric) for terminal ownership
        discord_channel_id: Optional[int] = None,  # Discord channel ID for notifications
    ) -> ClaudeCodeResult:
        """
        Run a coding task using Claude Code.

        Args:
            user_id: ID of the user requesting the task (string, for git)
            prompt: The task prompt for Claude Code
            task_description: Human-readable description for the task
            on_progress: Callback for progress updates
            thread_id: Discord thread ID - if provided, used as:
                       - task_id (for tracking)
                       - branch name (thread/{thread_id})
                       Note: ccr sessions are managed internally by ccr and may
                       auto-compact. Git branch is the true source of state.
            discord_user_id: Discord user ID (numeric) - owner of the terminal session
            discord_channel_id: Discord channel ID for stale terminal notifications

        Returns:
            ClaudeCodeResult with output and metadata
        """
        task_id = None
        branch = None

        try:
            # Initialize progress tracking
            progress = TaskProgress(
                status=AgentStatus.SETTING_UP,
                current_step="Setting up sandbox",
                steps_pending=["Setup", "Run task", "Collect results"]
            )

            if on_progress:
                await on_progress("🔧 Setting up coding environment...")

            # Get sandbox
            sandbox = await self._get_sandbox()

            # Create task branch (uses thread_id as universal key if provided)
            branch = await sandbox.create_task_branch(
                user_id=user_id,
                task_description=task_description or prompt[:100],
                thread_id=thread_id,  # Pass thread_id for universal key
            )
            task_id = branch.task_id

            self._progress[task_id] = progress
            self._active_branches[task_id] = branch

            progress.steps_completed.append("Setup")
            progress.status = AgentStatus.WORKING
            progress.current_step = "Running Claude Code"

            if on_progress:
                await on_progress(f"🚀 Starting task on branch {branch.branch_name}...")

            logger.info(f"Running ccr task {task_id} for user {user_id}: {prompt[:100]}...")

            # Execute with heartbeat
            result = await self._execute_with_heartbeat(
                sandbox,
                branch,
                prompt,
                on_progress,
                discord_user_id=discord_user_id,
                discord_channel_id=discord_channel_id,
            )

            progress.steps_completed.append("Run task")

            # Log result
            logger.info(f"ccr task {task_id} exit_code={result.exit_code}, output_len={len(result.stdout)}")
            if result.stderr:
                logger.warning(f"ccr stderr: {result.stderr[:500]}")

            # Collect metadata
            progress.current_step = "Collecting results"

            files_changed = await sandbox.get_branch_files_changed(branch)
            todos = parse_todos_from_output(result.stdout)

            progress.steps_completed.append("Collect results")
            progress.status = AgentStatus.COMPLETED

            if on_progress:
                status_emoji = "✅" if result.exit_code == 0 else "⚠️"
                files_str = f" ({len(files_changed)} files changed)" if files_changed else ""
                await on_progress(f"{status_emoji} Task completed{files_str}")

            return ClaudeCodeResult(
                success=result.exit_code == 0 or bool(files_changed),
                output=result.stdout,
                files_changed=files_changed,
                branch_name=branch.branch_name,
                duration_seconds=progress.elapsed_seconds(),
                todos=todos,
            )

        except Exception as e:
            logger.error(f"Task failed with exception: {e}")

            if on_progress:
                await on_progress(f"❌ Task failed: {str(e)[:100]}")

            return ClaudeCodeResult(
                success=False,
                output="",
                error=str(e),
                branch_name=branch.branch_name if branch else None,
                duration_seconds=0,
            )

    async def _execute_with_heartbeat(
        self,
        sandbox: PersistentSandbox,
        branch: TaskBranch,
        prompt: str,
        on_progress: Optional[ProgressCallback] = None,
        discord_user_id: Optional[int] = None,
        discord_channel_id: Optional[int] = None,
    ) -> CommandResult:
        """
        Execute ccr with heartbeat progress updates.

        Sends periodic updates so Discord embed shows activity.
        """
        heartbeat_messages = [
            "⏳ Working on the task...",
            "🔍 Analyzing code...",
            "💭 Thinking...",
            "⚙️ Processing...",
            "📝 Making changes...",
            "🔧 Working...",
        ]

        heartbeat_task = None
        heartbeat_idx = 0
        loop = asyncio.get_running_loop()
        start_time = loop.time()

        async def heartbeat_loop():
            """Send periodic progress updates while ccr runs."""
            nonlocal heartbeat_idx
            while True:
                await asyncio.sleep(self.config.heartbeat_interval)
                if on_progress:
                    elapsed = int(loop.time() - start_time)
                    mins, secs = divmod(elapsed, 60)
                    msg = heartbeat_messages[heartbeat_idx % len(heartbeat_messages)]
                    await on_progress(f"{msg} ({mins}m {secs}s)")
                    heartbeat_idx += 1

        try:
            # Start heartbeat task if we have a progress callback
            if on_progress:
                heartbeat_task = asyncio.create_task(heartbeat_loop())

            # Execute ccr (pass Discord IDs for terminal ownership tracking)
            result = await sandbox.run_ccr(
                branch, prompt,
                discord_user_id=discord_user_id or 0,
                discord_channel_id=discord_channel_id or 0,
            )

        finally:
            # Cancel heartbeat when done
            if heartbeat_task:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass

        # Send final output snippets
        if on_progress and result.stdout:
            lines = result.stdout.split('\n')
            for line in lines[-10:]:
                line = line.strip()
                if line and not line.startswith('[') and len(line) < 200:
                    if any(skip in line.lower() for skip in ['token', 'cost', 'session']):
                        continue
                    await on_progress(f"📝 {line[:100]}")

        return result

    async def get_branch_diff(self, task_id: str) -> str:
        """Get the git diff for a task."""
        branch = self._active_branches.get(task_id)
        if not branch:
            return ""

        sandbox = await self._get_sandbox()
        return await sandbox.get_branch_diff(branch)

    async def get_files_changed(self, task_id: str) -> list[str]:
        """Get list of files changed for a task."""
        branch = self._active_branches.get(task_id)
        if not branch:
            return []

        sandbox = await self._get_sandbox()
        return await sandbox.get_branch_files_changed(branch)

    async def continue_task(
        self,
        task_id: str,
        prompt: str,
        on_progress: Optional[ProgressCallback] = None,
    ) -> ClaudeCodeResult:
        """
        Continue a task with additional instructions.

        Uses the same branch as the original task.
        """
        branch = self._active_branches.get(task_id)
        if not branch:
            return ClaudeCodeResult(
                success=False,
                output="",
                error=f"Task {task_id} not found",
            )

        sandbox = await self._get_sandbox()

        if on_progress:
            await on_progress(f"🔄 Continuing on branch {branch.branch_name}...")

        result = await self._execute_with_heartbeat(
            sandbox,
            branch,
            prompt,
            on_progress
        )

        files_changed = await sandbox.get_branch_files_changed(branch)
        todos = parse_todos_from_output(result.stdout)

        if on_progress:
            status_emoji = "✅" if result.exit_code == 0 else "⚠️"
            await on_progress(f"{status_emoji} Continuation completed")

        return ClaudeCodeResult(
            success=result.exit_code == 0 or bool(files_changed),
            output=result.stdout,
            files_changed=files_changed,
            branch_name=branch.branch_name,
            todos=todos,
        )

    async def cleanup_task(self, task_id: str):
        """Clean up a task (delete branch)."""
        branch = self._active_branches.pop(task_id, None)
        self._progress.pop(task_id, None)

        if branch:
            sandbox = await self._get_sandbox()
            await sandbox.cleanup_branch(branch)
            logger.info(f"Cleaned up task {task_id}")

    async def list_active_tasks(self) -> list[dict]:
        """List all active tasks."""
        return [
            {
                "task_id": branch.task_id,
                "branch": branch.branch_name,
                "user_id": branch.user_id,
                "created_at": branch.created_at.isoformat(),
                "description": branch.description,
            }
            for branch in self._active_branches.values()
        ]

    def get_progress(self, task_id: str) -> Optional[TaskProgress]:
        """Get current progress for a task."""
        return self._progress.get(task_id)


# =============================================================================
# GLOBAL INSTANCE
# =============================================================================

_claude_code_agent: Optional[ClaudeCodeAgent] = None


def get_claude_code_agent() -> ClaudeCodeAgent:
    """Get or create the global Claude Code agent instance."""
    global _claude_code_agent
    if _claude_code_agent is None:
        _claude_code_agent = ClaudeCodeAgent()
    return _claude_code_agent


# Backward compatibility alias
claude_code_agent = None  # Will be lazily initialized


class _LazyClaudeCodeAgent:
    """Lazy proxy for claude_code_agent."""
    def __getattr__(self, name):
        return getattr(get_claude_code_agent(), name)


claude_code_agent = _LazyClaudeCodeAgent()
