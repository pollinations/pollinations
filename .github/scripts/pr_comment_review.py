#!/usr/bin/env python3
"""
PR Code Review Bot
Enhanced with PR-Agent concepts for handling massive PRs without losing context.
Analyzes PR code changes and posts a concise code review as a comment.
"""

import os
import sys
import json
import random
import re
import requests
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

# Configuration
GITHUB_API_BASE = "https://api.github.com"
POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions"
MODEL = "claude-large"

# Token limits for gemini-large (1M context window!)
MAX_INPUT_TOKENS = 900000  # Leave buffer from 1M limit
MAX_OUTPUT_TOKENS = 65000  # Max output tokens
CHARS_PER_TOKEN = 4  # Rough estimate

# AUTO_REVIEW: If True, automatically reviews when PR is opened
AUTO_REVIEW = True

# REVIEW_ON_SYNC: If True, reviews on every push/sync (new commits)
REVIEW_ON_SYNC = False

# The trigger phrase to force a review (case-insensitive)
REVIEW_TRIGGER = "Review=True"

# Files to skip during review (pre-compiled for performance and safety)
SKIP_FILE_PATTERNS = [
    re.compile(r'package-lock\.json$'),
    re.compile(r'yarn\.lock$'),
    re.compile(r'pnpm-lock\.yaml$'),
    re.compile(r'\.min\.js$'),
    re.compile(r'\.min\.css$'),
    re.compile(r'\.map$'),
    re.compile(r'\.svg$'),
    re.compile(r'\.png$'),
    re.compile(r'\.jpg$'),
    re.compile(r'\.jpeg$'),
    re.compile(r'\.gif$'),
    re.compile(r'\.ico$'),
    re.compile(r'\.woff2?$'),
    re.compile(r'\.ttf$'),
    re.compile(r'\.eot$'),
    re.compile(r'\.pyc$'),
    re.compile(r'__pycache__'),
    re.compile(r'\.egg-info'),
    re.compile(r'node_modules/'),
    re.compile(r'vendor/'),
    re.compile(r'dist/'),
    re.compile(r'build/'),
    re.compile(r'\.generated\.'),
    re.compile(r'\.auto\.'),
    re.compile(r'migrations/'),
]

# High priority files (security-sensitive)
HIGH_PRIORITY_PATTERNS = ['auth', 'login', 'password', 'secret', 'token', 'api', 'security', 'crypto', 'session', 'credential', 'key', 'private']

# Code file extensions
CODE_EXTENSIONS = {'.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.hpp', '.rb', '.php', '.swift', '.kt', '.scala', '.cs', '.vue', '.svelte'}


@dataclass
class FilePatch:
    """Represents a single file's patch/diff"""
    filename: str
    patch: str
    additions: int
    deletions: int
    priority: int  # 0=highest (security), 1=code, 2=other
    tokens: int


def get_env(key: str, required: bool = True) -> Optional[str]:
    """Get environment variable with optional requirement check"""
    value = os.getenv(key)
    if required and not value:
        print(f"Error: {key} environment variable is required")
        sys.exit(1)
    return value


def estimate_tokens(text: str) -> int:
    """Estimate token count from text (rough approximation)"""
    return len(text) // CHARS_PER_TOKEN


def github_api_request(endpoint: str, token: str, method: str = "GET", data: dict = None) -> Dict:
    """Make GitHub API request"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    url = f"{GITHUB_API_BASE}/{endpoint}"

    if method == "GET":
        response = requests.get(url, headers=headers)
    elif method == "POST":
        response = requests.post(url, headers=headers, json=data)
    else:
        raise ValueError(f"Unsupported method: {method}")

    if response.status_code not in [200, 201]:
        print(f"GitHub API error: {response.status_code}")
        # Truncate error output to avoid exposing sensitive info in CI logs
        error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
        print(f"Error preview: {error_preview}")
        sys.exit(1)

    return response.json()


def get_pr_diff(repo: str, pr_number: str, token: str) -> str:
    """Get PR diff in unified format"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3.diff"
    }

    url = f"{GITHUB_API_BASE}/repos/{repo}/pulls/{pr_number}"
    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        print(f"Failed to get PR diff: {response.status_code}")
        sys.exit(1)

    return response.text


def get_pr_files(repo: str, pr_number: str, token: str) -> List[Dict]:
    """Get list of files changed in PR with pagination"""
    all_files = []
    page = 1
    per_page = 100

    while True:
        endpoint = f"repos/{repo}/pulls/{pr_number}/files?per_page={per_page}&page={page}"
        files = github_api_request(endpoint, token)
        if not files:
            break
        all_files.extend(files)
        if len(files) < per_page:
            break
        page += 1

    return all_files


def should_skip_file(filename: str) -> bool:
    """Check if file should be skipped based on pre-compiled patterns"""
    for pattern in SKIP_FILE_PATTERNS:
        if pattern.search(filename):
            return True
    return False


def get_file_priority(filename: str) -> int:
    """Get file priority (0=highest, 2=lowest)"""
    fname_lower = filename.lower()

    # Highest priority: security-sensitive files
    if any(p in fname_lower for p in HIGH_PRIORITY_PATTERNS):
        return 0

    # High priority: code files
    if any(filename.endswith(ext) for ext in CODE_EXTENSIONS):
        return 1

    # Low priority: config, docs, etc.
    return 2


def parse_diff_to_files(diff_text: str) -> List[FilePatch]:
    """
    Parse unified diff into per-file patches.
    Inspired by PR-Agent's approach.
    """
    file_patches = []
    current_lines = []
    current_filename = None

    for line in diff_text.split('\n'):
        if line.startswith('diff --git'):
            # Save previous file
            if current_filename and current_lines:
                patch_text = '\n'.join(current_lines)
                additions = patch_text.count('\n+') - patch_text.count('\n+++')
                deletions = patch_text.count('\n-') - patch_text.count('\n---')

                if not should_skip_file(current_filename):
                    file_patches.append(FilePatch(
                        filename=current_filename,
                        patch=patch_text,
                        additions=max(0, additions),
                        deletions=max(0, deletions),
                        priority=get_file_priority(current_filename),
                        tokens=estimate_tokens(patch_text)
                    ))

            # Start new file
            current_lines = [line]
            # Parse filename using regex to handle spaces in paths
            # Format: diff --git a/path/to/file b/path/to/file
            # Use non-greedy (.*?) to correctly handle filenames containing ' b/'
            match = re.match(r'diff --git a/(.*?) b/(.*)', line)
            if match:
                current_filename = match.group(2)
            else:
                current_filename = 'unknown'
        else:
            current_lines.append(line)

    # Don't forget last file
    if current_filename and current_lines:
        patch_text = '\n'.join(current_lines)
        additions = patch_text.count('\n+') - patch_text.count('\n+++')
        deletions = patch_text.count('\n-') - patch_text.count('\n---')

        if not should_skip_file(current_filename):
            file_patches.append(FilePatch(
                filename=current_filename,
                patch=patch_text,
                additions=max(0, additions),
                deletions=max(0, deletions),
                priority=get_file_priority(current_filename),
                tokens=estimate_tokens(patch_text)
            ))

    return file_patches


def convert_to_hunks_with_line_numbers(patch: str, filename: str) -> str:
    """
    Convert patch to PR-Agent style format with line numbers and __new hunk__/__old hunk__ sections.
    This format helps the AI understand exactly what changed and where.
    """
    output = f"\n\n## File: '{filename}'\n"

    lines = patch.split('\n')
    RE_HUNK_HEADER = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)")

    new_content_lines = []
    old_content_lines = []
    start2 = 0
    current_header = ""

    for line in lines:
        if line.startswith('diff --git') or line.startswith('index ') or line.startswith('---') or line.startswith('+++'):
            continue

        if line.startswith('@@'):
            # Output previous hunk if exists
            if new_content_lines or old_content_lines:
                has_additions = any(l.startswith('+') for l in new_content_lines)
                has_deletions = any(l.startswith('-') for l in old_content_lines)

                if has_additions or has_deletions:
                    output += f"\n{current_header}\n"
                    output += "__new hunk__\n"
                    line_num = start2
                    for l in new_content_lines:
                        if l.startswith('+'):
                            output += f"{line_num:4d} {l}\n"
                            line_num += 1
                        elif l.startswith(' ') or (l and not l.startswith('-')):
                            output += f"{line_num:4d} {l}\n"
                            line_num += 1

                    if has_deletions:
                        output += "__old hunk__\n"
                        for l in old_content_lines:
                            output += f"{l}\n"

            # Parse new hunk header
            match = RE_HUNK_HEADER.match(line)
            if match:
                start2 = int(match.group(3)) if match.group(3) else 1
                current_header = line

            new_content_lines = []
            old_content_lines = []

        elif line.startswith('+'):
            new_content_lines.append(line)
        elif line.startswith('-'):
            old_content_lines.append(line)
        elif line.startswith(' ') or line == '':
            new_content_lines.append(line)
            old_content_lines.append(line)

    # Output final hunk
    if new_content_lines or old_content_lines:
        has_additions = any(l.startswith('+') for l in new_content_lines)
        has_deletions = any(l.startswith('-') for l in old_content_lines)

        if has_additions or has_deletions:
            output += f"\n{current_header}\n"
            output += "__new hunk__\n"
            line_num = start2
            for l in new_content_lines:
                if l.startswith('+'):
                    output += f"{line_num:4d} {l}\n"
                    line_num += 1
                elif l.startswith(' ') or (l and not l.startswith('-')):
                    output += f"{line_num:4d} {l}\n"
                    line_num += 1

            if has_deletions:
                output += "__old hunk__\n"
                for l in old_content_lines:
                    output += f"{l}\n"

    return output.rstrip()


def generate_diff_chunks(file_patches: List[FilePatch], max_tokens_per_chunk: int) -> List[Tuple[str, List[str]]]:
    """
    Generate diff chunks that fit within token limits.
    Returns list of (formatted_diff, list_of_filenames) tuples.

    This is the key PR-Agent concept: split large PRs into multiple reviewable chunks
    without losing any context.
    """
    # Sort by priority (security first, then code, then others)
    sorted_patches = sorted(file_patches, key=lambda x: (x.priority, -x.tokens))

    chunks = []
    current_chunk_patches = []
    current_chunk_tokens = 0

    # Reserve tokens for prompt overhead
    prompt_overhead = 2000
    effective_max = max_tokens_per_chunk - prompt_overhead

    for fp in sorted_patches:
        patch_tokens = max(1, fp.tokens)  # Prevent division by zero

        # If single file exceeds limit, truncate by lines to preserve diff syntax
        if patch_tokens > effective_max:
            print(f"Warning: {fp.filename} ({patch_tokens} tokens) exceeds chunk limit, truncating by lines...")
            lines = fp.patch.split('\n')
            max_lines = len(lines) * effective_max // patch_tokens  # Proportional line limit
            half_lines = max_lines // 2

            # Keep first half and last half of lines to preserve structure
            truncated_lines = lines[:half_lines] + [f"\n... [truncated {len(lines) - max_lines} lines from {fp.filename}] ...\n"] + lines[-half_lines:]
            truncated_patch = '\n'.join(truncated_lines)

            fp = FilePatch(
                filename=fp.filename,
                patch=truncated_patch,
                additions=fp.additions,
                deletions=fp.deletions,
                priority=fp.priority,
                tokens=estimate_tokens(truncated_patch)
            )
            patch_tokens = fp.tokens

        # Check if adding this file exceeds the limit
        if current_chunk_tokens + patch_tokens > effective_max and current_chunk_patches:
            # Save current chunk and start new one
            chunks.append(current_chunk_patches)
            current_chunk_patches = []
            current_chunk_tokens = 0

        current_chunk_patches.append(fp)
        current_chunk_tokens += patch_tokens

    # Don't forget the last chunk
    if current_chunk_patches:
        chunks.append(current_chunk_patches)

    # Convert chunks to formatted diffs
    result = []
    for chunk_patches in chunks:
        formatted_diff = ""
        filenames = []

        for fp in chunk_patches:
            formatted_diff += convert_to_hunks_with_line_numbers(fp.patch, fp.filename)
            filenames.append(fp.filename)

        result.append((formatted_diff, filenames))

    return result


def get_system_prompt(is_multi_chunk: bool = False, chunk_num: int = 1, total_chunks: int = 1) -> str:
    """Return the code review system prompt - inspired by PR-Agent"""

    multi_chunk_context = ""
    if is_multi_chunk:
        multi_chunk_context = f"\n[Reviewing part {chunk_num} of {total_chunks}]\n"

    return f"""You are a code reviewer analyzing a Pull Request.
{multi_chunk_context}
DIFF FORMAT: __new hunk__ = new code with line numbers, __old hunk__ = removed code

Review for bugs, security issues, and logic errors. Skip style/formatting nitpicks.

Keep your review AS CONCISE AS POSSIBLE without losing any important info. You have full control over formatting and structure - just make it brief, clear, and actionable."""


def get_user_prompt(pr_title: str, pr_description: str, diff: str, files_in_chunk: List[str],
                    chunk_num: int = 1, total_chunks: int = 1, all_files: List[str] = None) -> str:
    """Create the user prompt with PR context"""

    chunk_info = ""
    if total_chunks > 1:
        chunk_info = f"\n\n**Review Chunk:** {chunk_num} of {total_chunks}"
        chunk_info += f"\n**Files in this chunk:** {', '.join(files_in_chunk)}"
        if all_files:
            other_files = [f for f in all_files if f not in files_in_chunk]
            if other_files:
                chunk_info += f"\n**Other files in PR (reviewed separately):** {', '.join(other_files[:10])}"
                if len(other_files) > 10:
                    chunk_info += f" ... and {len(other_files) - 10} more"

    return f"""**PR Title:** {pr_title}

**Description:**
{pr_description or "No description provided"}
{chunk_info}

**Code Diff:**
{diff}"""


def call_pollinations_api(system_prompt: str, user_prompt: str, token: str, max_retries: int = 3) -> str:
    """Call Pollinations AI API with retry logic"""
    import time

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    print(f"Calling AI API with model: {MODEL}")
    print(f"Prompt size: ~{estimate_tokens(system_prompt + user_prompt)} tokens")

    last_error = None
    for attempt in range(max_retries):
        seed = random.randint(0, 2147483647)

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "seed": seed
        }

        if attempt > 0:
            print(f"Retry {attempt}/{max_retries - 1} with new seed: {seed}")

        try:
            response = requests.post(
                POLLINATIONS_API_BASE,
                headers=headers,
                json=payload,
                timeout=300  # 5 min timeout for large reviews
            )

            if response.status_code == 200:
                try:
                    result = response.json()
                    return result['choices'][0]['message']['content']
                except (KeyError, IndexError, json.JSONDecodeError) as e:
                    last_error = f"Error parsing API response: {e}"
                    error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                    print(f"{last_error}")
                    print(f"Response preview: {error_preview}")
            else:
                last_error = f"API error: {response.status_code}"
                error_preview = response.text[:500] + "..." if len(response.text) > 500 else response.text
                print(f"{last_error}")
                print(f"Error preview: {error_preview}")

        except requests.exceptions.RequestException as e:
            last_error = f"Request failed: {e}"
            print(last_error)

        if attempt < max_retries - 1:
            print("Waiting 5 seconds before retry...")
            time.sleep(5)

    print(f"All {max_retries} attempts failed. Last error: {last_error}")
    sys.exit(1)


def parse_review(response: str) -> str:
    """Clean up the review response"""
    review = response.strip()

    # Remove markdown code blocks if wrapped
    if review.startswith('```markdown'):
        review = review[11:]
    if review.startswith('```'):
        review = review[3:]
    if review.endswith('```'):
        review = review[:-3]

    return review.strip()


def post_review_comment(repo: str, pr_number: str, review: str, token: str):
    """Post the review as a PR comment"""
    endpoint = f"repos/{repo}/issues/{pr_number}/comments"
    github_api_request(endpoint, token, method="POST", data={"body": review})
    print(f"Posted review comment to PR #{pr_number}")


def check_review_trigger_in_text(text: str) -> bool:
    """Check if text contains the Review=True trigger (case-insensitive)"""
    if not text:
        return False
    return REVIEW_TRIGGER.lower() in text.lower()


def check_pr_description_for_trigger(repo: str, pr_number: str, token: str) -> bool:
    """Check if PR description contains Review=True"""
    pr_data = github_api_request(f"repos/{repo}/pulls/{pr_number}", token)
    body = pr_data.get('body', '') or ''
    return check_review_trigger_in_text(body)


def get_last_review_comment_time(repo: str, pr_number: str, token: str) -> Optional[str]:
    """Get the timestamp of the last bot review comment, if any"""
    page = 1
    per_page = 100
    last_review_time = None

    while True:
        endpoint = f"repos/{repo}/issues/{pr_number}/comments?per_page={per_page}&page={page}"
        comments = github_api_request(endpoint, token)

        for comment in comments:
            body = comment.get('body', '') or ''
            # Check if this is a review comment from our bot (contains typical review markers)
            if '## PR Review' in body or 'LGTM' in body or '🐛' in body or 'Bugs' in body:
                created_at = comment.get('created_at')
                if created_at and (not last_review_time or created_at > last_review_time):
                    last_review_time = created_at

        if len(comments) < per_page:
            break
        page += 1

    return last_review_time


def check_comments_for_new_trigger(repo: str, pr_number: str, token: str, after_time: Optional[str] = None) -> bool:
    """Check if any PR comment contains Review=True, optionally only after a certain time"""
    page = 1
    per_page = 100

    while True:
        endpoint = f"repos/{repo}/issues/{pr_number}/comments?per_page={per_page}&page={page}"
        comments = github_api_request(endpoint, token)

        for comment in comments:
            body = comment.get('body', '') or ''
            if check_review_trigger_in_text(body):
                # If we have a time filter, only count triggers after that time
                if after_time:
                    created_at = comment.get('created_at', '')
                    if created_at > after_time:
                        return True
                else:
                    return True

        if len(comments) < per_page:
            break
        page += 1

    return False


def check_commits_for_new_trigger(repo: str, pr_number: str, token: str, after_time: Optional[str] = None) -> bool:
    """Check if any commit message contains Review=True, optionally only after a certain time"""
    page = 1
    per_page = 100

    while True:
        endpoint = f"repos/{repo}/pulls/{pr_number}/commits?per_page={per_page}&page={page}"
        commits = github_api_request(endpoint, token)

        for commit in commits:
            message = commit.get('commit', {}).get('message', '') or ''
            if check_review_trigger_in_text(message):
                # If we have a time filter, only count triggers after that time
                if after_time:
                    commit_date = commit.get('commit', {}).get('committer', {}).get('date', '')
                    if commit_date > after_time:
                        return True
                else:
                    return True

        if len(commits) < per_page:
            break
        page += 1

    return False


def has_new_review_trigger(repo: str, pr_number: str, token: str) -> Tuple[bool, str]:
    """
    Check for NEW Review=True triggers (after last review).
    PR description trigger only counts on PR open, not on subsequent commits.
    """
    # Get the time of our last review
    last_review_time = get_last_review_comment_time(repo, pr_number, token)

    if last_review_time:
        print(f"Last review was at: {last_review_time}")
        # Only check for NEW triggers after our last review
        if check_comments_for_new_trigger(repo, pr_number, token, after_time=last_review_time):
            return True, "new PR comment"
        if check_commits_for_new_trigger(repo, pr_number, token, after_time=last_review_time):
            return True, "new commit message"
        return False, ""
    else:
        # No previous review - check all sources including description
        print("No previous review found, checking all trigger sources")
        if check_pr_description_for_trigger(repo, pr_number, token):
            return True, "PR description"
        if check_comments_for_new_trigger(repo, pr_number, token):
            return True, "PR comment"
        if check_commits_for_new_trigger(repo, pr_number, token):
            return True, "commit message"
        return False, ""


def should_run_review(repo: str, pr_number: str, token: str) -> Tuple[bool, str]:
    """Determine if review should run based on triggers and settings."""
    event_action = os.getenv('EVENT_ACTION', '')
    is_manual = os.getenv('IS_MANUAL', 'false').lower() == 'true'

    # Manual dispatch always runs
    if is_manual:
        return True, "Manual workflow dispatch"

    # PR just opened - auto review if enabled
    if event_action == 'opened':
        if AUTO_REVIEW:
            return True, "AUTO_REVIEW is enabled, PR was just opened"
        else:
            # Check for trigger in description on open
            if check_pr_description_for_trigger(repo, pr_number, token):
                return True, f"Found '{REVIEW_TRIGGER}' in PR description"
            return False, f"AUTO_REVIEW is disabled, add '{REVIEW_TRIGGER}' to trigger review"

    # New commits pushed - only review if NEW trigger found (after last review)
    if event_action == 'synchronize':
        if REVIEW_ON_SYNC:
            return True, "REVIEW_ON_SYNC is enabled"

        # Check for NEW triggers only (comment or commit after last review)
        trigger_found, trigger_source = has_new_review_trigger(repo, pr_number, token)
        if trigger_found:
            return True, f"Found '{REVIEW_TRIGGER}' in {trigger_source}"

        return False, f"No new '{REVIEW_TRIGGER}' found since last review"

    # Unknown event - check for new triggers
    trigger_found, trigger_source = has_new_review_trigger(repo, pr_number, token)
    if trigger_found:
        return True, f"Found '{REVIEW_TRIGGER}' in {trigger_source}"

    return False, f"No trigger found for event: {event_action or 'unknown'}"


def main():
    print("Starting PR Code Review (Enhanced)...")
    print(f"Token limits: {MAX_INPUT_TOKENS} input, {MAX_OUTPUT_TOKENS} output")

    # Get environment variables
    github_token = get_env('GITHUB_TOKEN')
    pollinations_token = get_env('POLLINATIONS_TOKEN')
    pr_number = get_env('PR_NUMBER')
    repo_full_name = get_env('REPO_FULL_NAME')

    print(f"Checking PR #{pr_number} in {repo_full_name}")

    # Check if we should run the review
    should_run, reason = should_run_review(repo_full_name, pr_number, github_token)
    print(f"Review decision: {reason}")

    if not should_run:
        print("Skipping review.")
        return

    print(f"Proceeding with review for PR #{pr_number}")

    # Get PR details
    pr_data = github_api_request(f"repos/{repo_full_name}/pulls/{pr_number}", github_token)
    pr_title = pr_data.get('title', '')
    pr_description = pr_data.get('body', '')

    # Get files changed
    print("Fetching changed files...")
    files_changed = get_pr_files(repo_full_name, pr_number, github_token)
    print(f"Found {len(files_changed)} files changed")

    # Check for code files
    code_files = [f for f in files_changed if any(f['filename'].endswith(ext) for ext in CODE_EXTENSIONS)]
    if not code_files:
        print("No code files to review. Skipping.")
        return

    # Get PR diff
    print("Fetching PR diff...")
    diff_raw = get_pr_diff(repo_full_name, pr_number, github_token)
    print(f"Raw diff size: {len(diff_raw)} chars (~{estimate_tokens(diff_raw)} tokens)")

    # Parse diff into file patches
    print("Parsing diff into file patches...")
    file_patches = parse_diff_to_files(diff_raw)
    print(f"Parsed {len(file_patches)} reviewable files (after filtering)")

    total_tokens = sum(fp.tokens for fp in file_patches)
    print(f"Total diff tokens: ~{total_tokens}")

    # Generate diff chunks
    print("Generating review chunks...")
    # With gemini-large's 1M context, we can fit ~800k tokens per chunk
    # This should handle even the largest PRs in a single pass
    chunks = generate_diff_chunks(file_patches, max_tokens_per_chunk=800000)
    print(f"Split into {len(chunks)} chunk(s)")

    # Get all filenames for context
    all_filenames = [fp.filename for fp in file_patches]

    # Generate reviews for each chunk
    is_multi_chunk = len(chunks) > 1
    all_reviews = []

    for i, (diff_chunk, files_in_chunk) in enumerate(chunks, 1):
        print(f"\nReviewing chunk {i}/{len(chunks)} ({len(files_in_chunk)} files)...")

        # Pass chunk info to system prompt for context
        system_prompt = get_system_prompt(
            is_multi_chunk=is_multi_chunk,
            chunk_num=i,
            total_chunks=len(chunks)
        )

        user_prompt = get_user_prompt(
            pr_title, pr_description, diff_chunk, files_in_chunk,
            chunk_num=i, total_chunks=len(chunks), all_files=all_filenames
        )

        ai_response = call_pollinations_api(system_prompt, user_prompt, pollinations_token)
        review = parse_review(ai_response)
        all_reviews.append((i, files_in_chunk, review))

    # Combine reviews
    if len(all_reviews) == 1:
        final_review = all_reviews[0][2]
    else:
        # Multiple chunks - combine into single comment with overall summary
        print(f"\nGenerating overall summary for {len(all_reviews)} review parts...")

        # Count total issues across all reviews
        total_issues = sum(1 for _, _, review in all_reviews if "LGTM" not in review.upper())

        final_review = f"## PR Review ({len(all_reviews)} parts, {len(all_filenames)} files)\n\n"

        if total_issues == 0:
            final_review += "**Overall: LGTM** - No critical issues found across all reviewed files.\n\n---\n\n"
        else:
            final_review += f"**Overall:** Found issues in {total_issues} of {len(all_reviews)} review sections. See details below.\n\n---\n\n"

        for chunk_num, files, review in all_reviews:
            final_review += f"### Part {chunk_num}: {', '.join(files[:3])}"
            if len(files) > 3:
                final_review += f" (+{len(files) - 3} more)"
            final_review += f"\n\n{review}\n\n---\n\n"
        final_review = final_review.rstrip('\n-')

    # Post review comment
    print("\nPosting review comment...")
    post_review_comment(repo_full_name, pr_number, final_review, github_token)

    print("Done!")


if __name__ == "__main__":
    main()
