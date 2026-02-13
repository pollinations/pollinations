"""
GitHub Code tool handler for Discord bot integration.

Architecture:
- Bot AI handles user intent and conversation
- Polly handles ALL code operations (read, edit, test, git, commits)
- Single Discord embed updates in real-time (no message spam)
- Terminal-per-thread for concurrent tasks
- Sandbox stays alive for follow-up commands

Available actions:
- task: Run coding task (THE ONLY way to edit code!)
- status: Check running task status
- list_tasks: List all tasks
- ask_user: Set pending confirmation for user input
- add_note/get_notes: Bot AI notes to self
- push: Push branch from sandbox to GitHub
- open_pr: Open a pull request
- run_in_sandbox: Run command in sandbox
- read_sandbox_file/write_sandbox_file: File ops in sandbox
- destroy_sandbox: Cleanup sandbox
- update_embed: Update Discord embed status

IMPORTANT: There are NO direct GitHub API file operations!
All code changes MUST go through action='task'.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import shlex
import uuid
from pathlib import Path
from typing import Optional, Any
from datetime import datetime

import discord

from ..sandbox import sandbox_manager, Sandbox, SANDBOX_DIR, get_persistent_sandbox
from ..claude_code_agent import (
    get_claude_code_agent,
    ClaudeCodeResult,
    parse_todos_from_output,
    TodoItem,
)
from ..embed_builder import ProgressEmbedManager, StepStatus

logger = logging.getLogger(__name__)

# Task persistence file
TASKS_FILE = SANDBOX_DIR / "tasks.json"

# Store running tasks for status checks (loaded from disk on import)
_running_tasks: dict[str, dict] = {}

# NOTE: thread_to_task mapping removed - thread_id IS the task_id now
# No mapping needed: thread_id = task_id = branch name = ccr session ID


def _save_tasks():
    """Save tasks to disk for persistence across restarts."""
    try:
        # Only save serializable fields (no embed_manager, etc.)
        serializable = {}
        for task_id, task_data in _running_tasks.items():
            serializable[task_id] = {
                "task_id": task_id,
                "task": task_data.get("task", ""),
                "repo": task_data.get("repo", "pollinations/pollinations"),
                "branch": task_data.get("branch", "main"),
                "branch_name": task_data.get("branch_name"),
                "phase": task_data.get("phase", "unknown"),
                "started_at": (
                    started_at.isoformat()
                    if isinstance((started_at := task_data.get("started_at")), datetime)
                    else started_at
                ),
                "files_changed": task_data.get("files_changed", []),
                "user": task_data.get("user"),
                "channel_id": task_data.get("channel_id"),
                "thread_id": task_data.get("thread_id"),
            }

        # Simplified: just save tasks, no mapping needed
        # thread_id IS the task_id now
        save_data = {"tasks": serializable}

        TASKS_FILE.parent.mkdir(parents=True, exist_ok=True)
        TASKS_FILE.write_text(json.dumps(save_data, indent=2))
        logger.debug(f"Saved {len(serializable)} tasks to {TASKS_FILE}")
    except Exception as e:
        logger.warning(f"Failed to save tasks: {e}")


def _load_tasks():
    """Load tasks from disk on startup."""
    global _running_tasks
    try:
        if TASKS_FILE.exists():
            raw_data = json.loads(TASKS_FILE.read_text())

            # Handle both old format (flat tasks) and new format (tasks wrapper)
            if "tasks" in raw_data:
                data = raw_data["tasks"]
            else:
                # Old format - just tasks
                data = raw_data

            for task_id, task_data in data.items():
                # Convert ISO string back to datetime
                if task_data.get("started_at"):
                    try:
                        task_data["started_at"] = datetime.fromisoformat(
                            task_data["started_at"]
                        )
                    except:
                        task_data["started_at"] = datetime.utcnow()
                _running_tasks[task_id] = task_data

            logger.info(f"Loaded {len(_running_tasks)} tasks")
    except Exception as e:
        logger.warning(f"Failed to load tasks: {e}")


# Load tasks on module import
_load_tasks()


def _build_interaction_summary(
    task: str,
    output: str | None,
    files_changed: list[str],
    success: bool,
    todos: Optional[list] = None,
) -> dict:
    """
    Build a STRUCTURED summary of an interaction for bot AI context.

    Instead of raw truncated output, we extract meaningful information:
    - Task prompt (what was asked)
    - Files changed with change type (created, modified, deleted)
    - Key actions taken (extracted from output patterns)
    - Completion status
    - Any errors or warnings

    This gives bot AI much better context than raw output snippets.
    """
    summary = {
        "prompt": task,
        "success": success,
        "files_changed": files_changed,
        "timestamp": datetime.utcnow().isoformat(),
    }

    if not output:
        summary["summary"] = "No output captured"
        return summary

    # Extract key information from ccr output
    actions = []
    errors = []
    warnings = []

    output_lower = output.lower()

    # Detect what ccr did based on output patterns
    if "created file" in output_lower or "wrote" in output_lower:
        actions.append("Created new file(s)")
    if (
        "edited" in output_lower
        or "modified" in output_lower
        or "updated" in output_lower
    ):
        actions.append("Modified existing file(s)")
    if "deleted" in output_lower or "removed" in output_lower:
        actions.append("Deleted file(s)")
    if "commit" in output_lower:
        actions.append("Committed changes")
    if "test" in output_lower and ("pass" in output_lower or "success" in output_lower):
        actions.append("Tests passed")
    if "test" in output_lower and ("fail" in output_lower or "error" in output_lower):
        actions.append("Tests failed")
    if "installed" in output_lower or "npm install" in output_lower:
        actions.append("Installed dependencies")
    if "refactor" in output_lower:
        actions.append("Refactored code")

    # Extract errors and warnings
    for line in output.split("\n"):
        line_lower = line.lower().strip()
        if line_lower.startswith("error:") or "error:" in line_lower:
            errors.append(line.strip()[:200])
        elif line_lower.startswith("warning:") or "warn:" in line_lower:
            warnings.append(line.strip()[:200])

    # Extract any "summary" or conclusion from ccr (often at the end)
    # Look for patterns like "Done!", "Complete", "Summary:", etc.
    conclusion = None
    lines = output.strip().split("\n")
    for line in reversed(lines[-20:]):  # Check last 20 lines
        line_stripped = line.strip()
        if len(line_stripped) > 10 and len(line_stripped) < 500:
            # Skip tool output markers
            if not line_stripped.startswith("[") and not line_stripped.startswith("{"):
                if any(
                    word in line_stripped.lower()
                    for word in [
                        "done",
                        "complete",
                        "finish",
                        "success",
                        "created",
                        "updated",
                        "implement",
                    ]
                ):
                    conclusion = line_stripped
                    break

    # Build summary
    summary_parts = []
    if actions:
        summary_parts.append(f"Actions: {', '.join(actions[:5])}")
    if files_changed:
        summary_parts.append(
            f"Files ({len(files_changed)}): {', '.join(files_changed[:5])}"
        )
        if len(files_changed) > 5:
            summary_parts.append(f"  (+{len(files_changed) - 5} more)")
    if conclusion:
        summary_parts.append(f"Result: {conclusion}")
    if errors:
        summary_parts.append(f"Errors: {errors[0]}")
    if warnings and len(warnings) <= 3:
        summary_parts.append(f"Warnings: {len(warnings)}")

    summary["summary"] = "\n".join(summary_parts) if summary_parts else "Task processed"
    summary["actions"] = actions
    if errors:
        summary["errors"] = errors[:3]  # Keep first 3 errors
    if warnings:
        summary["warning_count"] = len(warnings)

    # Full output for bot AI context
    summary["output_preview"] = output

    # Include todos if available
    if todos:
        summary["todos"] = [{"content": t.content, "status": t.status} for t in todos]

    return summary


# NOTE: get_task_for_thread and set_task_for_thread removed
# With thread_id as universal key, no mapping is needed:
# - thread_id IS the task_id
# - Just use str(thread_id) to look up in _running_tasks


async def tool_polly_agent(
    action: str,
    task: Optional[str] = None,
    repo: str = "pollinations/pollinations",
    branch: str = "main",
    task_id: Optional[str] = None,
    # PR parameters
    pr_title: Optional[str] = None,
    pr_body: Optional[str] = None,
    base_branch: Optional[str] = None,  # For PRs (default: main)
    # Sandbox file operations (for read_sandbox_file, write_sandbox_file)
    file_path: Optional[str] = None,
    file_content: Optional[str] = None,
    # Discord context (injected by bot.py via _context)
    discord_channel: Optional[discord.TextChannel] = None,
    discord_thread_id: Optional[int] = None,  # Thread ID for automatic task_id lookup
    discord_user_name: Optional[str] = None,
    # Context dict injected by pollinations client (contains admin status, user info)
    _context: Optional[dict] = None,
    # Legacy admin flag - prefer using _context
    _is_admin: bool = False,
    **kwargs,
) -> dict:
    """
    GitHub Code tool handler - ALL code changes via Polly.

    Architecture:
        YOU drive the workflow - Polly executes coding tasks.
        After 'task' action completes, YOU decide what to do next.
        Use your judgment to:
        - Ask users questions when their input adds value
        - Run tests/builds via sandbox if relevant
        - Create PRs when changes are ready (action='open_pr')
        - Send follow-up prompts for more work (action='task')

    Actions:
        task: Run coding task (THE ONLY WAY TO EDIT CODE!)
        status: Check running task status
        list_tasks: List all tasks
        ask_user: Set pending user confirmation
        add_note/get_notes: Bot AI notes to self
        run_in_sandbox: Execute command in sandbox (tests, builds, etc)
        read_sandbox_file: Read file from sandbox
        write_sandbox_file: Write file to sandbox
        destroy_sandbox: Destroy sandbox when done
        update_embed: Update Discord embed status
        push: Push branch from sandbox to GitHub
        open_pr: Create PR (after pushing)

    IMPORTANT: NO direct GitHub file operations!
    To edit files, read files, or make any code changes:
    Use action='task' with task='read file X' or task='edit file X to do Y'

    Args:
        action: Action to perform
        task: Task description (for task action - required!)
        repo: Repository (owner/repo)
        branch: Working branch
        pr_title: PR title (for open_pr)
        pr_body: PR description (for open_pr)
        base_branch: Base branch for PR (default: main)
        _context: Context dict with is_admin, user_id, etc.

    Returns:
        Result dict with status, details, and _ai_hint for follow-up guidance
    """
    # SECURITY: Admin check - code agent can modify repos
    # Check _context first (new approach), fall back to legacy _is_admin
    is_admin = False
    context_user_id = None
    context_user_name = None
    if _context:
        is_admin = _context.get("is_admin", False)
        context_user_id = _context.get("user_id")
        context_user_name = _context.get("user_name")
        # Also extract Discord context from _context if not passed directly
        if not discord_channel:
            discord_channel = _context.get("discord_channel")
        if not discord_thread_id:
            discord_thread_id = _context.get("discord_thread_id")
        if not discord_user_name:
            discord_user_name = _context.get("user_name")
    else:
        # Legacy: use _is_admin flag
        is_admin = _is_admin

    if not is_admin:
        # SECURITY: Log blocked polly_agent access attempt
        logger.warning(
            f"SECURITY: Blocked polly_agent access for non-admin user {context_user_name or discord_user_name} (id={context_user_id})"
        )
        return {
            "error": "Code agent requires admin permissions. This tool can modify repository code, create branches, and open PRs - ask a team member with admin access!"
        }
    else:
        logger.info(
            f"Polly agent access authorized for {context_user_name or discord_user_name} (id={context_user_id})"
        )

    # SIMPLIFIED: thread_id IS the task_id now - no lookup needed!
    # If we have a thread_id, that's our task_id
    if discord_thread_id and not task_id:
        task_id = str(discord_thread_id)
        logger.info(f"Using thread_id as task_id: {task_id}")

    try:
        # Status check (no sandbox needed)
        if action == "status":
            return await _handle_status(task_id)

        # List all tasks (useful after restart to see available tasks)
        if action == "list_tasks":
            return _handle_list_tasks()

        # Set pending confirmation - bot AI asks user for input
        if action == "ask_user":
            return _handle_ask_user(task_id, kwargs.get("question"))

        # Bot AI notes to self - persist context between calls
        if action == "add_note":
            return _handle_add_note(task_id, kwargs.get("note"), kwargs.get("category"))

        if action == "get_notes":
            return _handle_get_notes(task_id, kwargs.get("category"))

        # task action uses ccr - THE ONLY WAY TO EDIT CODE
        if action == "task":
            if not task:
                return {"error": "task parameter is required for 'task' action"}
            return await _handle_code_task(
                task=task,
                repo=repo,
                branch=branch,
                channel=discord_channel,
                user_name=discord_user_name or "Unknown",
                existing_task_id=task_id,  # Reuse existing branch if task_id provided
                thread_id=discord_thread_id,  # For thread→task mapping
                discord_user_id=kwargs.get(
                    "discord_user_id", 0
                ),  # For terminal ownership
            )

        # Sandbox operations - work with existing sandbox
        if action == "run_in_sandbox":
            return await _handle_run_in_sandbox(
                kwargs.get("sandbox_id"), kwargs.get("command")
            )

        if action == "read_sandbox_file":
            return await _handle_read_sandbox_file(kwargs.get("sandbox_id"), file_path)

        if action == "write_sandbox_file":
            return await _handle_write_sandbox_file(
                kwargs.get("sandbox_id"), file_path, file_content
            )

        if action == "destroy_sandbox":
            return await _handle_destroy_sandbox(
                kwargs.get("sandbox_id"), kwargs.get("task_id"), discord_user_name
            )

        if action == "update_embed":
            return await _handle_update_embed(
                kwargs.get("task_id"), kwargs.get("status"), kwargs.get("finish", False)
            )

        # Push from sandbox (uses sandbox.push_branch with GitHub App auth)
        if action == "push":
            return await _handle_push(
                repo,
                branch,
                task_id,
                discord_channel=discord_channel,
                discord_user_id=kwargs.get("discord_user_id", 0),
            )

        # Open PR (uses GitHub API - this is fine, not editing code)
        if action == "open_pr":
            return await _handle_open_pr(
                repo, branch, base_branch, pr_title, pr_body, task_id
            )

        return {
            "error": f"Unknown action: {action}. Available: task, status, list_tasks, ask_user, add_note, get_notes, update_embed, run_in_sandbox, read_sandbox_file, write_sandbox_file, destroy_sandbox, push, open_pr. NOTE: To edit code, use action='task' with a task description!"
        }

    except Exception as e:
        logger.exception("Error in polly_agent tool")
        return {"error": str(e)}


async def _handle_status(task_id: Optional[str]) -> dict:
    """Handle status check for a running task."""
    if not task_id:
        # Return all running tasks
        if not _running_tasks:
            return {"message": "No tasks currently running."}

        tasks_info = []
        for tid, info in _running_tasks.items():
            tasks_info.append(f"- **{tid}**: {info['task'][:50]}... ({info['phase']})")

        return {"message": f"**Running Tasks:**\n" + "\n".join(tasks_info)}

    # Check specific task
    task_info = _running_tasks.get(task_id)
    if not task_info:
        return {"error": f"Task {task_id} not found"}

    elapsed = (datetime.utcnow() - task_info["started_at"]).total_seconds()

    return {
        "task_id": task_id,
        "task": task_info["task"],
        "phase": task_info["phase"],
        "elapsed_seconds": elapsed,
        "messages": task_info.get("messages", [])[-5:],  # Last 5 messages
    }


def _handle_list_tasks() -> dict:
    """
    List all persisted tasks.

    Useful after bot restart to see what tasks exist and can be resumed.
    Bot AI can use task_id from this list for push/open_pr operations.
    """
    if not _running_tasks:
        return {
            "message": "No tasks found. Start a new task with action='task'.",
            "tasks": [],
        }

    tasks_list = []
    message_lines = ["**Available Tasks:**"]

    for task_id, info in _running_tasks.items():
        task_summary = {
            "task_id": task_id,
            "task": info.get("task", "")[:100],
            "branch_name": info.get("branch_name"),
            "phase": info.get("phase", "unknown"),
            "files_changed": info.get("files_changed", []),
            "user": info.get("user"),
            "repo": info.get("repo", "pollinations/pollinations"),
        }
        tasks_list.append(task_summary)

        # Format for display
        branch = info.get("branch_name", "unknown")
        phase = info.get("phase", "unknown")
        files = len(info.get("files_changed", []))
        message_lines.append(
            f"- **{task_id}** ({phase}): {info.get('task', '')[:50]}...\n"
            f"  Branch: `{branch}` | Files changed: {files}"
        )

    return {
        "message": "\n".join(message_lines),
        "tasks": tasks_list,
        "_ai_hint": (
            "Task IDs are now Discord thread IDs - the universal key.\n"
            "When user is in a thread, thread_id is auto-injected so you don't need task_id.\n\n"
            "For PR/push from a thread (most common case):\n"
            "- polly_agent(action='open_pr', pr_title='...', pr_body='...',\n"
            "             branch_type='feat|fix|docs', branch_description='short-description')\n\n"
            "IMPORTANT: When pushing or creating PRs, use branch_type and branch_description\n"
            "to give branches proper names like feat/xyz, fix/abc instead of thread/12345."
        ),
    }


def _handle_ask_user(task_id: Optional[str], question: Optional[str]) -> dict:
    """
    Set pending confirmation state for a task.

    Bot AI uses this when ccr needs user input or confirmation.
    The question is stored in task state and shown to user.
    Only the original task owner can respond.
    """
    if not task_id:
        return {"error": "task_id required for ask_user"}

    if not question:
        return {"error": "question required for ask_user"}

    if task_id not in _running_tasks:
        return {"error": f"Task {task_id} not found"}

    task = _running_tasks[task_id]
    task["pending_confirmation"] = question
    task["phase"] = "waiting_user"
    _save_tasks()

    return {
        "success": True,
        "message": f"⏳ Waiting for user response to: {question}",
        "task_owner": task.get("user"),
        "task_owner_id": task.get("user_id"),
        "_ai_hint": (
            "Question has been set. Now send a Discord message with the question.\n"
            "Wait for the task owner to respond before proceeding.\n"
            "When they respond, their message will be in thread history."
        ),
    }


def _handle_add_note(
    task_id: Optional[str], note: Optional[str], category: Optional[str] = None
) -> dict:
    """
    Add a "note to self" for bot AI that persists between calls.

    Notes help bot AI maintain context across multiple interactions:
    - Decisions made and why
    - User preferences discovered
    - Important context about the task
    - Things to remember for follow-up

    Categories help organize notes:
    - "decision": A decision made (e.g., "chose REST over GraphQL because...")
    - "context": Important background info
    - "preference": User preference discovered
    - "todo": Something to do later
    - "warning": Something to watch out for
    """
    if not task_id:
        return {"error": "task_id required for add_note"}

    if not note:
        return {"error": "note content required"}

    if task_id not in _running_tasks:
        return {"error": f"Task {task_id} not found"}

    task = _running_tasks[task_id]

    # Initialize bot_notes if not exists (for old tasks)
    if "bot_notes" not in task:
        task["bot_notes"] = []

    # Add the note
    note_entry = {
        "content": note,
        "category": category or "context",
        "timestamp": datetime.utcnow().isoformat(),
    }
    task["bot_notes"].append(note_entry)

    # Keep last 20 notes to prevent unbounded growth
    task["bot_notes"] = task["bot_notes"][-20:]

    _save_tasks()

    return {
        "success": True,
        "message": f"📝 Note added ({category or 'context'}): {note[:100]}...",
        "total_notes": len(task["bot_notes"]),
    }


def _handle_get_notes(task_id: Optional[str], category: Optional[str] = None) -> dict:
    """
    Get bot AI notes for a task, optionally filtered by category.
    """
    if not task_id:
        return {"error": "task_id required for get_notes"}

    if task_id not in _running_tasks:
        return {"error": f"Task {task_id} not found"}

    task = _running_tasks[task_id]
    notes = task.get("bot_notes", [])

    # Filter by category if specified
    if category:
        notes = [n for n in notes if n.get("category") == category]

    if not notes:
        return {
            "notes": [],
            "message": f"No notes found"
            + (f" for category '{category}'" if category else ""),
        }

    return {
        "notes": notes,
        "total": len(notes),
        "message": f"Found {len(notes)} note(s)",
    }


def clear_pending_confirmation(task_id: str) -> bool:
    """
    Clear pending confirmation state after user responds.
    Called by bot.py when processing user message in a thread with pending confirmation.
    Returns True if there was a pending confirmation that was cleared.
    """
    if task_id not in _running_tasks:
        return False

    task = _running_tasks[task_id]
    if task.get("pending_confirmation"):
        task["pending_confirmation"] = None
        task["phase"] = "complete"  # Reset to complete
        _save_tasks()
        return True
    return False


def get_task_owner_id(task_id: str) -> Optional[int]:
    """Get the Discord user ID of the task owner for validation."""
    if task_id not in _running_tasks:
        return None
    return _running_tasks[task_id].get("user_id")


async def _handle_run_in_sandbox(
    sandbox_id: Optional[str], command: Optional[str]
) -> dict:
    """Run a command in an existing sandbox."""
    if not sandbox_id:
        return {"error": "sandbox_id is required"}
    if not command:
        return {"error": "command is required"}

    from ..sandbox import sandbox_manager

    sandbox = sandbox_manager.sandboxes.get(sandbox_id)
    if not sandbox:
        return {
            "error": f"Sandbox {sandbox_id} not found. It may have been destroyed or expired."
        }

    result = await sandbox_manager.execute(sandbox_id, command, timeout=120)

    return {
        "success": result.exit_code == 0,
        "sandbox_id": sandbox_id,
        "command": command,
        "exit_code": result.exit_code,
        "stdout": result.stdout or "",
        "stderr": result.stderr or "",
        "timed_out": result.timed_out,
        "duration": result.duration,
    }


async def _handle_read_sandbox_file(
    sandbox_id: Optional[str], file_path: Optional[str]
) -> dict:
    """Read a file from an existing sandbox."""
    if not sandbox_id:
        return {"error": "sandbox_id is required"}
    if not file_path:
        return {"error": "file_path is required"}

    from ..sandbox import sandbox_manager

    sandbox = sandbox_manager.sandboxes.get(sandbox_id)
    if not sandbox:
        return {
            "error": f"Sandbox {sandbox_id} not found. It may have been destroyed or expired."
        }

    try:
        content = await sandbox_manager.read_file(sandbox_id, file_path)
        return {
            "success": True,
            "sandbox_id": sandbox_id,
            "file_path": file_path,
            "content": content,
        }
    except FileNotFoundError:
        return {"error": f"File not found: {file_path}"}
    except Exception as e:
        return {"error": f"Failed to read file: {e}"}


async def _handle_write_sandbox_file(
    sandbox_id: Optional[str], file_path: Optional[str], content: Optional[str]
) -> dict:
    """Write a file to an existing sandbox."""
    if not sandbox_id:
        return {"error": "sandbox_id is required"}
    if not file_path:
        return {"error": "file_path is required"}
    if content is None:
        return {"error": "file_content is required"}

    from ..sandbox import sandbox_manager

    sandbox = sandbox_manager.sandboxes.get(sandbox_id)
    if not sandbox:
        return {
            "error": f"Sandbox {sandbox_id} not found. It may have been destroyed or expired."
        }

    try:
        await sandbox_manager.write_file(sandbox_id, file_path, content)
        return {
            "success": True,
            "sandbox_id": sandbox_id,
            "file_path": file_path,
            "message": f"File written: {file_path}",
        }
    except Exception as e:
        return {"error": f"Failed to write file: {e}"}


async def _handle_destroy_sandbox(
    sandbox_id: Optional[str], task_id: Optional[str], user_name: Optional[str]
) -> dict:
    """Destroy a sandbox - only the creator can confirm."""
    if not sandbox_id:
        return {"error": "sandbox_id is required"}

    from ..sandbox import sandbox_manager

    sandbox = sandbox_manager.sandboxes.get(sandbox_id)
    if not sandbox:
        return {
            "error": f"Sandbox {sandbox_id} not found. It may have already been destroyed."
        }

    # Check if user is the creator
    if sandbox.initiated_by and user_name:
        if sandbox.initiated_by.lower() != user_name.lower():
            return {
                "error": f"Only {sandbox.initiated_by} can destroy this sandbox.",
                "sandbox_id": sandbox_id,
                "initiated_by": sandbox.initiated_by,
            }

    # Finish the embed if we have a task_id
    if task_id and task_id in _running_tasks:
        embed_manager = _running_tasks[task_id].get("embed_manager")
        if embed_manager:
            embed_manager.set_status("Sandbox destroyed")
            await embed_manager.finish(success=True)

    await sandbox_manager.destroy(sandbox_id, force=True)

    return {
        "success": True,
        "sandbox_id": sandbox_id,
        "message": f"Sandbox {sandbox_id} has been destroyed.",
    }


async def _handle_update_embed(
    task_id: Optional[str], status: Optional[str], finish: bool = False
) -> dict:
    """Update the Discord embed for a task. Bot AI can call this to show progress."""
    if not task_id:
        return {"error": "task_id is required"}

    if task_id not in _running_tasks:
        return {"error": f"Task {task_id} not found"}

    embed_manager = _running_tasks[task_id].get("embed_manager")
    if not embed_manager:
        return {"error": f"No embed manager for task {task_id}"}

    if status:
        embed_manager.set_status(status)

    if finish:
        await embed_manager.finish(success=True)
    else:
        await embed_manager.update()

    return {
        "success": True,
        "task_id": task_id,
        "status": status,
        "finished": finish,
    }


async def _handle_code_task(
    task: str,
    repo: str,
    branch: str,
    channel: Optional[discord.TextChannel] = None,
    user_name: Optional[str] = None,
    existing_task_id: Optional[str] = None,  # Legacy - kept for compatibility
    thread_id: Optional[int] = None,  # Discord thread ID - THE universal key
    discord_user_id: int = 0,  # Discord user ID for terminal ownership
) -> dict:
    """
    Handle coding task via ccr.

    This architecture:
    - Uses ClaudeCodeAgent which manages the persistent sandbox
    - ClaudeCodeAgent creates task branch internally (or reuses existing)
    - Runs the task prompt via ccr
    - Returns results with sandbox still running for follow-ups

    The bot AI handles:
    - Building task context
    - Summarizing output for Discord
    - Managing user interactions (pause, resume, etc.)

    Thread ID as Universal Key:
    - thread_id = task_id = branch name = ccr session ID
    - No mapping needed - if you have thread_id, you have everything
    - Subsequent calls with same thread_id automatically continue on same branch
    """
    if not task:
        return {"error": "Task description is required"}

    # SIMPLIFIED: Use thread_id as the universal key
    # thread_id = task_id = branch = ccr session
    if thread_id:
        task_id = str(thread_id)
    elif existing_task_id:
        task_id = existing_task_id
    else:
        # Fallback for non-Discord usage
        task_id = str(uuid.uuid4())[:8]

    # Check if task already exists (continuing work in same thread)
    is_continuation = task_id in _running_tasks

    # Track the task (update if existing, create if new)
    if not is_continuation:
        _running_tasks[task_id] = {
            "task": task,
            "repo": repo,
            "branch": branch,
            "phase": "coding",
            "started_at": datetime.utcnow(),
            "messages": [],
            "user": user_name,
            "user_id": discord_user_id,  # Track who initiated for confirmation flow
            "thread_id": thread_id,
            "pending_confirmation": None,  # For dynamic confirmation flow
            "bot_notes": [],  # Bot AI "notes to self" that persist between calls
        }
        logger.info(f"New task {task_id} (thread_id={thread_id})")
    else:
        # Update existing task with new task description
        _running_tasks[task_id]["task"] = task
        _running_tasks[task_id]["phase"] = "coding"
        _running_tasks[task_id]["messages"].append(f"Continuing with: {task[:50]}...")
        logger.info(f"Continuing task {task_id} (thread_id={thread_id})")

    # Create progress embed if Discord channel available
    # Shows live status: todos, files, branch, sub-actions
    # For continuations, reuse existing embed to avoid duplicate messages
    embed_manager: Optional[ProgressEmbedManager] = None
    dynamic_todo_indices: dict[str, int] = {}  # Track todo content -> step index

    if is_continuation and task_id in _running_tasks:
        # Reuse existing embed for continuation tasks
        embed_manager = _running_tasks[task_id].get("embed_manager")
        if embed_manager:
            # Reset the embed for new work
            embed_manager.reset_steps()
            embed_manager.add_step("Setting up environment")
            embed_manager.add_step("Creating terminal")
            embed_manager.add_step("Setting up branch")
            embed_manager.add_step("Working on task")
            embed_manager.add_step("Processing results")
            embed_manager.start_step(0)
            asyncio.create_task(embed_manager.update())
            logger.info(f"Reusing embed for continuation task {task_id}")

    if not embed_manager and channel:
        embed_manager = ProgressEmbedManager(channel)
        try:
            await embed_manager.start(current_action="Setting up environment")
            # Add standard workflow todos
            embed_manager.add_step("Setting up environment")
            embed_manager.add_step("Creating terminal")
            embed_manager.add_step("Setting up branch")
            embed_manager.add_step("Working on task")
            embed_manager.add_step("Processing results")
            # Start first step
            embed_manager.start_step(0)
            # Fire-and-forget update - don't wait for Discord API
            asyncio.create_task(embed_manager.update())
        except Exception as e:
            logger.warning(f"Failed to create progress embed: {e}")
            embed_manager = None

    try:
        _running_tasks[task_id]["messages"].append(f"Task {task_id} starting")

        if embed_manager:
            embed_manager.complete_step(0)  # Complete "Setting up environment"

        # Get the persistent sandbox
        sandbox = get_persistent_sandbox()

        # Ensure sandbox is running
        if not await sandbox.ensure_running():
            return {"error": "Failed to start sandbox container"}

        # Get/create terminal for this thread FIRST
        if embed_manager:
            embed_manager.start_step(1)  # "Creating terminal"
            embed_manager.set_action("Creating terminal")
            asyncio.create_task(embed_manager.update())  # Fire-and-forget

        discord_channel_id = channel.id if channel else 0
        terminal = await sandbox.terminal_manager.get_terminal(
            task_id,
            user_id=discord_user_id,
            channel_id=discord_channel_id,
        )
        logger.info(f"Terminal ready for task {task_id}")

        # Create/checkout task branch
        if embed_manager:
            embed_manager.complete_step(1)  # Complete "Creating terminal"
            embed_manager.start_step(2)  # "Setting up branch"
            embed_manager.set_action("Setting up branch")
            asyncio.create_task(embed_manager.update())  # Fire-and-forget

        # Generate proper branch name from task description
        # NEVER use thread/* for commits - always use proper names like feat/*, fix/*, etc.
        branch_name = _generate_branch_name_from_task(task, task_id)

        # Check if this task already has a branch name saved (continuation)
        if is_continuation and _running_tasks[task_id].get("branch_name"):
            branch_name = _running_tasks[task_id]["branch_name"]
            logger.info(f"Reusing existing branch name: {branch_name}")

        # Fetch latest and create branch from origin/main
        await terminal.send_command("git fetch origin", timeout=60)

        # Check if branch exists (by saved name or new name)
        branch_check = await terminal.send_command(
            f"git branch --list '{branch_name}'", timeout=10
        )
        if branch_name in branch_check:
            # Branch exists, checkout
            await terminal.send_command(f"git checkout '{branch_name}'", timeout=30)
            logger.info(f"Checked out existing branch {branch_name}")
        else:
            # Create new branch from origin/main with proper name
            await terminal.send_command(
                f"git checkout -b '{branch_name}' origin/main", timeout=30
            )
            logger.info(f"Created new branch {branch_name}")

        # Save branch name for future calls
        _running_tasks[task_id]["branch_name"] = branch_name

        # Update embed with branch info
        if embed_manager:
            embed_manager.complete_step(2)  # Complete "Setting up branch"
            embed_manager.set_branch(branch_name, "main")
            embed_manager.start_step(3)  # "Working on task"
            embed_manager.set_action("Working on task")
            embed_manager.set_sub_action(task[:60] + "..." if len(task) > 60 else task)
            asyncio.create_task(embed_manager.update())

        # Build prompt for ccr
        # ccr ALWAYS commits locally - this is just saving work in progress
        # Push to GitHub and PR creation are separate actions handled by the bot AI
        full_prompt = (
            f"IMPORTANT: You are working on branch '{branch_name}'. "
            "Commit your changes to THIS branch (this is just local - not pushed yet). "
            "Do NOT include any Claude, AI, or bot attribution in commit messages. "
            "Just describe what was changed.\n\n"
            f"{task}"
        )

        # Run ccr with -p flag
        # Use --session-id for NEW sessions, --resume for continuations
        # This ensures each Discord thread has its own isolated ccr conversation context

        # Generate a deterministic UUID from thread_id for ccr session isolation
        session_uuid = str(
            uuid.UUID(hashlib.md5(f"polly-{task_id}".encode()).hexdigest())
        )

        if is_continuation:
            # Resume existing session - maintains ccr conversation context!
            ccr_flags = f"--dangerously-skip-permissions --resume {session_uuid}"
            logger.info(f"Resuming ccr session {session_uuid} for task {task_id}")
        else:
            # Create new session with deterministic ID
            ccr_flags = f"--dangerously-skip-permissions --session-id {session_uuid}"
            logger.info(f"Creating ccr session {session_uuid} for task {task_id}")

        # Build command: ccr code -p "prompt" [flags]
        # -p must come immediately before the prompt, other flags after
        ccr_cmd = f"ccr code -p {shlex.quote(full_prompt)} {ccr_flags}"

        logger.info(f"Running ccr: {task[:100]}...")
        start_time = asyncio.get_running_loop().time()

        output = await terminal.send_command(
            ccr_cmd, timeout=None
        )  # No timeout for ccr

        duration = asyncio.get_running_loop().time() - start_time
        logger.info(f"ccr completed in {duration:.1f}s, output {len(output)} bytes")

        # Log short outputs for debugging (ccr shouldn't complete in <5s normally)
        if duration < 5 and len(output) < 200:
            logger.warning(
                f"ccr finished very quickly - possible error. Output: {output[:500]}"
            )

        # Update embed - ccr done, now processing
        if embed_manager:
            embed_manager.complete_step(3)  # Complete "Running ccr"
            embed_manager.start_step(4)  # "Processing results"
            embed_manager.set_action("Processing results")
            embed_manager.set_sub_action("Analyzing changes...")
            asyncio.create_task(embed_manager.update())

        # PARALLEL: Parse todos and get git diff simultaneously
        # These are independent operations - run them concurrently for speed
        async def get_files_changed():
            try:
                # Check if terminal is still alive before trying to use it
                if terminal.process.returncode is not None:
                    logger.warning(f"Terminal died after ccr, skipping git diff")
                    return []
                diff_result = await terminal.send_command(
                    "git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo ''",
                    timeout=30,
                )
                return [
                    f.strip()
                    for f in diff_result.split("\n")
                    if f.strip() and not f.startswith("fatal")
                ]
            except (ConnectionResetError, BrokenPipeError) as e:
                logger.warning(f"Terminal connection lost during git diff: {e}")
                return []

        # Run CPU-bound todo parsing and IO-bound git diff in parallel
        todos_task = asyncio.get_running_loop().run_in_executor(
            None, parse_todos_from_output, output
        )
        diff_task = get_files_changed()

        todos, files_changed = await asyncio.gather(todos_task, diff_task)

        # Update embed with files changed
        if embed_manager:
            embed_manager.set_files(files_changed)
            asyncio.create_task(embed_manager.update())

        # Build result object (compatible with ClaudeCodeResult)
        class SimpleResult:
            def __init__(self):
                self.success = True
                self.output = output
                self.branch_name = branch_name
                self.files_changed = files_changed
                self.todos = todos
                self.duration_seconds = int(duration)
                self.error = None

        result = SimpleResult()

        # Final embed update
        if embed_manager:
            embed_manager.complete_step(4)  # Complete "Processing results"

            # Final status message
            if result.success:
                files_msg = (
                    f"{len(result.files_changed)} file(s) changed"
                    if result.files_changed
                    else "No changes"
                )
                embed_manager.set_action(files_msg)
                embed_manager.set_sub_action("")  # Clear sub-action
            else:
                embed_manager.set_action(
                    result.error[:50] if result.error else "Task failed"
                )

            # Mark complete (changes color to green/red)
            embed_manager.mark_complete(result.success)
            await embed_manager.update(force=True)
            # Store embed_manager for later updates (e.g., when PR is created)
            _running_tasks[task_id]["embed_manager"] = embed_manager

        # Update tracking
        _running_tasks[task_id]["phase"] = "complete" if result.success else "failed"
        _running_tasks[task_id]["messages"].append(
            f"Duration: {result.duration_seconds}s"
        )
        _running_tasks[task_id]["branch_name"] = result.branch_name
        _running_tasks[task_id]["files_changed"] = result.files_changed
        _running_tasks[task_id]["user"] = user_name

        # Store interaction history for context in follow-up calls
        # This is the SHORT-TERM MEMORY between bot AI and Polly
        #
        # STRUCTURED SUMMARY: Instead of raw truncated output, we extract
        # key information that helps bot AI understand what happened:
        # - What was the task?
        # - What files were changed and how?
        # - Was it successful?
        # - Key decisions/actions taken (extracted from output)
        #
        # PARALLEL: Build summary in background thread (CPU-bound string processing)
        loop = asyncio.get_running_loop()
        interaction = await loop.run_in_executor(
            None,
            _build_interaction_summary,
            task,
            result.output,
            result.files_changed,
            result.success,
            result.todos,
        )

        # Append to history (keep last 10 interactions for richer context)
        if "history" not in _running_tasks[task_id]:
            _running_tasks[task_id]["history"] = []
        _running_tasks[task_id]["history"].append(interaction)
        _running_tasks[task_id]["history"] = _running_tasks[task_id]["history"][-10:]

        # Save to disk in background - fire-and-forget
        loop.run_in_executor(None, _save_tasks)

        # Include todos in response
        todos_summary = [
            {"content": t.content, "status": t.status} for t in result.todos
        ]

        # Return FULL output - let bot AI read it and decide what to do
        # This enables dynamic conversation: AI can reply, ask user, or mark done
        return {
            "success": result.success,
            "task_id": task_id,
            "task": task,
            "repo": repo,
            "branch": result.branch_name or branch,
            "agent_response": result.output,  # FULL output - AI reads this and decides
            "files_changed": result.files_changed,
            "todos": todos_summary,
            "duration": result.duration_seconds,
            "error": result.error,
            "_ai_hint": (
                "⚠️ CRITICAL: Your Discord response MUST be based ONLY on agent_response above!\n"
                "agent_response contains what I ACTUALLY did - READ IT.\n\n"
                "❌ NEVER say: 'I cannot access', 'I don't have ability', 'Let me help you manually'\n"
                "✅ ALWAYS say: 'I [did X]' based on the actual agent_response content\n\n"
                "DECISION TREE:\n"
                "1. SUCCESS + files_changed → Summarize changes FROM agent_response, ask 'Create a PR?'\n"
                "2. SUCCESS + no files → Report what I found/said FROM agent_response\n"
                "3. NEEDS INFO → Use YOUR tools (code_search, github_issue) to get it, call polly_agent again\n"
                "4. ERROR → Explain the ACTUAL error FROM agent_response\n\n"
                "TASK IS NOT DONE until user confirms.\n\n"
                "🔑 BRANCH NAMING: Branch is auto-generated with proper name (feat/*, fix/*, etc.)\n"
                f"- Current branch: {result.branch_name}\n"
                "- Follow-ups from this thread automatically use the same branch\n"
                "- No need to specify branch_type - it's inferred from task description\n\n"
                "TO CREATE PR (when user confirms):\n"
                "polly_agent(action='open_pr', pr_title='...', pr_body='...')\n"
                "Branch name is already set properly - just provide PR title and body.\n\n"
                "TO CONTINUE WORK (follow-up task) - just call polly_agent again:\n"
                "polly_agent(action='task', task='also add tests')\n"
                "The thread_id is auto-injected, so I continue on the same branch with full context.\n\n"
                "📝 NOTES TO SELF - Save important context for later:\n"
                "polly_agent(action='add_note', note='User prefers TypeScript', category='preference')\n"
                "Categories: decision, warning, todo, preference, context\n"
                "Notes persist across calls and appear in your context automatically!"
            ),
        }

    except Exception as e:
        _running_tasks[task_id]["phase"] = "failed"
        _running_tasks[task_id]["messages"].append(f"Error: {e}")
        _save_tasks()  # Persist error state too
        logger.exception("Task failed")

        if embed_manager:
            embed_manager.set_status(f"Error: {e}")
            await embed_manager.finish(success=False)

        return {
            "success": False,
            "error": str(e),
            "task_id": task_id,
            "task": task,  # Include original task for context
            "repo": repo,
            "branch": branch,
            "_ai_hint": (
                f"⚠️ Task failed with error: {e}\n\n"
                "DO NOT say 'I cannot access' - explain the ACTUAL error above.\n"
                "Options:\n"
                "1. Retry with simpler task description\n"
                "2. Use code_search/github_issue to gather more context, then retry\n"
                "3. Explain the error to user and ask how to proceed\n\n"
                "You have all the context - don't ask user for info you already have."
            ),
        }

    finally:
        asyncio.create_task(_cleanup_task(task_id, delay=300))


# =============================================================================
# Flexible Git Operation Handlers - Use GitHub API directly (no sandbox needed)
# =============================================================================


async def _get_github_token() -> str:
    """Get GitHub token from environment or auth manager."""
    from ...github_auth import github_app_auth
    from ....config import config

    # Try GitHub App first
    if config.use_github_app and github_app_auth:
        try:
            token = await github_app_auth.get_token()
            if token:
                return token
        except Exception:
            pass

    # Fall back to PAT
    return (
        config.github_token or os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or ""
    )


async def _github_api(
    method: str, endpoint: str, data: Optional[dict] = None
) -> tuple[int, dict]:
    """Make GitHub API request using shared session from github_manager."""
    import aiohttp
    from ...github import github_manager

    token = await _get_github_token()
    if not token:
        return 401, {"error": "No GitHub token configured"}

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    url = f"https://api.github.com{endpoint}"

    # Use shared session from github_manager (connection pooling)
    session = await github_manager.get_session()
    async with session.request(
        method, url, headers=headers, json=data, timeout=aiohttp.ClientTimeout(total=30)
    ) as response:
        try:
            result = await response.json()
        except:
            result = {"message": await response.text()}
        return response.status, result


def _generate_branch_name_from_task(task: str, task_id: str) -> str:
    """
    Generate a proper branch name from task description.

    Analyzes the task to determine type (feat/fix/docs/etc) and creates
    a descriptive slug. NEVER returns thread/* or task/* names.

    Examples:
        "fix the login bug" -> "fix/login-bug"
        "add dark mode toggle" -> "feat/add-dark-mode-toggle"
        "update README" -> "docs/update-readme"
    """
    task_lower = task.lower()

    # Determine branch type from task keywords
    if any(
        word in task_lower
        for word in ["fix", "bug", "error", "issue", "broken", "crash", "repair"]
    ):
        branch_type = "fix"
    elif any(
        word in task_lower
        for word in ["doc", "readme", "comment", "documentation", "jsdoc", "docstring"]
    ):
        branch_type = "docs"
    elif any(
        word in task_lower
        for word in ["refactor", "cleanup", "clean up", "reorganize", "restructure"]
    ):
        branch_type = "refactor"
    elif any(
        word in task_lower for word in ["test", "spec", "testing", "unit test", "e2e"]
    ):
        branch_type = "test"
    elif any(
        word in task_lower for word in ["style", "format", "lint", "prettier", "eslint"]
    ):
        branch_type = "style"
    elif any(
        word in task_lower
        for word in ["perf", "performance", "optimize", "speed", "fast"]
    ):
        branch_type = "perf"
    elif any(
        word in task_lower
        for word in ["ci", "workflow", "action", "deploy", "pipeline"]
    ):
        branch_type = "ci"
    elif any(
        word in task_lower
        for word in ["chore", "dependency", "upgrade", "update package", "bump"]
    ):
        branch_type = "chore"
    else:
        branch_type = "feat"  # Default to feature

    # Generate slug from task description
    # Take first 6-8 meaningful words, skip common filler words
    skip_words = {
        "the",
        "a",
        "an",
        "to",
        "in",
        "on",
        "at",
        "for",
        "of",
        "and",
        "or",
        "is",
        "are",
        "it",
        "this",
        "that",
        "please",
        "can",
        "you",
        "i",
        "we",
        "should",
        "could",
        "would",
        "need",
    }

    words = re.sub(r"[^a-z0-9\s]", "", task_lower).split()
    meaningful_words = [w for w in words if w not in skip_words and len(w) > 1][:6]

    if meaningful_words:
        slug = "-".join(meaningful_words)
    else:
        # Fallback to task_id suffix
        slug = f"task-{task_id[-8:]}"

    # Ensure slug isn't too long
    slug = slug[:50].rstrip("-")

    return f"{branch_type}/{slug}"


def _generate_branch_name(
    branch_type: Optional[str],
    branch_description: Optional[str],
    task_id: Optional[str] = None,
) -> Optional[str]:
    """
    Generate a proper branch name from type and description.

    Examples:
        branch_type="feat", branch_description="add dark mode" -> "feat/add-dark-mode"
        branch_type="fix", branch_description="null pointer bug" -> "fix/null-pointer-bug"

    Returns None if branch_type is not provided (keeps original branch name).
    """
    if not branch_type:
        return None

    # Normalize type
    valid_types = [
        "feat",
        "fix",
        "docs",
        "refactor",
        "chore",
        "test",
        "style",
        "perf",
        "ci",
    ]
    branch_type = branch_type.lower().strip()
    if branch_type not in valid_types:
        logger.warning(f"Unknown branch type '{branch_type}', using as-is")

    # Generate description slug
    if branch_description:
        # Convert to slug: lowercase, replace spaces with dashes, remove special chars
        slug = branch_description.lower().strip()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)  # Remove special chars
        slug = re.sub(r"\s+", "-", slug)  # Spaces to dashes
        slug = re.sub(r"-+", "-", slug)  # Multiple dashes to single
        slug = slug.strip("-")[:50]  # Limit length
    else:
        # Use task_id if no description
        slug = task_id or "update"

    return f"{branch_type}/{slug}"


async def _handle_push(
    repo: str,
    branch: str,
    task_id: Optional[str] = None,
    discord_channel=None,
    discord_user_id: int = 0,
) -> dict:
    """
    Push the sandbox branch to GitHub using GitHub App credentials.

    Uses the SAME terminal as the task to maintain ccr session continuity.

    If there are uncommitted changes in the sandbox, they are automatically
    committed before pushing to ensure all work is included.

    Note: Branches are created with proper names (feat/*, fix/*, etc.) from the start.
    This function will reject any thread/* or task/* branches.
    """
    from ..sandbox import get_persistent_sandbox

    sandbox = get_persistent_sandbox()

    # Check if sandbox is running
    if not await sandbox.is_running():
        return {"error": "Sandbox is not running. Cannot push changes."}

    # Get the branch name - either from task tracking or parameter
    actual_branch = branch
    if task_id and task_id in _running_tasks:
        actual_branch = _running_tasks[task_id].get("branch_name", branch)

    # Get the SAME terminal used for the task - maintains ccr session continuity
    terminal = None
    if task_id:
        discord_channel_id = discord_channel.id if discord_channel else 0
        terminal = await sandbox.terminal_manager.get_terminal(
            task_id,
            user_id=discord_user_id,
            channel_id=discord_channel_id,
        )
        logger.info(f"Using existing terminal for task {task_id} for push operation")

    # Ensure we're on the correct branch before checking for changes
    checkout_result = await sandbox.execute(
        f"cd /workspace/pollinations && git checkout {actual_branch}", as_coder=True
    )
    if checkout_result.exit_code != 0:
        logger.warning(
            f"Could not checkout branch {actual_branch}: {checkout_result.stderr}"
        )

    # CRITICAL: Get ALL files changed on this branch vs origin/main BEFORE any operations
    # This shows what will ACTUALLY be pushed, not just uncommitted files
    branch_diff_result = await sandbox.execute(
        f"cd /workspace/pollinations && git diff --name-only origin/main...{actual_branch} 2>/dev/null || echo ''",
        as_coder=True,
    )
    files_on_branch = [
        f.strip() for f in branch_diff_result.stdout.strip().split("\n") if f.strip()
    ]
    logger.info(
        f"Files changed on branch {actual_branch} vs origin/main: {files_on_branch}"
    )

    # Warn if no changes on branch
    if not files_on_branch:
        logger.warning(
            f"No file changes detected on branch {actual_branch} vs origin/main!"
        )

    # Check for uncommitted changes and commit them before push
    # This handles the case where ccr edited files but didn't commit
    status_result = await sandbox.execute(
        "cd /workspace/pollinations && git status --porcelain", as_coder=True
    )
    uncommitted_files = [
        line[3:] for line in status_result.stdout.strip().split("\n") if line.strip()
    ]

    if uncommitted_files:
        logger.info(
            f"Found {len(uncommitted_files)} uncommitted files, committing before push..."
        )

        # Stage all changes
        await sandbox.execute("cd /workspace/pollinations && git add -A", as_coder=True)

        # Get task description for commit message
        task_desc = "Update files"
        if task_id and task_id in _running_tasks:
            task_desc = _running_tasks[task_id].get("task", "Update files")[:50]

        # Commit the changes
        commit_msg = f"{task_desc}"
        commit_result = await sandbox.execute(
            f"cd /workspace/pollinations && git commit -m '{commit_msg}'", as_coder=True
        )

        if commit_result.exit_code != 0:
            logger.warning(f"Commit before push failed: {commit_result.stderr}")
            uncommitted_files = []  # Reset if commit failed
        else:
            logger.info(f"Committed {len(uncommitted_files)} files before push")
    else:
        uncommitted_files = []  # No uncommitted files

    # Branches are now created with proper names from the start (feat/*, fix/*, etc.)
    # No renaming needed - just push the branch as-is
    target_branch = actual_branch

    # Safety check: reject any thread/* or task/* branches that somehow slipped through
    if target_branch.startswith("thread/") or target_branch.startswith("task/"):
        logger.error(f"Attempted to push invalid branch name: {target_branch}")
        return {
            "error": f"Cannot push branch '{target_branch}'. Branch names must follow conventional format (feat/*, fix/*, docs/*, etc.)"
        }

    logger.info(f"Pushing branch {target_branch} to origin using GitHub App...")

    # Use the sandbox's push_branch method which handles App credentials
    push_result = await sandbox.push_branch(target_branch, repo)

    if push_result.exit_code == 0:
        # Build success message
        msg = f"✅ Pushed branch `{target_branch}` to GitHub"
        if uncommitted_files:
            msg += f" (auto-committed {len(uncommitted_files)} file(s))"
        if files_on_branch:
            msg += f"\n📁 Files changed: {', '.join(files_on_branch[:5])}"
            if len(files_on_branch) > 5:
                msg += f" (+{len(files_on_branch) - 5} more)"

        return {
            "success": True,
            "branch": target_branch,
            "original_branch": (
                actual_branch if actual_branch != target_branch else None
            ),
            "files_committed": uncommitted_files if uncommitted_files else None,
            "files_on_branch": files_on_branch,  # ALL files changed vs main
            "message": msg,
        }
    else:
        error_msg = push_result.stderr or push_result.stdout
        # Check for common errors
        if "rejected" in error_msg.lower():
            return {
                "error": f"Push rejected - branch may have diverged. Error: {error_msg[:200]}"
            }
        if (
            "credential" in error_msg.lower()
            or "authentication" in error_msg.lower()
            or "invalid username" in error_msg.lower()
        ):
            return {
                "error": f"GitHub authentication failed. Check GitHub App installation. Error: {error_msg[:200]}"
            }
        return {"error": f"Failed to push: {error_msg[:300]}"}


async def _handle_open_pr(
    repo: str,
    head_branch: str,
    base_branch: Optional[str],
    title: Optional[str],
    body: Optional[str],
    task_id: Optional[str] = None,
) -> dict:
    """
    Create a pull request.

    This first pushes the sandbox branch to GitHub (if not already pushed),
    then creates the PR via GitHub API.

    Note: Branches are created with proper names (feat/*, fix/*, etc.) from the start.
    """
    if not title:
        return {"error": "pr_title parameter is required"}

    base = base_branch or "main"

    # Get actual branch name from task tracking if available
    actual_branch = head_branch
    if task_id and task_id in _running_tasks:
        actual_branch = _running_tasks[task_id].get("branch_name", head_branch)

    # First, push the branch to GitHub
    logger.info(f"Pushing branch {actual_branch} before creating PR...")
    push_result = await _handle_push(repo, actual_branch, task_id)

    if not push_result.get("success"):
        return {
            "error": f"Failed to push branch before PR: {push_result.get('error', 'Unknown error')}"
        }

    # Now create the PR via GitHub API
    pr_data = {
        "title": title,
        "head": actual_branch,
        "base": base,
        "body": body or f"Created by Polli bot.\n\n🤖 Automated PR",
    }

    status, data = await _github_api("POST", f"/repos/{repo}/pulls", pr_data)

    if status == 201:
        # Update embed if we have task tracking
        if task_id and task_id in _running_tasks:
            embed_manager = _running_tasks[task_id].get("embed_manager")
            if embed_manager:
                embed_manager.set_status(f"PR #{data['number']} created!")
                await embed_manager.finish(success=True)

        return {
            "success": True,
            "pr_number": data["number"],
            "pr_url": data["html_url"],
            "branch": actual_branch,
            "message": f"✅ Created PR #{data['number']}: [{title}](<{data['html_url']}>)",
        }
    elif status == 422 and "pull request already exists" in str(data).lower():
        # PR already exists - find it
        list_status, list_data = await _github_api(
            "GET",
            f"/repos/{repo}/pulls?head={repo.split('/')[0]}:{actual_branch}&state=open",
        )
        if list_status == 200 and list_data:
            existing_pr = list_data[0]
            return {
                "success": True,
                "pr_number": existing_pr["number"],
                "pr_url": existing_pr["html_url"],
                "message": f"ℹ️ PR already exists: #{existing_pr['number']}: [{existing_pr['title']}](<{existing_pr['html_url']}>)",
            }
        return {
            "error": f"PR already exists but couldn't find it: {data.get('message', status)}"
        }
    else:
        return {"error": f"Failed to create PR: {data.get('message', status)}"}


async def _cleanup_task(task_id: str, delay: int):
    """Clean up task tracking after delay."""
    await asyncio.sleep(delay)
    _running_tasks.pop(task_id, None)


# Export tool handler
TOOL_HANDLERS = {
    "polly_agent": tool_polly_agent,
}
