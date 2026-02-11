"""
Persistent Docker sandbox for ccr code execution.

Architecture:
- Single persistent container "polly_sandbox" running 24/7
- Volume mount: data/sandbox/workspace -> /workspace in container
- ccr service runs inside, handles multiple concurrent tasks
- Each task creates a git branch for isolation
- Bot AI handles all git push/PR operations (not ccr)

The sandbox survives bot restarts via Docker's restart policy.
All files are stored in data/sandbox/ for easy access/cleanup.
"""

import asyncio
import json
import logging
import os
import shlex
import shutil
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

# Container name (persistent) - defined early for TerminalManager
CONTAINER_NAME = "polly_sandbox"


# =============================================================================
# PERSISTENT TERMINAL SESSION
# =============================================================================

@dataclass
class TerminalSession:
    """
    A persistent terminal session inside Docker.

    Architecture: TERMINAL-PER-THREAD (optimal for concurrency)

    Each Discord thread gets its own terminal that stays alive between
    polly_agent calls. This enables TRUE CONCURRENT task execution:

    Thread A → Terminal A → ccr --session-id A → branch thread/A
    Thread B → Terminal B → ccr --session-id B → branch thread/B
    Thread C → Terminal C → ccr --session-id C → branch thread/C

    Why terminal-per-thread (not single terminal):
    - Concurrent ccr commands REQUIRE separate shells (tested!)
    - Single terminal forces sequential execution (tasks queue up)
    - Multiple terminals = multiple users can work simultaneously

    Lifecycle:
    - Created when user starts a task in a Discord thread
    - Auto-closed after 5 minutes of inactivity (to save resources)
    - User can resume anytime - ccr sessions are independent of terminals
    - Git branches persist all code changes regardless of terminal state
    """
    thread_id: str  # Discord thread ID (THE universal key)
    process: asyncio.subprocess.Process
    stdin: asyncio.StreamWriter
    stdout: asyncio.StreamReader
    stderr: asyncio.StreamReader
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_used: datetime = field(default_factory=datetime.utcnow)
    is_busy: bool = False  # True when ccr is running
    user_id: int = 0  # Discord user ID who started this terminal
    channel_id: int = 0  # Discord channel ID for notifications

    async def send_command(self, command: str, timeout: Optional[int] = None) -> str:
        """
        Send a command to this terminal and wait for output.

        Uses a marker to detect command completion.
        Reads in chunks to handle programs that don't output line-by-line.
        """
        marker = f"__CCR_DONE_{self.thread_id}_{int(datetime.utcnow().timestamp())}__"

        # Send command with completion marker
        full_cmd = f"{command}; echo '{marker}'\n"
        logger.debug(f"Terminal {self.thread_id}: sending command (len={len(command)})")
        self.stdin.write(full_cmd.encode())
        await self.stdin.drain()

        # Read until we see the marker
        # Use chunk-based reading to handle programs that use \r for progress
        output_buffer = ""
        start_time = asyncio.get_running_loop().time()
        chunk_timeout = 5.0  # Read in 5-second chunks
        last_log_time = start_time
        chunks_read = 0

        while True:
            # Check overall timeout
            if timeout:
                elapsed = asyncio.get_running_loop().time() - start_time
                if elapsed >= timeout:
                    logger.warning(f"Terminal {self.thread_id}: command timed out after {elapsed:.0f}s")
                    return output_buffer + "\n[TIMEOUT]"
                current_timeout = min(chunk_timeout, timeout - elapsed)
            else:
                current_timeout = chunk_timeout

            try:
                # Read available data (up to 4KB for more frequent reads)
                chunk = await asyncio.wait_for(
                    self.stdout.read(4096),
                    timeout=current_timeout
                )
                if not chunk:
                    # EOF - process exited
                    logger.warning(f"Terminal {self.thread_id}: EOF (process exited?)")
                    break

                decoded = chunk.decode(errors="replace")
                output_buffer += decoded
                chunks_read += 1

                # Log progress periodically (every 30s)
                now = asyncio.get_running_loop().time()
                if now - last_log_time > 30:
                    logger.info(f"Terminal {self.thread_id}: {chunks_read} chunks, {len(output_buffer)} bytes, {now - start_time:.0f}s elapsed")
                    last_log_time = now

                # Check for marker in accumulated output
                if marker in output_buffer:
                    # Remove everything from marker onwards
                    marker_pos = output_buffer.find(marker)
                    output_buffer = output_buffer[:marker_pos].rstrip()
                    logger.debug(f"Terminal {self.thread_id}: marker found, output {len(output_buffer)} bytes")
                    break

            except asyncio.TimeoutError:
                # No data available yet - log occasionally
                now = asyncio.get_running_loop().time()
                if now - last_log_time > 30:
                    logger.info(f"Terminal {self.thread_id}: waiting for output... ({now - start_time:.0f}s elapsed, {len(output_buffer)} bytes so far)")
                    last_log_time = now
                continue

        self.last_used = datetime.utcnow()
        return output_buffer

    async def close(self):
        """Close this terminal session."""
        try:
            self.stdin.write(b"exit\n")
            await self.stdin.drain()
            self.process.terminate()
            await asyncio.wait_for(self.process.wait(), timeout=5)
        except Exception as e:
            logger.warning(f"Error closing terminal {self.thread_id}: {e}")
            self.process.kill()


class TerminalManager:
    """
    Manages persistent terminal sessions per Discord thread.

    Terminal lifecycle (simplified):
    - Created when user starts a task in a Discord thread
    - Auto-closed after 5 minutes of inactivity (to save resources)
    - User can resume anytime - ccr sessions persist independently
    - Git branches preserve all code changes regardless of terminal state

    Why this works:
    - ccr sessions are identified by thread ID, not terminal
    - Git branches (thread/{id}) persist all committed changes
    - Terminals are just execution environments, not state containers
    - Auto-closing saves Docker resources without losing work
    """

    # File to persist terminal metadata
    TERMINALS_FILE = Path(__file__).parent.parent.parent.parent / "data" / "terminals.json"

    def __init__(self, container_name: str = CONTAINER_NAME):
        self.container_name = container_name
        self._terminals: Dict[str, TerminalSession] = {}
        self._terminal_metadata: Dict[str, dict] = {}  # Persisted: thread_id -> {user_id, channel_id}
        self._lock = asyncio.Lock()
        # Load persisted metadata on init
        self._load_metadata()

    def _load_metadata(self):
        """Load terminal metadata from disk."""
        try:
            if self.TERMINALS_FILE.exists():
                import json
                with open(self.TERMINALS_FILE, 'r') as f:
                    self._terminal_metadata = json.load(f)
                logger.info(f"Loaded {len(self._terminal_metadata)} terminal metadata entries")
        except Exception as e:
            logger.warning(f"Failed to load terminal metadata: {e}")
            self._terminal_metadata = {}

    def _save_metadata(self):
        """Save terminal metadata to disk."""
        try:
            import json
            self.TERMINALS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(self.TERMINALS_FILE, 'w') as f:
                json.dump(self._terminal_metadata, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save terminal metadata: {e}")

    async def get_terminal(
        self,
        thread_id: str,
        user_id: int = 0,
        channel_id: int = 0,
    ) -> TerminalSession:
        """
        Get or create a persistent terminal for a Discord thread.

        The terminal runs as 'coder' user with proper environment.
        """
        async with self._lock:
            if thread_id in self._terminals:
                terminal = self._terminals[thread_id]
                # Check if still alive
                if terminal.process.returncode is None:
                    logger.debug(f"Reusing existing terminal for thread {thread_id}")
                    return terminal
                else:
                    logger.info(f"Terminal for thread {thread_id} died, recreating")
                    del self._terminals[thread_id]

            # Create new terminal
            terminal = await self._create_terminal(thread_id)
            # Store Discord metadata for notifications
            terminal.user_id = user_id
            terminal.channel_id = channel_id
            self._terminals[thread_id] = terminal

            # Persist metadata so buttons work after bot restart
            self._terminal_metadata[thread_id] = {
                "user_id": user_id,
                "channel_id": channel_id,
            }
            self._save_metadata()

            return terminal

    async def _create_terminal(self, thread_id: str) -> TerminalSession:
        """Create a new persistent terminal session in Docker."""
        logger.info(f"Creating persistent terminal for thread {thread_id}")

        # Start an interactive shell in the container as coder user
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", "-i",
            "-u", "coder",
            "-w", "/workspace/pollinations",
            self.container_name,
            "bash", "--norc", "--noprofile",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,  # Merge stderr into stdout
        )

        # These should always exist since we specified PIPE
        if proc.stdin is None or proc.stdout is None:
            raise RuntimeError("Failed to create subprocess pipes")

        terminal = TerminalSession(
            thread_id=thread_id,
            process=proc,
            stdin=proc.stdin,
            stdout=proc.stdout,
            stderr=proc.stderr or proc.stdout,  # stderr merged into stdout
        )

        # Initialize the shell environment
        init_cmds = [
            "set +e",  # Don't exit on command failure
            "export PS1=''",  # No prompt (cleaner output)
            "export HOME=/home/coder",
            "source ~/.bashrc 2>/dev/null || true",  # Load user environment (PATH, etc)
            "set +e",  # Re-set after bashrc (in case it set -e)
            "export PATH=$HOME/.local/bin:$HOME/.npm-global/bin:$PATH",  # Ensure ccr is in PATH
            "cd /workspace/pollinations",
        ]

        for cmd in init_cmds:
            await terminal.send_command(cmd, timeout=5)

        # Ensure ccr service is running (it's a background daemon)
        await terminal.send_command("ccr start 2>/dev/null || true", timeout=10)

        logger.info(f"Terminal ready for thread {thread_id}")
        return terminal

    async def close_terminal(self, thread_id: str) -> bool:
        """
        Close a terminal session.

        Returns:
            True if terminal was found and closed, False if not found
        """
        async with self._lock:
            closed = False

            # Close in-memory terminal if exists
            if thread_id in self._terminals:
                terminal = self._terminals.pop(thread_id)
                await terminal.close()
                logger.info(f"Closed terminal for thread {thread_id}")
                closed = True

            # Always remove from persisted metadata
            if thread_id in self._terminal_metadata:
                del self._terminal_metadata[thread_id]
                self._save_metadata()
                logger.info(f"Removed terminal metadata for thread {thread_id}")
                closed = True  # Count as closed even if just metadata

            if not closed:
                logger.debug(f"Terminal for thread {thread_id} not found (already closed?)")

            return closed

    async def cleanup_idle_terminals(self, max_idle_seconds: int = 300) -> int:
        """
        Auto-close terminals that have been idle for too long.

        No notification needed - users can resume anytime since:
        - ccr sessions persist by thread ID
        - Git branches preserve all code changes
        - Terminals are just execution environments

        Args:
            max_idle_seconds: Close terminals idle longer than this (default 5 min)

        Returns:
            Number of terminals closed
        """
        closed_count = 0
        terminals_to_close = []

        async with self._lock:
            now = datetime.utcnow()

            for thread_id, terminal in self._terminals.items():
                idle_time = (now - terminal.last_used).total_seconds()

                # Close if idle > threshold and not busy
                if idle_time > max_idle_seconds and not terminal.is_busy:
                    terminals_to_close.append((thread_id, terminal))

        # Close outside lock to avoid holding it too long
        for thread_id, terminal in terminals_to_close:
            try:
                await terminal.close()
                async with self._lock:
                    self._terminals.pop(thread_id, None)
                    self._terminal_metadata.pop(thread_id, None)
                closed_count += 1
                logger.info(f"Auto-closed idle terminal {thread_id}")
            except Exception as e:
                logger.warning(f"Error closing idle terminal {thread_id}: {e}")

        if closed_count > 0:
            self._save_metadata()

        return closed_count

    def get_terminal_info(self, thread_id: str) -> dict | None:
        """
        Get terminal info for a thread (used by persistent button handlers).

        Returns dict with user_id, channel_id, or None if terminal doesn't exist.
        Falls back to persisted metadata if terminal process died but metadata exists.
        """
        # First check in-memory terminals
        if thread_id in self._terminals:
            terminal = self._terminals[thread_id]
            return {
                "user_id": terminal.user_id,
                "channel_id": terminal.channel_id,
                "last_used": terminal.last_used.isoformat(),
                "is_busy": terminal.is_busy,
            }

        # Fallback to persisted metadata (for after bot restart)
        if thread_id in self._terminal_metadata:
            return {
                "user_id": self._terminal_metadata[thread_id].get("user_id", 0),
                "channel_id": self._terminal_metadata[thread_id].get("channel_id", 0),
                "last_used": None,  # Unknown after restart
                "is_busy": False,
            }

        return None

    async def cleanup_stale(self, max_idle_seconds: int = 300):
        """Auto-close idle terminals. Alias for cleanup_idle_terminals()."""
        return await self.cleanup_idle_terminals(max_idle_seconds)

    async def close_all(self):
        """Close all terminal sessions and clear metadata."""
        async with self._lock:
            for thread_id, terminal in list(self._terminals.items()):
                await terminal.close()
            self._terminals.clear()
            self._terminal_metadata.clear()
            self._save_metadata()
            logger.info("Closed all terminal sessions and cleared metadata")

# Project root (Polli/) - dynamic, not hardcoded
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

# Sandbox data directory
SANDBOX_DIR = PROJECT_ROOT / "data" / "sandbox"
WORKSPACE_DIR = SANDBOX_DIR / "workspace"
CCR_CONFIG_DIR = SANDBOX_DIR / "ccr_config"

# Source repo for syncing (embeddings repo)
REPO_SOURCE_DIR = PROJECT_ROOT / "data" / "repo" / "pollinations_pollinations"


@dataclass
class SandboxConfig:
    """Configuration for the persistent sandbox."""
    image: str = "node:20"  # Full image with bash, git, build tools
    memory_limit: str = "4g"
    cpu_limit: float = 4.0
    restart_policy: str = "unless-stopped"  # Survives bot/host restarts
    network_enabled: bool = True  # For npm install, API calls


@dataclass
class CommandResult:
    """Result of a command execution."""
    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool = False
    duration: float = 0.0


@dataclass
class TaskBranch:
    """Represents a task running on a git branch."""
    branch_name: str
    task_id: str
    user_id: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: str = "active"  # active, completed, abandoned
    description: str = ""


class PersistentSandbox:
    """
    Manages a single persistent Docker sandbox for all ccr tasks.

    Features:
    - Single container running 24/7
    - Volume mount for persistence (data/sandbox/workspace)
    - Branch-based task isolation
    - Concurrent task support (multiple ccr processes)
    - Survives bot restarts
    - Persistent terminal sessions per Discord thread (for ccr context)

    Usage:
        sandbox = PersistentSandbox()
        await sandbox.ensure_running()

        # Create branch for task
        branch = await sandbox.create_task_branch("user123", "Fix bug in API")

        # Run ccr on that branch
        result = await sandbox.run_ccr(branch, "Fix the null pointer bug")

        # After task, Bot AI handles push/PR
    """

    def __init__(self, config: Optional[SandboxConfig] = None):
        self.config = config or SandboxConfig()
        self.active_branches: dict[str, TaskBranch] = {}
        self.terminal_manager = TerminalManager()  # Persistent terminals per thread
        self._setup_directories()

    def _setup_directories(self):
        """Create necessary directories."""
        SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
        WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
        CCR_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"Sandbox directories ready at {SANDBOX_DIR}")

    async def ensure_running(self) -> bool:
        """
        Ensure the sandbox container is running.

        - If container exists and running: use it
        - If container exists but stopped: start it
        - If container doesn't exist: create it

        Returns True if sandbox is ready.
        """
        # Check if container exists
        check_result = await self._run_host_command([
            "docker", "inspect", CONTAINER_NAME
        ])

        if check_result.exit_code == 0:
            # Container exists, check if running
            status_result = await self._run_host_command([
                "docker", "inspect", "-f", "{{.State.Running}}", CONTAINER_NAME
            ])

            if "true" in status_result.stdout.lower():
                logger.info(f"Sandbox {CONTAINER_NAME} already running")
                # Always ensure ccr is running (it may have died)
                await self._ensure_ccr_running()
                return True
            else:
                # Start stopped container
                logger.info(f"Starting stopped sandbox {CONTAINER_NAME}")
                start_result = await self._run_host_command([
                    "docker", "start", CONTAINER_NAME
                ])
                if start_result.exit_code == 0:
                    await self._ensure_ccr_running()
                    return True
                else:
                    logger.error(f"Failed to start container: {start_result.stderr}")
                    return False
        else:
            # Container doesn't exist, create it
            return await self._create_container()

    async def _create_container(self) -> bool:
        """Create the persistent sandbox container."""
        logger.info(f"Creating persistent sandbox {CONTAINER_NAME}")

        config = self.config

        # Convert paths for Docker (handle Windows paths)
        workspace_mount = str(WORKSPACE_DIR.resolve()).replace("\\", "/")
        ccr_config_mount = str(CCR_CONFIG_DIR.resolve()).replace("\\", "/")

        cmd = [
            "docker", "run", "-d",
            "--name", CONTAINER_NAME,
            "-v", f"{workspace_mount}:/workspace",
            "-v", f"{ccr_config_mount}:/home/coder/.claude-code-router",
            "-w", "/workspace",
            "--memory", config.memory_limit,
            "--cpus", str(config.cpu_limit),
            "--restart", config.restart_policy,
        ]

        if not config.network_enabled:
            cmd.extend(["--network", "none"])

        cmd.extend([config.image, "tail", "-f", "/dev/null"])

        result = await self._run_host_command(cmd)
        if result.exit_code != 0:
            logger.error(f"Failed to create container: {result.stderr}")
            return False

        logger.info(f"Container created: {result.stdout.strip()[:12]}")

        # Initial setup
        await self._initial_setup()

        return True

    async def _initial_setup(self):
        """One-time setup when container is first created."""
        logger.info("Running initial sandbox setup...")

        # Create non-root user (ccr requires non-root for --dangerously-skip-permissions)
        await self.execute("useradd -m coder 2>/dev/null || true")

        # Install ccr
        logger.info("Installing ccr (this may take a minute)...")
        install_result = await self.execute(
            "npm install -g @anthropic-ai/claude-code @musistudio/claude-code-router 2>&1",
            timeout=300
        )
        if install_result.exit_code != 0:
            logger.error(f"Failed to install ccr: {install_result.stderr}")
        else:
            logger.info("ccr installed successfully")

        # Setup permissions
        await self.execute("chown -R coder:coder /home/coder")
        await self.execute("chown -R coder:coder /workspace 2>/dev/null || true")

        # Fix temp file permissions for ccr
        await self.execute("touch /tmp/claude-code-reference-count.txt && chmod 666 /tmp/claude-code-reference-count.txt")

        # Setup git config (for both root and coder user)
        await self.execute("git config --global user.email 'polly@pollinations.ai'")
        await self.execute("git config --global user.name 'Polly Bot'")
        await self.execute("git config --global --add safe.directory '*'")
        # Also set for coder user
        await self.execute("su - coder -c \"git config --global user.email 'polly@pollinations.ai'\"")
        await self.execute("su - coder -c \"git config --global user.name 'Polly Bot'\"")
        await self.execute("su - coder -c \"git config --global --add safe.directory '*'\"")

        # Setup commit-msg hook to strip Claude Code attribution
        await self._setup_commit_hook()

        # Write ccr config
        await self._write_ccr_config()

        # Start ccr service
        await self._ensure_ccr_running()

        logger.info("Initial setup complete")

    async def _setup_commit_hook(self):
        """
        Setup a commit-msg hook to strip Claude Code attribution from commits.

        Claude Code adds these lines to commit messages:
        - 🤖 Generated with [Claude Code](https://claude.com/claude-code)
        - Co-Authored-By: Claude <noreply@anthropic.com>

        We want commits to only show as "Polly Bot".
        """
        # Create a commit-msg hook script that strips Claude attribution
        hook_script = '''#!/bin/bash
# Strip Claude Code attribution from commit messages
# Keep only the actual commit message, remove Claude branding

COMMIT_MSG_FILE="$1"

# Remove Claude Code attribution lines
sed -i '/🤖 Generated with/d' "$COMMIT_MSG_FILE"
sed -i '/Co-Authored-By: Claude/d' "$COMMIT_MSG_FILE"
sed -i '/claude.com\\/claude-code/d' "$COMMIT_MSG_FILE"

# Remove trailing empty lines
sed -i -e :a -e '/^\\n*$/{$d;N;ba' -e '}' "$COMMIT_MSG_FILE"
'''
        # Write hook to sandbox
        hook_path = SANDBOX_DIR / "commit-msg-hook"
        hook_path.write_text(hook_script)

        # Copy to container's git template
        await self._run_host_command([
            "docker", "cp",
            str(hook_path),
            f"{CONTAINER_NAME}:/tmp/commit-msg"
        ])

        # Setup as global git hook template
        await self.execute("mkdir -p /home/coder/.git-templates/hooks")
        await self.execute("cp /tmp/commit-msg /home/coder/.git-templates/hooks/commit-msg")
        await self.execute("chmod +x /home/coder/.git-templates/hooks/commit-msg")
        await self.execute("chown -R coder:coder /home/coder/.git-templates")

        # Configure git to use this template
        await self.execute("su - coder -c \"git config --global init.templateDir ~/.git-templates\"")

        # Also copy directly to workspace repo if it exists
        await self.execute(
            "mkdir -p /workspace/pollinations/.git/hooks && "
            "cp /tmp/commit-msg /workspace/pollinations/.git/hooks/commit-msg && "
            "chmod +x /workspace/pollinations/.git/hooks/commit-msg 2>/dev/null || true"
        )

        # Cleanup
        hook_path.unlink(missing_ok=True)

        logger.info("Commit hook setup to strip Claude attribution")

    async def _write_ccr_config(self):
        """Write ccr configuration file."""
        from ...config import config as app_config

        ccr_config = {
            "LOG": True,
            "LOG_LEVEL": "info",
            "CLAUDE_PATH": "",
            "HOST": "127.0.0.1",
            "PORT": 3456,
            "APIKEY": "",
            "API_TIMEOUT_MS": "600000",  # 10 minutes
            "PROXY_URL": "",
            "NON_INTERACTIVE_MODE": True,  # Required for piped stdin in persistent terminals
            "transformers": [],
            "Providers": [
                {
                    "name": "main",
                    "api_base_url": "https://gen.pollinations.ai/v1/chat/completions",
                    "api_key": app_config.pollinations_token if hasattr(app_config, 'pollinations_token') else "",
                    "models": [
                        "openai-large",
                        "gemini-large",
                        "gemini",
                        "claude-large",
                        "perplexity-fast"
                    ],
                    "transformer": {
                        "use": ["customparams"]
                    }
                }
            ],
            "StatusLine": {
                "enabled": True,
                "currentStyle": "default",
                "default": {"modules": []},
                "powerline": {"modules": []}
            },
            "Router": {
                "default": "main,claude-large",
                "background": "main,gemini",
                "think": "",
                "longContext": "",
                "longContextThreshold": 60000,
                "webSearch": "main,perplexity-fast",
                "image": ""
            },
            "CUSTOM_ROUTER_PATH": ""
        }

        config_path = CCR_CONFIG_DIR / "config.json"
        config_path.write_text(json.dumps(ccr_config, indent=2))

        # Also copy to container's coder home (in case volume mount timing issue)
        await self.execute(f"mkdir -p /home/coder/.claude-code-router")
        await self.execute(f"chown -R coder:coder /home/coder/.claude-code-router")

        logger.info(f"ccr config written to {config_path}")

    async def _ensure_ccr_running(self):
        """Ensure ccr service is running."""
        # Start ccr as coder user
        await self.execute("su - coder -c 'ccr start' 2>&1", timeout=30)
        await asyncio.sleep(2)

        # Verify
        status = await self.execute("su - coder -c 'ccr status' 2>&1")
        if "running" in status.stdout.lower():
            logger.info("ccr service is running")
        else:
            logger.warning(f"ccr status unclear: {status.stdout}")

    async def sync_repo(self, force: bool = False) -> bool:
        """
        Sync the pollinations repo from data/repo to workspace.

        Only syncs if:
        - Workspace is empty, OR
        - force=True

        The source repo in data/repo/ is kept up-to-date by the embeddings system.
        """
        workspace_repo = WORKSPACE_DIR / "pollinations"

        if workspace_repo.exists() and not force:
            logger.info("Workspace repo already exists, skipping sync")
            return True

        if not REPO_SOURCE_DIR.exists():
            logger.error(f"Source repo not found at {REPO_SOURCE_DIR}")
            return False

        logger.info(f"Syncing repo from {REPO_SOURCE_DIR} to workspace...")

        # Clear existing workspace repo if force sync
        if workspace_repo.exists() and force:
            shutil.rmtree(workspace_repo, ignore_errors=True)

        # Copy repo to workspace
        try:
            shutil.copytree(REPO_SOURCE_DIR, workspace_repo, dirs_exist_ok=True)
            logger.info("Repo copied to workspace")
        except Exception as e:
            logger.error(f"Failed to copy repo: {e}")
            return False

        # Ensure proper permissions in container
        await self.execute("chown -R coder:coder /workspace/pollinations 2>/dev/null || true")

        # Reset to main branch
        await self.execute(
            "cd /workspace/pollinations && git checkout main 2>/dev/null || true",
            as_coder=True
        )

        return True

    async def create_task_branch(
        self,
        user_id: str,
        task_description: str,
        task_id: Optional[str] = None,
        thread_id: Optional[int] = None,  # Discord thread ID - THE universal key
    ) -> TaskBranch:
        """
        Create a new git branch for a task.

        Each task gets its own branch for isolation.
        Multiple users can work concurrently on different branches.

        IMPORTANT: Always fetches latest from origin and branches from origin/main
        to ensure we're working with the latest code.

        Thread ID as Universal Key:
        - If thread_id provided, use it directly as task_id and branch name
        - This means: thread_id = task_id = branch_name = ccr session
        - No mapping needed - the thread ID IS the identifier
        - Example: thread 1234567890 → branch "thread/1234567890"
        """
        # Use thread_id as the universal key if provided
        if thread_id:
            task_id = str(thread_id)
            branch_name = f"thread/{thread_id}"
        else:
            # Fallback for non-Discord usage (e.g., CLI testing)
            import uuid
            task_id = task_id or str(uuid.uuid4())[:8]
            branch_name = f"task/{task_id}"

        # CRITICAL: Fetch latest from origin first
        logger.info("Fetching latest from origin...")
        fetch_result = await self.execute(
            "cd /workspace/pollinations && git fetch origin main",
            as_coder=True
        )
        if fetch_result.exit_code != 0:
            logger.warning(f"git fetch failed: {fetch_result.stderr}")

        # Ensure we're on main first and update it to origin/main
        await self.execute(
            "cd /workspace/pollinations && git checkout main 2>/dev/null || true",
            as_coder=True
        )

        # Reset local main to origin/main to ensure we're up to date
        reset_result = await self.execute(
            "cd /workspace/pollinations && git reset --hard origin/main",
            as_coder=True
        )
        if reset_result.exit_code != 0:
            logger.warning(f"git reset failed: {reset_result.stderr}")

        # Create and checkout new branch FROM the updated main
        result = await self.execute(
            f"cd /workspace/pollinations && git checkout -b {branch_name}",
            as_coder=True
        )

        if result.exit_code != 0:
            # Branch might exist, delete it and recreate from fresh main
            logger.info(f"Branch {branch_name} exists, recreating from fresh main...")
            await self.execute(
                f"cd /workspace/pollinations && git branch -D {branch_name} 2>/dev/null || true",
                as_coder=True
            )
            result = await self.execute(
                f"cd /workspace/pollinations && git checkout -b {branch_name}",
                as_coder=True
            )

        branch = TaskBranch(
            branch_name=branch_name,
            task_id=task_id,
            user_id=user_id,
            description=task_description
        )

        self.active_branches[task_id] = branch
        logger.info(f"Created task branch {branch_name} for user {user_id} (from latest origin/main)")

        return branch

    async def run_ccr(
        self,
        branch: TaskBranch,
        prompt: str,
        discord_user_id: int = 0,
        discord_channel_id: int = 0,
    ) -> CommandResult:
        """
        Run ccr on a specific task branch using persistent terminal.

        Args:
            branch: TaskBranch to work on
            prompt: The task prompt for ccr
            discord_user_id: Discord user ID (for terminal ownership tracking)
            discord_channel_id: Discord channel ID (for stale terminal notifications)

        Returns:
            CommandResult with ccr output

        Terminal Persistence (KEY INSIGHT):
        - Each Discord thread gets a persistent terminal session
        - ccr runs in that terminal via print mode (-p)
        - When ccr auto-compacts (context too long), it stays in SAME terminal
        - The new session inherits context from the old one
        - So: terminal persistence = ccr conversation context persistence!

        Git Branch State:
        - git branch is always the source of truth for code changes
        - ccr sees committed code even without conversation memory
        - Both terminal context AND git history provide continuity
        """
        # Add instruction about commit messages (no Claude attribution)
        full_prompt = (
            "IMPORTANT: When making commits, use simple descriptive messages. "
            "Do NOT include any Claude, AI, or bot attribution in commit messages. "
            "Just describe what was changed.\n\n"
            f"{prompt}"
        )

        # Escape prompt for shell using shlex.quote for proper sanitization
        escaped_prompt = shlex.quote(full_prompt)

        # Build ccr command
        # -p: print mode (non-interactive, outputs result and exits)
        # --dangerously-skip-permissions: auto-accept (safe in sandbox)
        # Use stdbuf to force line buffering (ccr may buffer output)
        ccr_cmd = f"stdbuf -oL -eL ccr code -p --dangerously-skip-permissions {escaped_prompt}"

        logger.info(f"Running ccr on branch {branch.branch_name}: {prompt[:100]}...")

        # Check if this is a thread-based task (has thread_id as task_id)
        # Thread IDs are numeric and typically large
        is_thread_task = branch.task_id.isdigit() and len(branch.task_id) > 10

        if is_thread_task:
            # Use persistent terminal for thread-based tasks
            return await self._run_ccr_in_terminal(
                branch, ccr_cmd,
                discord_user_id=discord_user_id,
                discord_channel_id=discord_channel_id,
            )
        else:
            # Fallback to one-shot execution for non-thread tasks (CLI testing, etc.)
            cmd = f"cd /workspace/pollinations && git checkout {branch.branch_name} && {ccr_cmd}"
            return await self.execute(cmd, as_coder=True, timeout=None)

    async def _run_ccr_in_terminal(
        self,
        branch: TaskBranch,
        ccr_cmd: str,
        discord_user_id: int = 0,
        discord_channel_id: int = 0,
    ) -> CommandResult:
        """
        Run ccr in a persistent terminal session.

        The terminal stays alive between polly_agent calls, so ccr can
        maintain conversation context even when it auto-compacts sessions.
        """
        start_time = asyncio.get_running_loop().time()

        try:
            # Get persistent terminal for this thread (pass Discord IDs for ownership tracking)
            terminal = await self.terminal_manager.get_terminal(
                branch.task_id,
                user_id=discord_user_id,
                channel_id=discord_channel_id,
            )
            terminal.is_busy = True

            # Ensure we're on the right branch
            await terminal.send_command(f"git checkout {branch.branch_name}", timeout=30)

            # Run ccr (no timeout - it can take a while)
            output = await terminal.send_command(ccr_cmd, timeout=None)

            terminal.is_busy = False

            return CommandResult(
                exit_code=0,  # We can't easily get exit code from terminal
                stdout=output,
                stderr="",
                duration=asyncio.get_running_loop().time() - start_time
            )

        except Exception as e:
            logger.error(f"Error running ccr in terminal: {e}")
            return CommandResult(
                exit_code=1,
                stdout="",
                stderr=str(e),
                duration=asyncio.get_running_loop().time() - start_time
            )

    async def get_branch_diff(self, branch: TaskBranch) -> str:
        """Get the git diff for a task branch."""
        result = await self.execute(
            f"cd /workspace/pollinations && git diff main...{branch.branch_name}",
            as_coder=True
        )
        return result.stdout

    async def get_branch_files_changed(self, branch: TaskBranch) -> list[str]:
        """Get list of files changed on a task branch."""
        result = await self.execute(
            f"cd /workspace/pollinations && git diff --name-only main...{branch.branch_name}",
            as_coder=True
        )
        if result.exit_code == 0 and result.stdout:
            return [f.strip() for f in result.stdout.split('\n') if f.strip()]
        return []

    async def cleanup_branch(self, branch: TaskBranch):
        """Delete a task branch after completion/abandonment."""
        # Switch to main first
        await self.execute(
            "cd /workspace/pollinations && git checkout main",
            as_coder=True
        )

        # Delete the branch
        await self.execute(
            f"cd /workspace/pollinations && git branch -D {branch.branch_name}",
            as_coder=True
        )

        # Remove from tracking
        self.active_branches.pop(branch.task_id, None)

        logger.info(f"Cleaned up branch {branch.branch_name}")

    async def list_branches(self) -> list[str]:
        """List all task branches."""
        result = await self.execute(
            "cd /workspace/pollinations && git branch --list 'task/*'",
            as_coder=True
        )
        if result.exit_code == 0 and result.stdout:
            return [b.strip().lstrip('* ') for b in result.stdout.split('\n') if b.strip()]
        return []

    async def execute(
        self,
        command: str,
        timeout: Optional[int] = 300,
        as_coder: bool = False,
    ) -> CommandResult:
        """
        Execute a command in the sandbox container.

        Args:
            command: Command to run
            timeout: Timeout in seconds (None for no timeout)
            as_coder: Run as 'coder' user instead of root

        Returns:
            CommandResult with output
        """
        if as_coder:
            command = f"su - coder -c '{command}'"

        cmd = ["docker", "exec", CONTAINER_NAME, "sh", "-c", command]

        return await self._run_host_command(cmd, timeout)

    async def _run_host_command(
        self,
        cmd: list[str],
        timeout: Optional[int] = 60
    ) -> CommandResult:
        """Run a command on the host system."""
        loop = asyncio.get_running_loop()
        start_time = loop.time()

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            if timeout:
                try:
                    stdout, stderr = await asyncio.wait_for(
                        proc.communicate(),
                        timeout=timeout
                    )
                except asyncio.TimeoutError:
                    proc.kill()
                    return CommandResult(
                        exit_code=-1,
                        stdout="",
                        stderr=f"Command timed out after {timeout}s",
                        timed_out=True,
                        duration=loop.time() - start_time
                    )
            else:
                # No timeout
                stdout, stderr = await proc.communicate()

            return CommandResult(
                exit_code=proc.returncode or 0,
                stdout=stdout.decode(errors="replace"),
                stderr=stderr.decode(errors="replace"),
                duration=loop.time() - start_time
            )

        except Exception as e:
            return CommandResult(
                exit_code=1,
                stdout="",
                stderr=str(e),
                duration=loop.time() - start_time
            )

    async def stop(self):
        """Stop the sandbox container (for maintenance)."""
        # Close all terminal sessions first
        await self.terminal_manager.close_all()
        await self._run_host_command(["docker", "stop", CONTAINER_NAME])
        logger.info(f"Stopped sandbox {CONTAINER_NAME}")

    async def destroy(self):
        """Completely remove the sandbox container and data."""
        # Close all terminal sessions first
        await self.terminal_manager.close_all()
        await self._run_host_command(["docker", "stop", CONTAINER_NAME])
        await self._run_host_command(["docker", "rm", CONTAINER_NAME])

        # Optionally clean workspace (uncomment if needed)
        # if WORKSPACE_DIR.exists():
        #     shutil.rmtree(WORKSPACE_DIR, ignore_errors=True)

        logger.info(f"Destroyed sandbox {CONTAINER_NAME}")

    async def is_running(self) -> bool:
        """Check if sandbox container is running."""
        result = await self._run_host_command([
            "docker", "inspect", "-f", "{{.State.Running}}", CONTAINER_NAME
        ])
        return "true" in result.stdout.lower()

    async def close_thread_terminal(self, thread_id: str) -> bool:
        """
        Close the persistent terminal for a specific thread.

        Returns:
            True if terminal was found and closed, False if not found
        """
        return await self.terminal_manager.close_terminal(thread_id)

    async def cleanup_idle_terminals(self, max_idle_seconds: int = 300) -> int:
        """
        Auto-close terminals that have been idle for too long.

        Users can resume anytime - ccr sessions and git branches persist.

        Args:
            max_idle_seconds: Close terminals idle longer than this (default 5 min)

        Returns:
            Number of terminals closed
        """
        return await self.terminal_manager.cleanup_idle_terminals(max_idle_seconds)

    def get_terminal_info(self, thread_id: str) -> dict | None:
        """Get terminal info for a thread (used by persistent button handlers)."""
        return self.terminal_manager.get_terminal_info(thread_id)

    async def cleanup_stale_terminals(self, max_idle_seconds: int = 300):
        """Legacy alias for cleanup_idle_terminals()."""
        return await self.cleanup_idle_terminals(max_idle_seconds)

    async def close_all_terminals(self):
        """Close all persistent terminal sessions."""
        await self.terminal_manager.close_all()

    def get_workspace_path(self) -> Path:
        """Get the host path to workspace (for direct file access)."""
        return WORKSPACE_DIR

    def get_repo_path(self) -> Path:
        """Get the host path to the pollinations repo in workspace."""
        return WORKSPACE_DIR / "pollinations"

    async def setup_github_credentials(self, repo: str = "pollinations/pollinations") -> bool:
        """
        Configure GitHub App credentials in the sandbox for push operations.

        Uses the GitHub App (Polly Bot) for authentication:
        - Creates a git credential helper that returns the App token
        - Tokens auto-refresh (1 hour validity)
        - All pushes show as "Polly Bot" author

        Args:
            repo: Repository in owner/repo format

        Returns:
            True if credentials configured successfully
        """
        from ..github_auth import github_app_auth

        if not github_app_auth:
            logger.warning("GitHub App auth not configured, cannot setup sandbox credentials")
            return False

        try:
            # Get a fresh token
            token = await github_app_auth.get_token()
            if not token:
                logger.error("Failed to get GitHub App token")
                return False

            # Create credential helper script that reads token from environment variable
            # This is more secure than embedding the token directly in the script
            credential_script = '''#!/bin/bash
# GitHub App credential helper for Polly Bot
# Reads token from GH_TOKEN environment variable (set per-session)
echo "username=x-access-token"
echo "password=$GH_TOKEN"
'''
            # Write the credential helper script to sandbox (no token in script)
            helper_path = SANDBOX_DIR / "git-credential-polly"
            helper_path.write_text(credential_script)

            # Copy to container
            await self._run_host_command([
                "docker", "cp",
                str(helper_path),
                f"{CONTAINER_NAME}:/usr/local/bin/git-credential-polly"
            ])

            # Make executable
            await self.execute("chmod +x /usr/local/bin/git-credential-polly")

            # Configure git to use this credential helper
            await self.execute(
                "cd /workspace/pollinations && git config credential.helper '/usr/local/bin/git-credential-polly'",
                as_coder=True
            )

            # Set remote URL to HTTPS (not SSH)
            await self.execute(
                f"cd /workspace/pollinations && git remote set-url origin https://github.com/{repo}.git",
                as_coder=True
            )

            # NOTE: We no longer persist the token to bashrc for security reasons.
            # The push_branch() method passes the token directly in the URL for each
            # push operation, which is more secure as it:
            # 1. Doesn't persist credentials to disk
            # 2. Uses a fresh token for each operation
            # 3. Can't be read by compromised code in the sandbox
            #
            # The credential helper above is kept for backward compatibility but
            # won't work without GH_TOKEN set. push_branch() is the preferred method.

            # Clean up local helper file
            helper_path.unlink(missing_ok=True)

            logger.info("GitHub App credentials configured (using inline token for push)")
            return True

        except Exception as e:
            logger.error(f"Failed to setup GitHub credentials: {e}")
            return False

    async def refresh_github_token(self, repo: str = "pollinations/pollinations") -> bool:
        """
        Refresh the GitHub App token in the sandbox.

        Call this before push operations to ensure token is valid.
        Tokens expire after ~1 hour.
        """
        return await self.setup_github_credentials(repo)

    async def push_branch(self, branch_name: str, repo: str = "pollinations/pollinations") -> CommandResult:
        """
        Push a branch to GitHub using the configured App credentials.

        Uses the GitHub App installation token directly in the push URL
        to avoid credential helper issues in Docker.

        Args:
            branch_name: Name of the branch to push
            repo: Repository in owner/repo format

        Returns:
            CommandResult with push output
        """
        from ..github_auth import github_app_auth

        if not github_app_auth:
            return CommandResult(
                exit_code=1,
                stdout="",
                stderr="GitHub App auth not configured. Cannot push."
            )

        try:
            # Get a fresh token
            token = await github_app_auth.get_token()
            if not token:
                return CommandResult(
                    exit_code=1,
                    stdout="",
                    stderr="Failed to get GitHub App token"
                )

            # Push using token directly in URL (most reliable method in Docker)
            # x-access-token is the standard username for GitHub App installation tokens
            push_url = f"https://x-access-token:{token}@github.com/{repo}.git"

            # Use git push with explicit URL (doesn't persist token in git config)
            result = await self.execute(
                f"cd /workspace/pollinations && git push {push_url} {branch_name}:{branch_name}",
                as_coder=True,
                timeout=120
            )

            # If push succeeded, also set upstream tracking (without token in URL)
            if result.exit_code == 0:
                await self.execute(
                    f"cd /workspace/pollinations && git branch --set-upstream-to=origin/{branch_name} {branch_name}",
                    as_coder=True
                )

            return result

        except Exception as e:
            logger.error(f"Error pushing branch: {e}")
            return CommandResult(
                exit_code=1,
                stdout="",
                stderr=str(e)
            )


# =============================================================================
# BACKWARD COMPATIBILITY
# =============================================================================

# Keep old classes for any code that might reference them
@dataclass
class Sandbox:
    """Legacy sandbox class - now uses PersistentSandbox internally."""
    id: str
    container_id: Optional[str] = None
    workspace_path: Optional[Path] = None
    repo_url: Optional[str] = None
    branch: str = "main"
    created_at: datetime = field(default_factory=datetime.utcnow)
    config: SandboxConfig = field(default_factory=SandboxConfig)
    initiated_by: Optional[str] = None
    initiated_source: Optional[str] = None
    pending_destruction: bool = False


class SandboxManager:
    """
    Legacy SandboxManager - wraps PersistentSandbox for backward compatibility.

    New code should use PersistentSandbox directly.
    """

    def __init__(self, **kwargs):
        self._persistent = PersistentSandbox()
        self.sandboxes: dict[str, Sandbox] = {}
        self.use_docker = True

    async def start(self):
        """Start the sandbox manager."""
        await self._persistent.ensure_running()
        await self._persistent.sync_repo()
        logger.info("SandboxManager started (persistent mode)")

    async def stop(self):
        """Stop the sandbox manager."""
        # Don't stop container - it's persistent!
        logger.info("SandboxManager stopped (container still running)")

    async def create(
        self,
        repo_url: Optional[str] = None,
        branch: str = "main",
        config: Optional[SandboxConfig] = None,
        initiated_by: Optional[str] = None,
        initiated_source: Optional[str] = None,
    ) -> Sandbox:
        """Create a sandbox (actually creates a task branch in persistent sandbox)."""
        import uuid
        sandbox_id = str(uuid.uuid4())[:8]

        # Create task branch
        task_branch = await self._persistent.create_task_branch(
            user_id=initiated_by or "unknown",
            task_description=f"Task from {initiated_source or 'unknown'}",
            task_id=sandbox_id
        )

        sandbox = Sandbox(
            id=sandbox_id,
            container_id=CONTAINER_NAME,
            workspace_path=self._persistent.get_repo_path(),
            repo_url=repo_url,
            branch=task_branch.branch_name,
            config=config or SandboxConfig(),
            initiated_by=initiated_by,
            initiated_source=initiated_source,
        )

        self.sandboxes[sandbox_id] = sandbox
        return sandbox

    async def execute(
        self,
        sandbox_id: str,
        command: str,
        timeout: Optional[int] = None,
        env: Optional[dict] = None,
    ) -> CommandResult:
        """Execute a command in the sandbox."""
        sandbox = self.sandboxes.get(sandbox_id)

        # Add env vars to command if provided
        if env:
            env_str = " ".join(f"{k}={v}" for k, v in env.items())
            command = f"{env_str} {command}"

        # If we have a sandbox, work on its branch
        if sandbox and sandbox.branch != "main":
            # Ensure we're on the right branch
            await self._persistent.execute(
                f"cd /workspace/pollinations && git checkout {sandbox.branch} 2>/dev/null || true",
                as_coder=True
            )

        return await self._persistent.execute(command, timeout=timeout, as_coder=True)

    async def destroy(self, sandbox_id: str, force: bool = False):
        """Destroy a sandbox (cleans up task branch)."""
        sandbox = self.sandboxes.pop(sandbox_id, None)
        if sandbox and sandbox.branch.startswith("task/"):
            # Clean up the branch
            task_id = sandbox.branch.replace("task/", "")
            branch = self._persistent.active_branches.get(task_id)
            if branch:
                await self._persistent.cleanup_branch(branch)

    def get_workspace_path(self, sandbox_id: str) -> Optional[Path]:
        """Get workspace path for a sandbox."""
        return self._persistent.get_repo_path()

    async def read_file(self, sandbox_id: str, file_path: str) -> str:
        """Read a file from the sandbox workspace."""
        sandbox = self.sandboxes.get(sandbox_id)
        if not sandbox:
            raise FileNotFoundError(f"Sandbox {sandbox_id} not found")

        # Ensure we're on the right branch
        if sandbox.branch != "main":
            await self._persistent.execute(
                f"cd /workspace/pollinations && git checkout {sandbox.branch} 2>/dev/null || true",
                as_coder=True
            )

        # Read the file
        result = await self._persistent.execute(
            f"cat /workspace/pollinations/{file_path}",
            as_coder=True
        )

        if result.exit_code != 0:
            raise FileNotFoundError(f"File not found: {file_path}")

        return result.stdout

    async def write_file(self, sandbox_id: str, file_path: str, content: str):
        """Write a file to the sandbox workspace."""
        sandbox = self.sandboxes.get(sandbox_id)
        if not sandbox:
            raise FileNotFoundError(f"Sandbox {sandbox_id} not found")

        # Ensure we're on the right branch
        if sandbox.branch != "main":
            await self._persistent.execute(
                f"cd /workspace/pollinations && git checkout {sandbox.branch} 2>/dev/null || true",
                as_coder=True
            )

        # Write to a temp file first, then move (handles special chars)
        import base64
        encoded = base64.b64encode(content.encode()).decode()
        result = await self._persistent.execute(
            f"echo '{encoded}' | base64 -d > /workspace/pollinations/{file_path}",
            as_coder=True
        )

        if result.exit_code != 0:
            raise IOError(f"Failed to write file: {result.stderr}")


# =============================================================================
# GLOBAL INSTANCES
# =============================================================================

# The single persistent sandbox
_persistent_sandbox: Optional[PersistentSandbox] = None

def get_persistent_sandbox() -> PersistentSandbox:
    """Get or create the global persistent sandbox instance."""
    global _persistent_sandbox
    if _persistent_sandbox is None:
        _persistent_sandbox = PersistentSandbox()
    return _persistent_sandbox


# Legacy sandbox manager (wraps persistent sandbox)
_sandbox_manager: Optional[SandboxManager] = None

def get_sandbox_manager() -> SandboxManager:
    """Get or create the global sandbox manager instance."""
    global _sandbox_manager
    if _sandbox_manager is None:
        _sandbox_manager = SandboxManager()
    return _sandbox_manager


# Lazy proxy for backward compatibility
class _LazySandboxManager:
    """Lazy proxy for sandbox_manager."""
    def __getattr__(self, name):
        return getattr(get_sandbox_manager(), name)

sandbox_manager = _LazySandboxManager()
