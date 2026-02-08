"""
Multi-model router for the coding agent using Pollinations API.

All models are accessed through Pollinations API:
- gemini-large: Understanding - large context for codebase analysis
- claude-large: Coding - best code quality
- claude: Testing, quick fixes - fast iteration
- kimi-k2-thinking: Autonomous reviewer - replaces human-in-the-loop
"""

import asyncio
import json
import logging
import random
from typing import Optional, Literal
from dataclasses import dataclass, field

import aiohttp

from ...config import config
from ...constants import POLLINATIONS_API_BASE

logger = logging.getLogger(__name__)

TaskType = Literal["planning", "coding", "testing", "review", "understanding", "search", "quick"]

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 5
MAX_SEED = 2**31 - 1

# Pollinations API URL
POLLINATIONS_CHAT_URL = f"{POLLINATIONS_API_BASE}/v1/chat/completions"


@dataclass
class ModelConfig:
    """Configuration for a model."""
    name: str  # Pollinations model name
    max_tokens: int
    supports_tools: bool = True
    supports_vision: bool = False
    # Thinking/reasoning config
    thinking_enabled: bool = False
    thinking_budget: int = 0  # 0 = disabled
    reasoning_effort: str = "low"  # low, medium, high


# Model configurations optimized for coding agent tasks
# Using Pollinations API model names
MODELS = {
    "gemini-large": ModelConfig(
        name="gemini-large",  # Large context for codebase analysis
        max_tokens=65536,
        supports_tools=True,
        supports_vision=True,
        thinking_enabled=False,
    ),
    "claude-large": ModelConfig(
        name="claude-large",  # Best code quality
        max_tokens=64000,
        supports_tools=True,
        supports_vision=True,
        thinking_enabled=False,
    ),
    "claude": ModelConfig(
        name="claude",  # Fast iteration
        max_tokens=16000,
        supports_tools=True,
        supports_vision=True,
        thinking_enabled=False,
    ),
    "kimi-k2-thinking": ModelConfig(
        name="kimi-k2-thinking",  # Deep thinking for code review
        max_tokens=32000,
        supports_tools=True,
        supports_vision=False,
        thinking_enabled=True,
        thinking_budget=10000,
        reasoning_effort="high",
    ),
    # Perplexity models for web search
    "perplexity-fast": ModelConfig(
        name="perplexity-fast",  # Simple web search
        max_tokens=8192,
        supports_tools=False,
        supports_vision=False,
        thinking_enabled=False,
    ),
    "perplexity-reasoning": ModelConfig(
        name="perplexity-reasoning",  # Complex/logical web search
        max_tokens=16000,
        supports_tools=False,
        supports_vision=False,
        thinking_enabled=True,
        thinking_budget=5000,
        reasoning_effort="medium",
    ),
}

# Task to model mapping
TASK_MODEL_MAP: dict[TaskType, str] = {
    "understanding": "gemini-large",      # 1. Large context for codebase
    "planning": "claude",                 # 2. Planning
    "coding": "claude-large",             # 3. Best code quality
    "testing": "claude",                  # 4. Fast iteration
    "review": "kimi-k2-thinking",         # 5. Deep thinking for review
    "search": "perplexity-fast",          # 6. Web search (fast default)
    "quick": "claude",                    # 7. Quick tasks
}

# Optimal parameters per task type for coding
TASK_PARAMS: dict[TaskType, dict] = {
    "understanding": {
        "temperature": 0.3,  # Low for accurate analysis
        "top_p": 0.9,
        "frequency_penalty": 0,
        "presence_penalty": 0,
    },
    "planning": {
        "temperature": 0.7,  # Balanced for creative planning
        "top_p": 0.95,
        "frequency_penalty": 0.1,  # Slight penalty to avoid repetition
        "presence_penalty": 0.1,
    },
    "coding": {
        "temperature": 0.2,  # Low for precise code generation
        "top_p": 0.9,
        "frequency_penalty": 0,
        "presence_penalty": 0,
    },
    "testing": {
        "temperature": 0.3,  # Low for accurate fixes
        "top_p": 0.9,
        "frequency_penalty": 0,
        "presence_penalty": 0,
    },
    "review": {
        "temperature": 0.4,  # Moderate for thoughtful review
        "top_p": 0.9,
        "frequency_penalty": 0,
        "presence_penalty": 0.1,  # Encourage covering new points
    },
    "search": {
        "temperature": 0.3,  # Focused search results
        "top_p": 0.9,
        "frequency_penalty": 0,
        "presence_penalty": 0,
    },
    "quick": {
        "temperature": 0.3,  # Fast, focused responses
        "top_p": 0.9,
        "frequency_penalty": 0,
        "presence_penalty": 0,
    },
}


class ModelRouter:
    """Routes tasks to the optimal model via Pollinations API."""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._connector: Optional[aiohttp.TCPConnector] = None
        self._initialized = False

    async def initialize(self):
        """Initialize the aiohttp session."""
        if self._session is None or self._session.closed:
            self._connector = aiohttp.TCPConnector(
                limit=50,
                limit_per_host=20,
                keepalive_timeout=60,
                enable_cleanup_closed=True,
                ttl_dns_cache=300,
                use_dns_cache=True
            )
            self._session = aiohttp.ClientSession(
                connector=self._connector,
                timeout=aiohttp.ClientTimeout(total=600, connect=10)  # 10 min for long operations
            )
        self._initialized = True
        logger.info("ModelRouter initialized with Pollinations API")

    async def get_session(self) -> aiohttp.ClientSession:
        """Get or create the aiohttp session."""
        if self._session is None or self._session.closed:
            await self.initialize()
        if self._session is None:
            raise RuntimeError("Failed to initialize aiohttp session")
        return self._session

    def get_model_for_task(self, task_type: TaskType, context_size: int = 0) -> str:
        """
        Get the optimal model for a task.

        Args:
            task_type: Type of task (planning, coding, testing, review, understanding)
            context_size: Size of context in tokens (for auto-routing to large context models)

        Returns:
            Model identifier
        """
        # If context is huge, always use Gemini for its 1M context
        if context_size > 150000:
            logger.info(f"Context size {context_size} > 150K, routing to gemini-large")
            return "gemini-large"

        return TASK_MODEL_MAP.get(task_type, "claude")

    def get_config(self, model_id: str) -> ModelConfig:
        """Get configuration for a model."""
        return MODELS.get(model_id, MODELS["claude"])

    async def chat(
        self,
        model_id: str,
        messages: list[dict],
        task_type: Optional[TaskType] = None,
        tools: Optional[list[dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        json_response: bool = False,
    ) -> dict:
        """
        Send a chat completion request via Pollinations API.

        Args:
            model_id: Model to use (gemini-large, claude-large, claude, kimi-k2-thinking)
            messages: Chat messages
            task_type: Optional task type for optimal parameter selection
            tools: Optional tool definitions (OpenAI format)
            temperature: Override temperature (uses task defaults if not set)
            max_tokens: Max tokens to generate
            json_response: Whether to request JSON response format

        Returns:
            Response dict with 'content', 'tool_calls', 'thinking' (if applicable)
        """
        if not self._initialized:
            await self.initialize()

        model_config = MODELS.get(model_id, MODELS["claude"])

        # Get task-specific parameters or defaults
        task_params = TASK_PARAMS.get(task_type, {}) if task_type else {}

        # Build payload with all Pollinations-supported parameters
        payload = self._build_payload(
            model_config=model_config,
            messages=messages,
            task_params=task_params,
            tools=tools,
            temperature=temperature,
            max_tokens=max_tokens,
            json_response=json_response,
        )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.pollinations_token}"
        }

        last_error = None

        for attempt in range(MAX_RETRIES):
            # New seed per attempt
            payload["seed"] = random.randint(0, MAX_SEED)

            try:
                session = await self.get_session()
                logger.debug(f"Pollinations API call to {model_id} (attempt {attempt + 1}/{MAX_RETRIES})")

                async with session.post(
                    POLLINATIONS_CHAT_URL,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=600)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return self._parse_response(data, model_config)
                    else:
                        error_text = await response.text()
                        last_error = f"HTTP {response.status}: {error_text[:200]}"
                        logger.warning(f"Pollinations API error (attempt {attempt + 1}): {last_error}")

            except asyncio.TimeoutError:
                last_error = "Timeout after 600s"
                logger.warning(f"API timeout (attempt {attempt + 1})")
            except aiohttp.ClientError as e:
                last_error = f"Network error: {e}"
                logger.warning(f"Network error (attempt {attempt + 1}): {e}")
            except Exception as e:
                last_error = f"Error: {e}"
                logger.exception(f"API error (attempt {attempt + 1})")

            # Wait before retry
            if attempt < MAX_RETRIES - 1:
                logger.info(f"Retrying in {RETRY_DELAY}s...")
                await asyncio.sleep(RETRY_DELAY)

        # All retries failed
        logger.error(f"All {MAX_RETRIES} API attempts failed for {model_id}. Last error: {last_error}")
        return {"content": "", "tool_calls": [], "thinking": None, "error": last_error}

    def _build_payload(
        self,
        model_config: ModelConfig,
        messages: list[dict],
        task_params: dict,
        tools: Optional[list[dict]],
        temperature: Optional[float],
        max_tokens: Optional[int],
        json_response: bool,
    ) -> dict:
        """Build the full API payload with optimal parameters."""
        payload = {
            "model": model_config.name,
            "messages": messages,
            "max_tokens": max_tokens or model_config.max_tokens,

            # Temperature only - some models (Claude/Bedrock) don't allow both temperature and top_p
            "temperature": temperature if temperature is not None else task_params.get("temperature", 0.7),

            # Seed for reproducibility (set per attempt)
            "seed": 0,
        }

        # Response format
        if json_response:
            payload["response_format"] = {"type": "json_object"}
        else:
            payload["response_format"] = {"type": "text"}

        # Tools
        if tools and model_config.supports_tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
            payload["parallel_tool_calls"] = True

        # Thinking/reasoning for thinking models (like Kimi K2)
        # Only send thinking params when enabled - API rejects budget_tokens: 0
        if model_config.thinking_enabled and model_config.thinking_budget > 0:
            payload["thinking"] = {
                "type": "enabled",
                "budget_tokens": model_config.thinking_budget,
            }
            payload["reasoning_effort"] = model_config.reasoning_effort

        return payload

    def _parse_response(self, data: dict, model_config: ModelConfig) -> dict:
        """Parse Pollinations API response (OpenAI-compatible format)."""
        result = {"content": "", "tool_calls": [], "thinking": None}

        choices = data.get("choices", [])
        if choices:
            message = choices[0].get("message", {})
            result["content"] = message.get("content", "") or ""
            result["tool_calls"] = message.get("tool_calls", [])

            # Extract thinking/reasoning if present
            if model_config.thinking_enabled:
                # Try different keys that might contain reasoning
                result["thinking"] = (
                    message.get("reasoning_content") or
                    message.get("thinking") or
                    message.get("reasoning") or
                    None
                )

        # Include usage info if available
        if "usage" in data:
            result["usage"] = data["usage"]

        return result

    async def chat_stream(
        self,
        model_id: str,
        messages: list[dict],
        task_type: Optional[TaskType] = None,
        tools: Optional[list[dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        """
        Stream a chat completion via Pollinations API.

        Yields chunks of content as they arrive.
        """
        if not self._initialized:
            await self.initialize()

        model_config = MODELS.get(model_id, MODELS["claude"])
        task_params = TASK_PARAMS.get(task_type, {}) if task_type else {}

        payload = self._build_payload(
            model_config=model_config,
            messages=messages,
            task_params=task_params,
            tools=tools,
            temperature=temperature,
            max_tokens=max_tokens,
            json_response=False,
        )

        # Enable streaming
        payload["stream"] = True
        payload["stream_options"] = {"include_usage": True}
        payload["seed"] = random.randint(0, MAX_SEED)

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.pollinations_token}"
        }

        try:
            session = await self.get_session()

            async with session.post(
                POLLINATIONS_CHAT_URL,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=600)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"Stream error: HTTP {response.status}: {error_text[:200]}")
                    return

                async for line in response.content:
                    line = line.decode("utf-8").strip()
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue

        except Exception as e:
            logger.exception(f"Stream error: {e}")

    async def web_search(
        self,
        query: str,
        reasoning: bool = False,
        max_results: int = 5,
    ) -> dict:
        """
        Perform a web search using search-enabled models.

        Args:
            query: Search query
            reasoning: Use reasoning model for complex searches
            max_results: Maximum number of results to return

        Returns:
            dict with 'content' (search results), 'sources' (if available)
        """
        # Choose model based on reasoning needs
        # Default: perplexity-fast for quick searches
        # For complex/in-depth: perplexity-reasoning
        model_id = "perplexity-reasoning" if reasoning else "perplexity-fast"

        messages = [
            {
                "role": "system",
                "content": f"""You are a web search assistant. Search for the most relevant, up-to-date information.
Return {max_results} most relevant results with:
- Title
- URL (if available)
- Brief summary
- Key facts

Focus on authoritative sources. Include dates when relevant.""",
            },
            {
                "role": "user",
                "content": query,
            },
        ]

        result = await self.chat(
            model_id=model_id,
            messages=messages,
            task_type="search",
            temperature=0.2,  # Low for factual search
        )

        return {
            "content": result.get("content", ""),
            "sources": result.get("sources", []),  # Some models return sources
            "thinking": result.get("thinking"),  # Reasoning trace if available
            "model": model_id,
        }

    async def search_for_code_context(
        self,
        topic: str,
        language: str = "python",
    ) -> dict:
        """
        Search for code-related information (docs, examples, best practices).

        Uses Perplexity reasoning for deeper technical searches.
        """
        query = f"""Search for the latest documentation, examples, and best practices for:
Topic: {topic}
Language: {language}

Focus on:
1. Official documentation
2. Recent GitHub examples
3. Best practices and common patterns
4. Known issues or gotchas

Return structured information that would help implement this in code."""

        return await self.web_search(query, reasoning=True, max_results=5)

    async def search_error(self, error_message: str, context: str = "") -> dict:
        """
        Search for help with an error message.

        Uses fast search for quick error lookups.
        """
        query = f"""How to fix this error:
{error_message}

Context: {context}

Find:
1. Common causes
2. Solutions that worked for others
3. Related GitHub issues or Stack Overflow answers"""

        return await self.web_search(query, reasoning=False, max_results=5)

    async def close(self):
        """Close the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
        if self._connector:
            await self._connector.close()
            self._connector = None
        self._initialized = False


# Global router instance
model_router = ModelRouter()
