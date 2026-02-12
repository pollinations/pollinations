"""Pollinations API client with native tool calling support."""

import asyncio
import json
import logging
import random
import time
from typing import Optional, Any, Callable
from functools import lru_cache

# Constants for retry logic
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds
MAX_SEED = 2**31 - 1  # int32 max

import aiohttp

from ..config import config
from ..constants import (
    POLLINATIONS_API_BASE,
    API_TIMEOUT,
    GITHUB_TOOLS,
    get_tool_system_prompt,
    MAX_TITLE_LENGTH,
    filter_tools_by_intent,
    filter_admin_actions_from_tools,
)

logger = logging.getLogger(__name__)


class ResponseCache:
    """Simple TTL cache for API responses."""

    def __init__(self, ttl: int = 60):
        self._cache: dict[str, tuple[float, Any]] = {}
        self._ttl = ttl

    def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired."""
        if key in self._cache:
            timestamp, value = self._cache[key]
            if time.time() - timestamp < self._ttl:
                return value
            del self._cache[key]
        return None

    def set(self, key: str, value: Any):
        """Cache a value."""
        self._cache[key] = (time.time(), value)

    def clear_expired(self):
        """Remove expired entries."""
        now = time.time()
        expired = [k for k, (t, _) in self._cache.items() if now - t >= self._ttl]
        for k in expired:
            del self._cache[k]


class PollinationsClient:
    """Client for Pollinations AI API with native tool calling."""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._connector: Optional[aiohttp.TCPConnector] = None
        self._cache = ResponseCache(ttl=60)  # 60 second cache
        self._tool_handlers: dict[str, Callable] = {}

    async def get_session(self) -> aiohttp.ClientSession:
        """Get or create the aiohttp session with connection pooling."""
        if self._session is None or self._session.closed:
            # Connection pooling for faster subsequent requests
            self._connector = aiohttp.TCPConnector(
                limit=50,  # Max connections (increased)
                limit_per_host=20,  # Max per host (increased)
                keepalive_timeout=60,  # Keep connections alive longer
                enable_cleanup_closed=True,
                ttl_dns_cache=300,  # Cache DNS for 5 mins
                use_dns_cache=True,
            )
            self._session = aiohttp.ClientSession(
                connector=self._connector,
                timeout=aiohttp.ClientTimeout(total=120, connect=10),
            )
        return self._session

    async def close(self):
        """Close the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
        if self._connector:
            await self._connector.close()
            self._connector = None

    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Optional[str]:
        """
        Simple text generation without tools.

        Args:
            system_prompt: System message
            user_prompt: User message
            model: Model to use (defaults to config.pollinations_model)
            temperature: Sampling temperature
            max_tokens: Max tokens to generate

        Returns:
            Generated text or None on error
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.pollinations_token}",
        }

        url = f"{POLLINATIONS_API_BASE}/v1/chat/completions"
        use_model = model or config.pollinations_model

        payload = {
            "model": use_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "seed": random.randint(0, MAX_SEED),
        }

        try:
            session = await self.get_session()
            async with session.post(
                url,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data["choices"][0]["message"].get("content", "")
                else:
                    error_text = await response.text()
                    logger.error(
                        f"generate_text error: HTTP {response.status}: {error_text[:200]}"
                    )
                    return None
        except Exception as e:
            logger.error(f"generate_text error: {e}")
            return None

    def register_tool_handler(self, name: str, handler: callable):
        """Register a handler function for a tool."""
        self._tool_handlers[name] = handler

    async def process_with_tools(
        self,
        user_message: str,
        discord_username: str,
        thread_history: Optional[list[dict]] = None,
        image_urls: Optional[list[str]] = None,
        video_urls: Optional[list[str]] = None,
        file_urls: Optional[list[str]] = None,
        is_admin: bool = False,
        tool_context: Optional[dict] = None,
    ) -> dict:
        """
        Process a message using native tool calling.

        Returns:
            Dict with:
            - response: The final text response to send
            - tool_calls: List of tool calls made (for logging)
            - tool_results: Results from tool executions
        """
        # Build system prompt with admin context - prompt content differs based on admin status
        # Non-admins get a prompt that doesn't mention admin tools at all (defense in depth)
        system_content = get_tool_system_prompt(is_admin=is_admin)
        if is_admin:
            system_content += "\n\n## ADMIN MODE\nUser is admin. All tools available. Confirm before destructive ops (merge, delete, lock, close PR, bulk edits, etc.) - use judgment."
        else:
            system_content += "\n\n## USER MODE\nUser is NOT admin. Read-only + create/comment only. Admin actions will return permission error."

        # Build messages
        messages = [{"role": "system", "content": system_content}]

        # Add thread history - preserve system messages (like task context) at the front
        # IMPROVED: Better labeling with session boundaries and context
        if thread_history:
            # Separate system messages from conversation messages
            system_msgs = [m for m in thread_history if m.get("role") == "system"]
            convo_msgs = [m for m in thread_history if m.get("role") != "system"]

            # Add all system messages first (e.g., task context, ccr output)
            # These are CRITICAL - contain task state, ccr history, bot notes
            if system_msgs:
                messages.append(
                    {
                        "role": "system",
                        "content": "═══════════════════════════════════════════════════════════════\n"
                        "## TASK STATE & BOT CONTEXT (persisted from previous interactions)\n"
                        "═══════════════════════════════════════════════════════════════",
                    }
                )
                for msg in system_msgs:
                    messages.append(msg)
                messages.append(
                    {
                        "role": "system",
                        "content": "═══════════════════════════════════════════════════════════════",
                    }
                )

            # Add context label before conversation history
            if convo_msgs:
                # Count messages by role for context
                user_count = len([m for m in convo_msgs if m.get("role") == "user"])
                bot_count = len([m for m in convo_msgs if m.get("role") == "assistant"])

                messages.append(
                    {
                        "role": "system",
                        "content": (
                            "═══════════════════════════════════════════════════════════════\n"
                            f"## THREAD CONVERSATION HISTORY (most recent {len(convo_msgs)} messages: {user_count} user + {bot_count} bot)\n"
                            "The user's CURRENT message requiring your response is at the END.\n"
                            "═══════════════════════════════════════════════════════════════"
                        ),
                    }
                )

            # Add ALL conversation messages - OpenAI-compatible API can handle full history
            # No artificial truncation - let bot AI see complete context
            for msg in convo_msgs:
                messages.append(msg)

            # Mark end of history clearly
            if convo_msgs:
                messages.append(
                    {
                        "role": "system",
                        "content": (
                            "═══════════════════════════════════════════════════════════════\n"
                            "END OF THREAD HISTORY - User's current message is BELOW\n"
                            "═══════════════════════════════════════════════════════════════"
                        ),
                    }
                )

        # Build current user message with media (images and videos)
        # NOTE: file_urls are NOT sent as media - they're mentioned in text for the AI to use web_scrape on
        file_urls = file_urls or []
        file_notice = ""
        if file_urls:
            file_notice = (
                f"\n\n[User attached {len(file_urls)} text/code file(s). Use web_scrape(action='fetch_file', file_url='...') to read them:\n"
                + "\n".join(f"- {url}" for url in file_urls[:5])
                + "]"
            )

        if image_urls or video_urls:
            content = [
                {
                    "type": "text",
                    "text": f"[{discord_username}]: {user_message}{file_notice}",
                }
            ]
            # Add images (Discord allows max 10 attachments per message)
            for url in (image_urls or [])[:10]:
                content.append({"type": "image_url", "image_url": {"url": url}})
            # Add videos - YouTube, GIFs, Discord video attachments
            for url in (video_urls or [])[:10]:
                content.append({"type": "video_url", "video_url": {"url": url}})
            messages.append({"role": "user", "content": content})
        else:
            messages.append(
                {
                    "role": "user",
                    "content": f"[{discord_username}]: {user_message}{file_notice}",
                }
            )

        # Call API with tools (include admin tools if user is admin)
        # Pass user_message for smart tool filtering
        result = await self._call_with_tools(
            messages,
            discord_username,
            is_admin=is_admin,
            user_message=user_message,
            tool_context=tool_context,
        )
        return result

    async def _call_with_tools(
        self,
        messages: list[dict],
        discord_username: str,
        max_iterations: int = 20,  # Safety cap - most tasks finish in 3-8 calls
        is_admin: bool = False,
        user_message: str = "",
        tool_context: Optional[dict] = None,
    ) -> dict:
        """Make API call with tool support and handle tool calls."""

        all_tool_calls = []
        all_tool_results = []

        # Start with all tools, conditionally including code_search if embeddings enabled
        from ..config import config
        from ..constants import get_tools_with_embeddings

        all_tools = get_tools_with_embeddings(
            GITHUB_TOOLS.copy(), config.local_embeddings_enabled, config.doc_embeddings_enabled
        )

        # SECURITY: Filter admin actions from tool descriptions for non-admin users
        # This removes admin-only tools (polly_agent) AND hides admin actions from
        # other tools (github_issue, github_pr, github_project) so AI can't even see them
        all_tools = filter_admin_actions_from_tools(all_tools, is_admin)

        # Smart tool filtering - only send relevant tools based on user intent
        # This saves tokens and speeds up AI reasoning
        # is_admin passed to ensure polly_agent only available to admins
        tools = (
            filter_tools_by_intent(user_message, all_tools, is_admin)
            if user_message
            else all_tools
        )

        # Log available tools for debugging
        all_tool_names = [t["function"]["name"] for t in all_tools]
        filtered_tool_names = [t["function"]["name"] for t in tools]
        logger.info(
            f"Available tools (is_admin={is_admin}): {', '.join(all_tool_names)}"
        )
        if len(tools) < len(all_tools):
            logger.info(f"Filtered tools to: {', '.join(filtered_tool_names)}")

        # Accumulate content_blocks across all iterations (code_execution images etc.)
        all_content_blocks = []

        for iteration in range(max_iterations):
            start_time = time.time()
            response = await self._call_api_with_tools(messages, tools=tools)
            api_time = time.time() - start_time
            logger.info(f"AI API call took {api_time:.1f}s (iteration {iteration + 1})")

            if not response:
                return {
                    "response": "Sorry, I had trouble processing that. Could you try again?",
                    "tool_calls": all_tool_calls,
                    "tool_results": all_tool_results,
                    "content_blocks": all_content_blocks,
                    "error": True,
                }

            # Collect content_blocks from every response (images from code_execution etc.)
            response_blocks = response.get("content_blocks", [])
            if response_blocks:
                all_content_blocks.extend(response_blocks)
                logger.info(f"Collected {len(response_blocks)} content block(s) from iteration {iteration + 1}")

            # Check if model wants to call tools
            tool_calls = response.get("tool_calls", [])

            if not tool_calls:
                # No tool calls, return the text response
                return {
                    "response": response.get("content", ""),
                    "tool_calls": all_tool_calls,
                    "tool_results": all_tool_results,
                    "content_blocks": all_content_blocks,
                }

            # Execute tool calls in parallel
            # Strip API prefix from tool names for cleaner logging
            tool_names = [
                (
                    tc["function"]["name"].split(":")[-1]
                    if ":" in tc["function"]["name"]
                    else tc["function"]["name"]
                )
                for tc in tool_calls
            ]
            logger.info(f"Executing {len(tool_calls)} tool(s): {', '.join(tool_names)}")
            all_tool_calls.extend(tool_calls)

            start_time = time.time()
            tool_results = await self._execute_tools_parallel(
                tool_calls, discord_username, tool_context=tool_context
            )
            tools_time = time.time() - start_time
            logger.info(f"Tools execution took {tools_time:.1f}s")
            all_tool_results.extend(tool_results)

            # Add assistant message with tool calls
            messages.append(
                {
                    "role": "assistant",
                    "content": response.get("content"),
                    "tool_calls": tool_calls,
                }
            )

            # Add tool results
            for tool_call, result in zip(tool_calls, tool_results):
                # Strip API prefix from tool name for consistency
                tool_name = tool_call["function"]["name"]
                if ":" in tool_name:
                    tool_name = tool_name.split(":")[-1]
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.get("id", ""),
                        "name": tool_name,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )

        # Max iterations reached, get final response
        final_response = await self._call_api_with_tools(messages, tools=None)
        # Collect any remaining content_blocks from final response
        if final_response:
            final_blocks = final_response.get("content_blocks", [])
            if final_blocks:
                all_content_blocks.extend(final_blocks)
        return {
            "response": final_response.get("content", "") if final_response else "",
            "tool_calls": all_tool_calls,
            "tool_results": all_tool_results,
            "content_blocks": all_content_blocks,
        }

    async def _execute_tools_parallel(
        self,
        tool_calls: list[dict],
        discord_username: str,
        tool_context: Optional[dict] = None,
    ) -> list[dict]:
        """Execute multiple tool calls in parallel."""

        # Actions that are safe to cache (read-only, no user-specific context)
        CACHEABLE_ACTIONS = {
            "get",
            "search",
            "list",
            "view",
            "find_similar",
            "list_labels",
            "list_milestones",
            "get_sub_issues",
            "get_parent",
        }

        async def execute_single(tool_call: dict) -> dict:
            func_name = tool_call["function"]["name"]
            # Strip API prefix if present (e.g., "default_api:polly_agent" -> "polly_agent")
            if ":" in func_name:
                func_name = func_name.split(":")[-1]
            try:
                args = json.loads(tool_call["function"]["arguments"])
            except json.JSONDecodeError:
                args = {}

            # Check cache first - only for safe read operations
            action = args.get("action", "")
            is_cacheable = action in CACHEABLE_ACTIONS
            cache_key = (
                f"{func_name}:{json.dumps(args, sort_keys=True)}"
                if is_cacheable
                else None
            )

            if cache_key:
                cached = self._cache.get(cache_key)
                if cached is not None:
                    logger.debug(f"Cache hit for {func_name}:{action}")
                    return cached

            # Get handler
            handler = self._tool_handlers.get(func_name)
            logger.debug(
                f"Tool lookup: {func_name} -> handler={'found' if handler else 'NOT FOUND'}, registered tools: {list(self._tool_handlers.keys())}"
            )
            if not handler:
                logger.warning(f"No handler for tool: {func_name}")
                return {"error": f"Unknown tool: {func_name}"}

            # Add discord_username for user-specific tools
            if func_name == "search_user_issues" and "discord_username" not in args:
                args["discord_username"] = discord_username

            # Inject tool context if provided (contains user info, channel, admin status, etc.)
            if tool_context:
                args["_context"] = tool_context

            try:
                logger.info(
                    f"Calling tool {func_name} with action={args.get('action', 'N/A')}"
                )
                result = await handler(**args)
                # Log result summary
                if result.get("error"):
                    logger.warning(
                        f"Tool {func_name} returned error: {result.get('error')[:200]}"
                    )
                else:
                    logger.info(f"Tool {func_name} succeeded")
                # Cache successful read-only results
                if cache_key and not result.get("error"):
                    self._cache.set(cache_key, result)
                return result
            except Exception as e:
                logger.error(f"Tool {func_name} failed: {e}")
                return {"error": str(e)}

        # Run all tool calls in parallel
        tasks = [execute_single(tc) for tc in tool_calls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Convert exceptions to error dicts
        return [
            r if not isinstance(r, Exception) else {"error": str(r)} for r in results
        ]

    async def _call_api_with_tools(
        self,
        messages: list[dict],
        tools: Optional[list] = None,
        timeout: int = API_TIMEOUT,
    ) -> Optional[dict]:
        """Make API call to Pollinations with tool definitions.

        Includes:
        - Random seed parameter (0 to int32 max) for each request
        - 3 retry attempts with 5s delay between retries
        - New random seed for each retry attempt
        """
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.pollinations_token}",
        }

        url = f"{POLLINATIONS_API_BASE}/v1/chat/completions"
        last_error = None

        for attempt in range(MAX_RETRIES):
            # Generate new random seed for each attempt
            seed = random.randint(0, MAX_SEED)

            payload = {
                "model": config.pollinations_model,
                "messages": messages,
                "seed": seed,
            }

            if tools:
                payload["tools"] = tools
                payload["tool_choice"] = "auto"

            try:
                session = await self.get_session()
                logger.debug(
                    f"API attempt {attempt + 1}/{MAX_RETRIES} with seed {seed}"
                )

                async with session.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        message = data["choices"][0]["message"]
                        # Log raw tool calls from API to debug prefix issue
                        if message.get("tool_calls"):
                            raw_names = [
                                tc["function"]["name"] for tc in message["tool_calls"]
                            ]
                            logger.info(f"API returned tool calls (raw): {raw_names}")
                        # Extract content_blocks (used by code_execution for images)
                        content_blocks = message.get("content_blocks", [])
                        if content_blocks:
                            logger.info(f"API returned {len(content_blocks)} content block(s)")
                        return {
                            "content": message.get("content", ""),
                            "tool_calls": message.get("tool_calls", []),
                            "content_blocks": content_blocks,
                        }
                    else:
                        error_text = await response.text()
                        last_error = f"HTTP {response.status}: {error_text[:100]}"
                        logger.warning(
                            f"Pollinations API error (attempt {attempt + 1}): {last_error}"
                        )

            except asyncio.TimeoutError:
                last_error = f"Timeout after {timeout}s"
                logger.warning(f"API timeout (attempt {attempt + 1})")
            except aiohttp.ClientError as e:
                last_error = f"Network error: {e}"
                logger.warning(f"Network error (attempt {attempt + 1}): {e}")
            except Exception as e:
                last_error = f"Error: {e}"
                logger.warning(f"API error (attempt {attempt + 1}): {e}")

            # Wait before retry (except on last attempt)
            if attempt < MAX_RETRIES - 1:
                logger.info(f"Retrying in {RETRY_DELAY}s...")
                await asyncio.sleep(RETRY_DELAY)

        # All retries failed
        logger.error(f"All {MAX_RETRIES} API attempts failed. Last error: {last_error}")
        return None

    # =========================================================================
    # LEGACY METHODS (for backwards compatibility during transition)
    # =========================================================================

    async def process_message(
        self,
        user_message: str,
        discord_username: str,
        thread_history: Optional[list[dict]] = None,
        image_urls: Optional[list[str]] = None,
        context_data: Optional[dict] = None,
    ) -> Optional[dict]:
        """Legacy method - wraps new tool-based processing."""
        result = await self.process_with_tools(
            user_message=user_message,
            discord_username=discord_username,
            thread_history=thread_history,
            image_urls=image_urls,
        )

        # Convert to legacy format
        if result.get("error"):
            return None

        return {"action": "respond", "message": result["response"]}

    async def format_search_results(
        self, user_query: str, issues: list[dict], discord_username: str
    ) -> Optional[dict]:
        """Format search results (now handled by AI after tool call)."""
        if not issues:
            return {
                "action": "respond",
                "message": "No issues found matching your search.",
            }

        # Format for display
        issues_text = "\n".join(
            [
                f"- **#{i['number']}**: {i['title']} ({i['state']}) - {i['url']}"
                for i in issues[:10]
            ]
        )

        return {
            "action": "respond",
            "message": f"Found {len(issues)} issue(s):\n{issues_text}",
        }

    async def format_issue_detail(
        self, issue: dict, comments: Optional[list[dict]] = None
    ) -> Optional[dict]:
        """Format issue detail (now handled by AI after tool call)."""
        state_emoji = "🟢" if issue["state"] == "open" else "🔴"

        msg = f"{state_emoji} **#{issue['number']}: {issue['title']}**\n"
        msg += f"State: {issue['state']} | Author: {issue['author']}\n"

        if issue.get("labels"):
            msg += f"Labels: {', '.join(issue['labels'])}\n"

        msg += f"\n{issue.get('body', 'No description')}\n"
        msg += f"\n{issue['url']}"

        if comments:
            msg += "\n\n**Recent comments:**\n"
            for c in comments[:3]:
                msg += f"- {c['author']}: {c['body']}\n"

        return {"action": "respond", "message": msg}

    def get_topic_summary_fast(self, message: str) -> str:
        """Quick topic extraction (no AI, synchronous)."""
        words = message.lower().split()
        stop_words = {
            "i",
            "im",
            "i'm",
            "the",
            "a",
            "an",
            "is",
            "are",
            "keep",
            "keeps",
            "getting",
            "got",
            "have",
            "has",
            "my",
            "me",
            "find",
            "search",
            "show",
            "what",
            "where",
            "issues",
            "issue",
        }
        meaningful = [w for w in words if w not in stop_words and len(w) > 2][:5]
        return " ".join(meaningful) if meaningful else "general"

    async def format_notification(
        self, issue: dict, changes: list[dict], issue_url: str
    ) -> str:
        """
        Use AI to generate a beautifully formatted notification message.

        Args:
            issue: Issue data (number, title, state, labels)
            changes: List of change dicts with type and data
            issue_url: Full URL to the issue

        Returns:
            Formatted Discord notification message with emojis
        """
        # Build context for AI
        changes_text = "\n".join(
            [
                f"- Type: {c['type']}, Data: {json.dumps(c.get('data', {}), ensure_ascii=False)}"
                for c in changes
            ]
        )

        system_prompt = """You are a notification formatter for a Discord bot that watches GitHub issues.
Format notifications beautifully for Discord with:
- Appropriate emojis (💬 for comments, 🔒 for closed, 🔓 for reopened, 🏷️ for labels)
- Bold and italic for emphasis
- Concise but informative summaries
- Keep it under 400 characters total
- If there's a new comment, summarize what it says in 1-2 sentences
- Make it feel friendly and helpful, not robotic

Output ONLY the formatted message, nothing else."""

        user_prompt = f"""Format this GitHub issue update notification:

Issue: #{issue['number']} - {issue['title']}
Current State: {issue['state']}
Labels: {', '.join(issue.get('labels', [])) or 'none'}
URL: {issue_url}

Changes detected:
{changes_text}

Generate a beautiful, concise Discord notification."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            response = await self._call_api_with_tools(messages, tools=None, timeout=30)
            if response and response.get("content"):
                return response["content"].strip()
        except Exception as e:
            logger.error(f"Failed to format notification with AI: {e}")

        # Fallback to simple format if AI fails
        return self._format_notification_fallback(issue, changes, issue_url)

    def _format_notification_fallback(
        self, issue: dict, changes: list[dict], issue_url: str
    ) -> str:
        """Fallback notification format if AI fails."""
        emoji_map = {
            "closed": "🔒",
            "reopened": "🔓",
            "comment": "💬",
            "labels_added": "🏷️",
            "labels_removed": "🏷️",
        }

        parts = []
        for change in changes:
            change_type = change.get("type", "")
            data = change.get("data", {})
            emoji = emoji_map.get(change_type, "📝")

            if change_type == "closed":
                parts.append(f"{emoji} Issue closed!")
            elif change_type == "reopened":
                parts.append(f"{emoji} Issue reopened!")
            elif change_type == "comment":
                author = data.get("author", "someone")
                body = data.get("body", "")
                parts.append(f"{emoji} **{author}** commented:\n> {body}")
            elif change_type == "labels_added":
                labels = data.get("labels", [])
                parts.append(
                    f"{emoji} Labels added: {', '.join(f'`{l}`' for l in labels)}"
                )
            elif change_type == "labels_removed":
                labels = data.get("labels", [])
                parts.append(
                    f"{emoji} Labels removed: {', '.join(f'`{l}`' for l in labels)}"
                )

        changes_str = "\n".join(parts) if parts else "Update detected"

        return (
            f"**[#{issue['number']}: {issue['title']}](<{issue_url}>)**\n"
            f"{changes_str}"
        )


# Singleton instance
pollinations_client = PollinationsClient()


# =============================================================================
# WEB SEARCH HANDLER - Uses Perplexity models via Pollinations API
# =============================================================================

async def web_search_handler(query: str, model: str = "perplexity-fast", **kwargs) -> dict:
    """
    Handle web_search tool calls using various search-enabled models.

    Supported models:
    - gemini-search: Gemini 2.0 Flash with Google Search (fast, factual)
    - perplexity-fast: Perplexity Sonar (balanced, citations)
    - perplexity-reasoning: Perplexity Sonar Reasoning (deep analysis)

    Args:
        query: The search query
        model: Search model to use (default: perplexity-fast)

    Returns:
        Dict with search results or error
    """
    # Validate model
    valid_models = ["gemini-search", "perplexity-fast", "perplexity-reasoning"]
    if model not in valid_models:
        model = "perplexity-fast"  # Default fallback

    messages = [
        {
            "role": "system",
            "content": "You are a helpful search assistant. Provide accurate, up-to-date information with sources when available. Be concise but thorough.",
        },
        {"role": "user", "content": query},
    ]

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.pollinations_token}",
    }

    payload = {
        "model": model,
        "messages": messages,
    }

    try:
        session = await pollinations_client.get_session()
        url = f"{POLLINATIONS_API_BASE}/v1/chat/completions"

        async with session.post(
            url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=60)
        ) as response:
            if response.status == 200:
                data = await response.json()
                content = data["choices"][0]["message"].get("content", "")
                return {"result": content, "model": model, "query": query}
            else:
                error_text = await response.text()
                logger.error(
                    f"Web search API error: {response.status} - {error_text[:200]}"
                )
                return {"error": f"Search failed: HTTP {response.status}"}

    except asyncio.TimeoutError:
        logger.error("Web search timeout")
        return {"error": "Search timed out. Try a simpler query."}
    except Exception as e:
        logger.error(f"Web search error: {e}")
        return {"error": f"Search failed: {str(e)}"}


async def web_handler(query: str, **kwargs) -> dict:
    """
    Handle web tool calls using nomnom model for deep research.

    nomnom combines search, scrape, crawl, and code execution for complex tasks.
    Use sparingly - it's powerful but slower and more expensive than simple tools.

    Args:
        query: Natural language request describing what to research/analyze

    Returns:
        Dict with research results, including any generated images
    """
    messages = [
        {
            "role": "system",
            "content": "You are a deep research assistant with web search, scraping, crawling, and Python code execution capabilities. Provide thorough, accurate, well-sourced answers. Use code for data analysis when helpful.",
        },
        {"role": "user", "content": query},
    ]

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.pollinations_token}",
    }

    payload = {
        "model": "nomnom",
        "messages": messages,
    }

    try:
        session = await pollinations_client.get_session()
        url = f"{POLLINATIONS_API_BASE}/v1/chat/completions"

        # nomnom handles complex research - no timeout limit
        async with session.post(
            url, json=payload, headers=headers
        ) as response:
            if response.status == 200:
                data = await response.json()
                message = data["choices"][0]["message"]
                content = message.get("content", "")

                # Extract image URLs from content_blocks (nomnom can generate images)
                content_blocks = message.get("content_blocks", [])
                image_urls = []
                for block in content_blocks:
                    if block.get("type") == "image_url":
                        img_url = block.get("image_url", {}).get("url", "")
                        if img_url and img_url.startswith("http"):
                            image_urls.append(img_url)

                result = {"result": content, "model": "nomnom", "query": query}
                if image_urls:
                    result["image_urls"] = image_urls
                    logger.info(f"nomnom returned {len(image_urls)} image(s)")
                return result
            else:
                error_text = await response.text()
                logger.error(
                    f"Web (nomnom) API error: {response.status} - {error_text[:200]}"
                )
                return {"error": f"Research failed: HTTP {response.status}"}

    except asyncio.TimeoutError:
        logger.error("Web (nomnom) timeout")
        return {"error": "Research timed out. Try a simpler query or use web_search instead."}
    except Exception as e:
        logger.error(f"Web (nomnom) error: {e}")
        return {"error": f"Research failed: {str(e)}"}
