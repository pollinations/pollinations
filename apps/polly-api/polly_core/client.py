"""Pollinations API client with native tool calling support.

User's API key is passed through for all upstream AI calls.
GitHub tools use server-side tokens (separate, never exposed).
"""

import asyncio
import json
import logging
import random
import time
from typing import Optional, Any, Callable

MAX_RETRIES = 3
RETRY_DELAY = 5
MAX_SEED = 2**31 - 1
CACHE_MAX_SIZE = 500

import aiohttp

logger = logging.getLogger(__name__)


class ResponseCache:
    """TTL cache with max size for API responses."""

    def __init__(self, ttl: int = 60, max_size: int = CACHE_MAX_SIZE):
        self._cache: dict[str, tuple[float, Any]] = {}
        self._ttl = ttl
        self._max_size = max_size

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            timestamp, value = self._cache[key]
            if time.time() - timestamp < self._ttl:
                return value
            del self._cache[key]
        return None

    def set(self, key: str, value: Any):
        # Evict expired entries if at capacity
        if len(self._cache) >= self._max_size:
            self.clear_expired()
        # If still at capacity, evict oldest
        if len(self._cache) >= self._max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][0])
            del self._cache[oldest_key]
        self._cache[key] = (time.time(), value)

    def clear_expired(self):
        now = time.time()
        expired = [k for k, (t, _) in self._cache.items() if now - t >= self._ttl]
        for k in expired:
            del self._cache[k]


class PollyClient:
    """Client for Pollinations AI API with native tool calling.

    Separates two auth concerns:
    - user_api_key: passed through for upstream AI calls (reasoning, search)
    - config tokens: server-side GitHub/Discord tokens (never exposed to users)
    """

    def __init__(self, config):
        self.config = config
        self._session: Optional[aiohttp.ClientSession] = None
        self._connector: Optional[aiohttp.TCPConnector] = None
        self._cache = ResponseCache(ttl=60)
        self._tool_handlers: dict[str, Callable] = {}

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._connector = aiohttp.TCPConnector(
                limit=50,
                limit_per_host=20,
                keepalive_timeout=60,
                enable_cleanup_closed=True,
                ttl_dns_cache=300,
                use_dns_cache=True,
            )
            self._session = aiohttp.ClientSession(
                connector=self._connector,
                timeout=aiohttp.ClientTimeout(total=120, connect=10),
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
        if self._connector:
            await self._connector.close()
            self._connector = None

    def _get_ai_token(self, user_api_key: str = "") -> str:
        """Get the token to use for upstream AI calls.

        Priority: user's key > server fallback.
        """
        return user_api_key or self.config.pollinations_token

    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Optional[str]:
        """Simple text generation without tools.

        Uses server-side token (called by PR review, not user-facing).
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.config.pollinations_token}",
        }

        url = f"{self.config.pollinations_api_base}/v1/chat/completions"
        use_model = model or self.config.pollinations_model

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
                url, json=payload, headers=headers,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data["choices"][0]["message"].get("content", "")
                else:
                    error_text = await response.text()
                    logger.error(f"generate_text error: HTTP {response.status}: {error_text[:200]}")
                    return None
        except Exception as e:
            logger.error(f"generate_text error: {e}")
            return None

    def register_tool_handler(self, name: str, handler: callable):
        self._tool_handlers[name] = handler

    async def process_with_tools(
        self,
        messages: list[dict],
        user_message: str = "",
        tool_context: Optional[dict] = None,
        user_api_key: str = "",
    ) -> dict:
        """Process messages using native tool calling.

        Args:
            messages: Chat messages
            user_message: Extracted text for tool filtering
            tool_context: Extra context passed to tool handlers
            user_api_key: User's API key for upstream AI calls
        """
        from .constants import get_tool_system_prompt

        system_content = get_tool_system_prompt()

        if not messages or messages[0].get("role") != "system":
            messages = [{"role": "system", "content": system_content}] + messages

        result = await self._call_with_tools(
            messages,
            user_message=user_message,
            tool_context=tool_context,
            user_api_key=user_api_key,
        )
        return result

    async def _call_with_tools(
        self,
        messages: list[dict],
        max_iterations: int = 20,
        user_message: str = "",
        tool_context: Optional[dict] = None,
        user_api_key: str = "",
    ) -> dict:
        from .constants import get_tools_with_embeddings, filter_tools_by_intent

        all_tool_calls = []
        all_tool_results = []

        all_tools = get_tools_with_embeddings(
            self.config.local_embeddings_enabled,
            self.config.doc_embeddings_enabled,
            self.config.discord_search_enabled,
        )

        tools = (
            filter_tools_by_intent(user_message, all_tools)
            if user_message
            else all_tools
        )

        tool_names = [t["function"]["name"] for t in tools]
        logger.info(f"Available tools: {', '.join(tool_names)}")

        all_content_blocks = []

        for iteration in range(max_iterations):
            start_time = time.time()
            response = await self._call_api_with_tools(
                messages, tools=tools, user_api_key=user_api_key
            )
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

            response_blocks = response.get("content_blocks", [])
            if response_blocks:
                all_content_blocks.extend(response_blocks)

            tool_calls = response.get("tool_calls", [])

            if not tool_calls:
                return {
                    "response": response.get("content", ""),
                    "tool_calls": all_tool_calls,
                    "tool_results": all_tool_results,
                    "content_blocks": all_content_blocks,
                }

            tool_names = [
                tc["function"]["name"].split(":")[-1]
                if ":" in tc["function"]["name"]
                else tc["function"]["name"]
                for tc in tool_calls
            ]
            logger.info(f"Executing {len(tool_calls)} tool(s): {', '.join(tool_names)}")
            all_tool_calls.extend(tool_calls)

            start_time = time.time()
            tool_results = await self._execute_tools_parallel(
                tool_calls, tool_context=tool_context
            )
            tools_time = time.time() - start_time
            logger.info(f"Tools execution took {tools_time:.1f}s")
            all_tool_results.extend(tool_results)

            messages.append(
                {
                    "role": "assistant",
                    "content": response.get("content"),
                    "tool_calls": tool_calls,
                }
            )

            for tool_call, result in zip(tool_calls, tool_results):
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

        final_response = await self._call_api_with_tools(
            messages, tools=None, user_api_key=user_api_key
        )
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
        tool_context: Optional[dict] = None,
    ) -> list[dict]:
        CACHEABLE_ACTIONS = {
            "get", "search", "list", "view", "find_similar",
            "list_labels", "list_milestones", "get_sub_issues", "get_parent",
            "get_history", "get_files", "get_diff", "get_checks", "get_commits",
        }

        async def execute_single(tool_call: dict) -> dict:
            func_name = tool_call["function"]["name"]
            if ":" in func_name:
                func_name = func_name.split(":")[-1]

            try:
                args = json.loads(tool_call["function"]["arguments"])
            except json.JSONDecodeError:
                args = {}

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

            handler = self._tool_handlers.get(func_name)
            if not handler:
                logger.warning(f"No handler for tool: {func_name}")
                return {"error": f"Unknown tool: {func_name}"}

            if tool_context:
                args["_context"] = tool_context

            try:
                logger.info(f"Calling tool {func_name} with action={args.get('action', 'N/A')}")
                result = await handler(**args)

                if result.get("error"):
                    logger.warning(f"Tool {func_name} returned error: {str(result.get('error'))[:200]}")
                else:
                    logger.info(f"Tool {func_name} succeeded")

                if cache_key and not result.get("error"):
                    self._cache.set(cache_key, result)

                return result
            except Exception as e:
                logger.error(f"Tool {func_name} failed: {e}")
                return {"error": str(e)}

        tasks = [execute_single(tc) for tc in tool_calls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        return [
            r if not isinstance(r, Exception) else {"error": str(r)} for r in results
        ]

    async def _call_api_with_tools(
        self,
        messages: list[dict],
        tools: Optional[list] = None,
        timeout: int = 120,
        user_api_key: str = "",
    ) -> Optional[dict]:
        """Call upstream Pollinations AI. Uses user's API key if provided."""
        token = self._get_ai_token(user_api_key)
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        url = f"{self.config.pollinations_api_base}/v1/chat/completions"
        last_error = None

        for attempt in range(MAX_RETRIES):
            seed = random.randint(0, MAX_SEED)

            payload = {
                "model": self.config.pollinations_model,
                "messages": messages,
                "seed": seed,
            }

            if tools:
                payload["tools"] = tools
                payload["tool_choice"] = "auto"

            try:
                session = await self.get_session()
                logger.debug(f"API attempt {attempt + 1}/{MAX_RETRIES} with seed {seed}")

                async with session.post(
                    url, json=payload, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        message = data["choices"][0]["message"]

                        if message.get("tool_calls"):
                            raw_names = [tc["function"]["name"] for tc in message["tool_calls"]]
                            logger.info(f"API returned tool calls: {raw_names}")

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
                        logger.warning(f"API error (attempt {attempt + 1}): {last_error}")

            except asyncio.TimeoutError:
                last_error = f"Timeout after {timeout}s"
                logger.warning(f"API timeout (attempt {attempt + 1})")
            except aiohttp.ClientError as e:
                last_error = f"Network error: {e}"
                logger.warning(f"Network error (attempt {attempt + 1}): {e}")
            except Exception as e:
                last_error = f"Error: {e}"
                logger.warning(f"API error (attempt {attempt + 1}): {e}")

            if attempt < MAX_RETRIES - 1:
                logger.info(f"Retrying in {RETRY_DELAY}s...")
                await asyncio.sleep(RETRY_DELAY)

        logger.error(f"All {MAX_RETRIES} API attempts failed. Last error: {last_error}")
        return None
