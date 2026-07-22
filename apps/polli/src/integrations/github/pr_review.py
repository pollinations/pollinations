"""AI-powered pull request review.

Each changed file is reviewed concurrently, then the per-file findings are synthesized
into one report — so latency stays roughly flat as PR size grows, instead of one blocking
call over the whole diff.

Mixed into GitHubPRManager; relies on the host class for `get_pr` and `get_pr_diff`.
"""

import asyncio
import logging

from ...core.config import config
from ...utils.regex import re

logger = logging.getLogger(__name__)

# Files whose diffs carry no review value.
SKIP_FILE_PATTERNS = [
    re.compile(r"package-lock\.json$"),
    re.compile(r"yarn\.lock$"),
    re.compile(r"pnpm-lock\.yaml$"),
    re.compile(r"\.min\.js$"),
    re.compile(r"\.min\.css$"),
    re.compile(r"\.map$"),
    re.compile(r"\.(svg|png|jpg|jpeg|gif|ico|woff2?|ttf|eot|pyc)$"),
    re.compile(r"__pycache__|\.egg-info"),
    re.compile(r"node_modules/|vendor/|dist/|build/"),
    re.compile(r"migrations/"),
    re.compile(r"drizzle/meta/"),
]

# Path segments that mark security-sensitive files, reviewed on their own rather than
# batched with unrelated small files.
HIGH_PRIORITY_PATTERNS = [
    "auth", "login", "password", "secret", "token", "api", "security",
    "crypto", "session", "credential", "key", "private",
]


class PRReviewMixin:
    """Concurrent per-file review plus synthesis into a single report."""

    # ============================================================
    # AI-POWERED PR REVIEW
    # ============================================================

    async def review_pr(self, pr_number: int, post_to_github: bool = False, author: str = "Discord User") -> dict:
        """
        Generate an AI-powered code review for a PR.

        Reviews each changed file concurrently (bounded by REVIEW_CONCURRENCY), then
        synthesizes the per-file findings into one report. This keeps latency roughly
        constant regardless of PR size instead of one blocking call over the whole diff
        that scales linearly with diff size and can approach the request timeout on
        large PRs.

        Args:
            pr_number: The PR number to review
            post_to_github: If True, post the review as a GitHub comment.
                           If False, return the review text for Discord.
            author: The Discord username requesting the review

        Returns:
            dict with 'review' text and optionally 'posted_to_github'
        """
        # Get PR details
        pr = await self.get_pr(pr_number)
        if pr.get("error"):
            return pr

        # Get PR diff
        diff_result = await self.get_pr_diff(pr_number)
        if diff_result.get("error"):
            return diff_result

        diff = diff_result.get("diff", "")
        if not diff:
            return {"error": "No diff available for this PR"}

        files = self._split_diff_by_file(diff)
        if not files:
            return {"error": "No reviewable code files in this PR"}

        try:
            file_findings = await self._review_files_concurrently(files)
        except Exception as e:
            logger.error(f"Error generating PR review: {e}")
            return {"error": f"Failed to generate review: {str(e)}"}

        reviewed = [f for f in file_findings if f["findings"] and not f.get("error")]
        errored = [f for f in file_findings if f.get("error")]

        if not reviewed and errored:
            return {"error": f"Failed to review any files ({len(errored)} errors)"}

        try:
            review_text = await self._synthesize_review(pr, reviewed, errored)
        except Exception as e:
            logger.error(f"Error synthesizing PR review: {e}")
            return {"error": f"Failed to synthesize review: {str(e)}"}

        if not review_text:
            return {"error": "Failed to generate review"}

        result = {
            "success": True,
            "pr_number": pr_number,
            "pr_title": pr["title"],
            "pr_url": pr["url"],
            "review": review_text,
            "files_reviewed": len(files),
            "posted_to_github": False,
        }

        # Optionally post to GitHub
        if post_to_github:
            comment_result = await self.add_comment(
                pr_number,
                f"## AI Code Review\n\n{review_text}\n\n---\n*Requested by `{author}` via Discord*",
                author,
            )
            if comment_result.get("success"):
                result["posted_to_github"] = True

        return result

    # Cap concurrent per-file review calls so a huge PR doesn't fire 200 requests at once
    REVIEW_CONCURRENCY = 8
    # Files smaller than this get batched together into one call instead of reviewed alone.
    # PR-Agent-style hunks always carry header/context overhead, so even a one-line change
    # rarely formats under ~500 chars — this needs to sit above the typical small-file size,
    # not just above zero, or every file ends up solo regardless of how trivial it is.
    MIN_HUNK_CHARS_FOR_SOLO_REVIEW = 2500

    def _split_diff_by_file(self, diff_text: str) -> list[dict]:
        """Split a unified diff into per-file formatted hunks (PR-Agent style)."""
        files = []
        current_lines: list[str] = []
        current_filename = None

        def _flush():
            if current_filename and current_lines and not self._should_skip_file(current_filename):
                formatted = self._format_file_hunks(current_filename, "\n".join(current_lines))
                if formatted:
                    files.append({
                        "filename": current_filename,
                        "diff": formatted,
                        "high_priority": self._is_high_priority(current_filename),
                    })

        for line in diff_text.split("\n"):
            if line.startswith("diff --git"):
                _flush()
                current_lines = [line]
                match = re.match(r"diff --git a/(.*?) b/(.*)", line)
                current_filename = match.group(2) if match else "unknown"
            else:
                current_lines.append(line)

        _flush()
        return files

    def _is_high_priority(self, filename: str) -> bool:
        # Match whole path segments / word boundaries — a plain substring check on "api"
        # false-positives on every file under a domain-named directory like
        # "enter.pollinations.ai/...", which would mark the entire repo high-priority.
        segments = re.split(r"[/._-]", filename.lower())
        return any(pattern in segments for pattern in HIGH_PRIORITY_PATTERNS)

    def _batch_files(self, files: list[dict]) -> list[list[dict]]:
        """Group small files together so trivial diffs don't each burn a full LLM call.

        Solo (large/high-priority) and batchable files are typically interleaved in diff
        order — greedily scanning in order would isolate every small file that happens to
        sit between two solo ones. Partition first, then pack the batchable files together
        regardless of their original position.
        """
        solo = [[f] for f in files if len(f["diff"]) >= self.MIN_HUNK_CHARS_FOR_SOLO_REVIEW or f["high_priority"]]
        batchable = [f for f in files if len(f["diff"]) < self.MIN_HUNK_CHARS_FOR_SOLO_REVIEW and not f["high_priority"]]

        batches: list[list[dict]] = list(solo)
        current_batch: list[dict] = []
        current_chars = 0
        BATCH_CHAR_BUDGET = 6000

        for f in batchable:
            hunk_len = len(f["diff"])
            if current_batch and current_chars + hunk_len > BATCH_CHAR_BUDGET:
                batches.append(current_batch)
                current_batch, current_chars = [], 0

            current_batch.append(f)
            current_chars += hunk_len

        if current_batch:
            batches.append(current_batch)

        return batches

    async def _review_files_concurrently(self, files: list[dict]) -> list[dict]:
        """Review each file (or small-file batch) concurrently, bounded by a semaphore."""
        from ...ai.client import pollinations_client

        batches = self._batch_files(files)
        semaphore = asyncio.Semaphore(self.REVIEW_CONCURRENCY)

        async def _review_batch(batch: list[dict]) -> dict:
            filenames = [f["filename"] for f in batch]
            combined_diff = "".join(f["diff"] for f in batch)
            high_priority = any(f["high_priority"] for f in batch)

            async with semaphore:
                try:
                    response = await pollinations_client.generate_text(
                        system_prompt=self._get_file_review_system_prompt(),
                        user_prompt=combined_diff,
                        model=config.ai.model,
                        temperature=0.2,
                        max_tokens=1024,
                    )
                except Exception as e:
                    return {"filenames": filenames, "findings": "", "high_priority": high_priority, "error": str(e)}

            if not response:
                return {"filenames": filenames, "findings": "", "high_priority": high_priority, "error": "empty response"}

            findings = self._parse_review(response)
            return {"filenames": filenames, "findings": findings, "high_priority": high_priority}

        return await asyncio.gather(*(_review_batch(b) for b in batches))

    async def _synthesize_review(self, pr: dict, reviewed: list[dict], errored: list[dict]) -> str | None:
        """Merge per-file findings into one deduped, severity-ordered report."""
        from ...ai.client import pollinations_client

        clean = [f for f in reviewed if not f["findings"].upper().startswith("LGTM")]
        if not clean:
            summary = "**LGTM** - No major issues found across reviewed files."
            if errored:
                summary += f"\n\n_Note: {len(errored)} file(s)/batch(es) could not be reviewed due to an error._"
            return summary

        findings_blob = "\n\n".join(
            f"### {', '.join(f['filenames'])}{' [security-sensitive]' if f['high_priority'] else ''}\n{f['findings']}"
            for f in clean
        )

        user_prompt = f"""**PR #{pr["number"]}:** {pr["title"]}

**Author:** {pr["author"]}
**Changes:** +{pr["additions"]} -{pr["deletions"]} across {pr["changed_files"]} files

**Per-file findings from independent reviews:**
{findings_blob}

Merge these into ONE review. Deduplicate overlapping points, drop anything trivial/stylistic,
order by severity (bugs/security first), keep file:line references. Security-sensitive files
should be called out first if they have any findings."""

        response = await pollinations_client.generate_text(
            system_prompt=self._get_review_system_prompt(),
            user_prompt=user_prompt,
            model=config.ai.model,
            temperature=0.3,
            max_tokens=1200,
        )
        if not response:
            return None

        review = self._parse_review(response)
        if errored:
            review += f"\n\n_Note: {len(errored)} file(s)/batch(es) could not be reviewed due to an error._"
        return review

    def _format_file_hunks(self, filename: str, patch: str) -> str:
        """Convert a file's patch to PR-Agent style format with line numbers."""
        lines = patch.split("\n")
        output = f"\n\n## File: '{filename}'\n"

        new_hunk_lines = []
        old_hunk_lines = []
        line_num = 0
        current_header = ""

        for line in lines:
            if line.startswith(("diff --git", "index ", "---", "+++")):
                continue

            if line.startswith("@@"):
                # Output previous hunk
                if new_hunk_lines or old_hunk_lines:
                    output += self._format_hunk(current_header, new_hunk_lines, old_hunk_lines)
                    new_hunk_lines = []
                    old_hunk_lines = []

                # Parse new line number
                match = re.search(r"\+(\d+)", line)
                line_num = int(match.group(1)) - 1 if match else 0
                current_header = line

            elif line.startswith("+") and not line.startswith("+++"):
                line_num += 1
                new_hunk_lines.append(f"{line_num:4d} {line}")
            elif line.startswith("-") and not line.startswith("---"):
                old_hunk_lines.append(line)
            elif line.startswith(" ") or line == "":
                line_num += 1
                new_hunk_lines.append(f"{line_num:4d} {line}")

        # Output final hunk
        if new_hunk_lines or old_hunk_lines:
            output += self._format_hunk(current_header, new_hunk_lines, old_hunk_lines)

        return output

    def _format_hunk(self, header: str, new_lines: list, old_lines: list) -> str:
        """Format a single hunk with __new hunk__ / __old hunk__ sections."""
        has_additions = any("+" in l for l in new_lines)
        has_deletions = bool(old_lines)

        if not has_additions and not has_deletions:
            return ""

        output = f"\n{header}\n__new hunk__\n"
        output += "\n".join(new_lines) + "\n"

        if has_deletions:
            output += "__old hunk__\n"
            output += "\n".join(old_lines) + "\n"

        return output

    def _should_skip_file(self, filename: str) -> bool:
        """Check if file should be skipped during review."""
        for pattern in SKIP_FILE_PATTERNS:
            if pattern.search(filename):
                return True
        return False

    def _get_file_review_system_prompt(self) -> str:
        """System prompt for the per-file/per-batch review pass."""
        return """You are a code reviewer analyzing one or more changed files from a Pull Request.

DIFF FORMAT: __new hunk__ = new code with line numbers, __old hunk__ = removed code

Review for:
1. **Bugs** - Logic errors, edge cases, null checks
2. **Security** - Injection, XSS, auth issues, secrets in code
3. **Performance** - N+1 queries, memory leaks, inefficient loops

Skip style/formatting nitpicks. Focus on issues that matter. Only comment on lines
actually shown in the diff — do not speculate about code you can't see.

OUTPUT FORMAT:
- If no issues in these files: reply with exactly "LGTM"
- If issues found: list each with a file:line reference and a one-sentence explanation

Be terse — this is one file of a larger review, not the final report."""

    def _get_review_system_prompt(self) -> str:
        """System prompt for the synthesis pass that merges per-file findings into one report."""
        return """You are a senior engineer producing the final review for a Pull Request,
given independent per-file findings gathered by other reviewers.

Review for:
1. **Bugs** - Logic errors, edge cases, null checks
2. **Security** - Injection, XSS, auth issues, secrets in code
3. **Performance** - N+1 queries, memory leaks, inefficient loops

Skip style/formatting nitpicks. Focus on issues that matter.

OUTPUT FORMAT:
- If no major issues: Start with "**LGTM** - No major issues found." then optionally list minor suggestions
- If issues found: List each issue with file:line reference and brief explanation, most severe first

Keep your review concise (200-500 words). Be direct and actionable."""

    def _parse_review(self, response: str) -> str:
        """Clean up the review response."""
        review = response.strip()

        # Remove markdown code blocks if wrapped
        if review.startswith("```"):
            lines = review.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            review = "\n".join(lines)

        return review.strip()
