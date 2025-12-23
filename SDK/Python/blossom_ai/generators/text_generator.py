# blossom_ai/generators/text_generator.py

"""
Text Generator using unified endpoints from config.
Security-hardened version: fixes error handling, DoS vectors, and resource management.

"""

import asyncio
import json
from typing import Optional, Dict, Any, List, Final, Union

import httpx
from pydantic import BaseModel, Field, validator
from pydantic import ValidationError as PydanticValidationError

from blossom_ai.core.config import ENDPOINTS
from blossom_ai.core.interfaces import (
    ConfigProtocol,
    HttpClientProtocol,
    LoggerProtocol,
    RateLimiterInterface,
    TextGeneratorInterface,
    CacheBackendProtocol,
)
from blossom_ai.generators.base_generator import BaseGenerator
from blossom_ai.generators.parameter_builder import ChatParamsV2, DEFAULTS
from blossom_ai.core.models import TextModel, DEFAULT_TEXT_MODELS
from blossom_ai.core.errors import (
    BlossomError,
    ErrorType,
    EmptyResponseError,
    ValidationError,
    Blossom520Error,
    RateLimitError,
    AuthenticationError,
    StreamError,
    handle_validation_error,
)


# Pydantic models for response validation
class ChatChoiceDelta(BaseModel):
    content: Optional[str] = None
    reasoning_content: Optional[str] = None


class ChatChoice(BaseModel):
    delta: Optional[ChatChoiceDelta] = None
    message: Optional[Dict[str, Any]] = None
    finish_reason: Optional[str] = None


class ChatUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatResponse(BaseModel):
    choices: List[ChatChoice] = Field(min_items=1)
    usage: Optional[ChatUsage] = None
    error: Optional[Dict[str, Any]] = None

    @validator('error', pre=True)
    def check_error(cls, v):
        if v is not None:
            raise ValueError(f"API error in response: {v}")
        return v


class TextGenerator(BaseGenerator, TextGeneratorInterface):

    MAX_RESPONSE_SIZE: Final[int] = 50 * 1024 * 1024  # 50MB
    MAX_STREAM_CHUNK_SIZE: Final[int] = 1024 * 1024  # 1MB per chunk

    def __init__(
            self,
            config: ConfigProtocol,
            http_client: Optional[HttpClientProtocol] = None,
            logger: Optional[LoggerProtocol] = None,
            rate_limiter: Optional[RateLimiterInterface] = None,
            cache: Optional[CacheBackendProtocol] = None,
    ):
        super().__init__(
            config=config,
            http_client=http_client,
            logger=logger,
            rate_limiter=rate_limiter,
            cache=cache,
        )
        self.logger.info("TextGenerator initialised", endpoint=ENDPOINTS.TEXT_CHAT)

    def _prepare_request_data(self, **kwargs: Any) -> Dict[str, Any]:
        return {
            "messages": kwargs.get("messages", []),
            "model": kwargs.get("model", "openai"),
            "max_tokens": kwargs.get("max_tokens", 1000),
            **kwargs,
        }

    def _parse_response(self, response: httpx.Response) -> str:

        # Check response size first
        content_length = len(response.content) if response.content else 0
        if content_length > self.MAX_RESPONSE_SIZE:
            raise BlossomError(
                f"Response too large: {content_length} bytes (max {self.MAX_RESPONSE_SIZE})",
                error_type=ErrorType.API,
                suggestion="Reduce max_tokens or use streaming for large text responses"
            )

        # Handle 520 error specifically
        if response.status_code == 520:
            raise Blossom520Error(
                message="Cloudflare 520 Unknown Error: Configuration or proxy issue",
                context={
                    "url": str(response.url),
                    "method": response.request.method if response.request else "POST"
                }
            )

        try:
            data = ChatResponse.model_validate_json(response.content)
            first = data.choices[0]

            # Check for empty content
            content = None
            if first.message and first.message.get("content"):
                content = first.message["content"]
            elif first.delta and first.delta.content:
                content = first.delta.content
            elif first.message and first.message.get("reasoning_content"):
                content = first.message["reasoning_content"]
                self.logger.warning("Using reasoning_content instead of content")

            if not content or not content.strip():
                raise EmptyResponseError(
                    "API returned empty content",
                    context={
                        "finish_reason": first.finish_reason,
                        "has_message": bool(first.message),
                        "has_delta": bool(first.delta),
                        "status_code": response.status_code,
                    },
                    suggestion="Try increasing max_tokens, using a different model, or check if the model supports your request type"
                )

            return content

        except PydanticValidationError as e:
            content_preview = self._get_content_preview(response)
            self.logger.error(f"Invalid JSON response: {e}, Response: {content_preview}")
            raise BlossomError(
                "Invalid JSON response from API",
                ErrorType.API,
                original_error=e,
                suggestion="Check API response format or report to maintainers"
            )
        except EmptyResponseError:
            raise
        except Blossom520Error:
            raise
        except Exception as e:
            content_preview = self._get_content_preview(response)
            self.logger.error(f"Unexpected error parsing response: {e}, Response: {content_preview}")
            raise BlossomError(
                "Failed to parse API response",
                ErrorType.API,
                suggestion="Check API documentation or network connectivity",
                original_error=e
            )

    def _get_content_preview(self, response: httpx.Response, max_length: int = 500) -> str:
        """Safely get content preview for error messages."""
        try:
            if hasattr(response, 'content') and response.content is not None:
                return response.content[:max_length].decode('utf-8', errors='ignore')
            return "No content"
        except Exception:
            return "Unable to read content"

    # === Public API with validation ===

    async def generate(
            self,
            prompt: str,
            model: Optional[str] = None,
            max_tokens: Optional[int] = None,
            stream: bool = False,
            **kwargs: Any,
    ) -> str:

        # Validate prompt
        if not prompt or not isinstance(prompt, str):
            raise handle_validation_error(
                param_name="prompt",
                param_value=str(prompt)[:50],
                reason="must be a non-empty string"
            )

        prompt = prompt.strip()
        if not prompt:
            raise handle_validation_error(
                param_name="prompt",
                param_value="",
                reason="cannot be empty or whitespace only"
            )

        # Reject unsupported parameters
        if 'temperature' in kwargs:
            raise handle_validation_error(
                param_name="temperature",
                param_value=kwargs['temperature'],
                reason="temperature parameter is not supported by pollinations.ai API. Use model selection for style control."
            )

        # Set defaults
        if max_tokens is None:
            max_tokens = 2000

        self.logger.info(
            "Generating text",
            prompt=prompt[:100] + "...",
            model=model or "openai",
            max_tokens=max_tokens,
            stream=stream
        )

        messages = [{"role": "user", "content": prompt}]
        text_model = TextModel.from_string(model or "openai")

        params_kwargs = {
            "model": text_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": stream,
        }

        # Filter out None values
        params_kwargs.update({k: v for k, v in kwargs.items() if v is not None})

        try:
            params = ChatParamsV2(**params_kwargs)
            request_body = params.to_body()
            self.logger.debug("Request body prepared", body_keys=list(request_body.keys()))
        except Exception as e:
            self.logger.error("Failed to prepare request parameters", error=str(e))
            raise handle_validation_error(
                param_name="kwargs",
                param_value=str(kwargs)[:100],
                reason=f"invalid parameters: {e}",
                suggestion="Check parameter types and values"
            )

        # Execute request
        try:
            if stream:
                return await self._handle_streaming_generate(request_body)

            response = await self._async_request(
                "POST",
                ENDPOINTS.TEXT_CHAT,
                json_data=request_body,
                headers=self._get_auth_headers(),
                endpoint_type="default"
            )

            result = self._parse_response(response)
            self.logger.info("Text generation completed", length=len(result))
            return result

        except Blossom520Error:
            raise
        except RateLimitError:
            raise
        except AuthenticationError:
            raise
        except Exception as e:
            self.logger.error("Text generation failed", error=str(e))
            raise

    def __call__(self, prompt: str, **kwargs: Any) -> str:
        """Synchronous text generation with safety checks."""
        if not prompt or not isinstance(prompt, str):
            raise handle_validation_error(
                param_name="prompt",
                param_value=str(prompt)[:50],
                reason="must be a non-empty string"
            )

        from blossom_ai.utils.async_utils import _run_async
        return _run_async(self.generate(prompt, **kwargs))

    def generate_sync(self, prompt: str, **kwargs: Any) -> str:
        """Alias for __call__."""
        return self(prompt, **kwargs)

    async def _handle_streaming_generate(self, request_body: Dict[str, Any]) -> str:

        full_content = []
        error_occurred = None

        # FIXED: Add timeout for entire streaming operation
        stream_timeout = self.config.timeout * 2  # 2x normal timeout for streaming

        try:
            async with asyncio.timeout(stream_timeout):  # Python 3.11+
                async with self.http_client.stream(
                    "POST",
                    ENDPOINTS.TEXT_CHAT,
                    json=request_body,
                    headers=self._get_auth_headers(),
                    timeout=self.config.timeout
                ) as response:

                    # Check for immediate errors
                    if response.status_code == 520:
                        raise Blossom520Error(
                            message="Cloudflare 520 Unknown Error during streaming",
                            context={"url": str(response.url)}
                        )
                    elif response.status_code == 429:
                        raise RateLimitError(retry_after=60)
                    elif response.status_code == 401:
                        raise AuthenticationError("Authentication failed during streaming")
                    elif response.status_code >= 500:
                        error_text = await response.aread()
                        raise BlossomError(
                            f"Server error {response.status_code} during streaming",
                            error_type=ErrorType.API
                        )

                    buffer = ""
                    chunk_timeout = 30.0  # 30 seconds per chunk

                    async for line in response.aiter_lines():
                        try:
                            async with asyncio.timeout(chunk_timeout):
                                line = line.strip()
                                if not line:
                                    continue

                                buffer += line
                                if not buffer.startswith("data: "):
                                    buffer = ""
                                    continue

                                data = buffer[6:]
                                if data == "[DONE]":
                                    break

                                chunk = json.loads(data)
                                choices = chunk.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        full_content.append(content)

                                buffer = ""

                        except asyncio.TimeoutError:
                            self.logger.error("Chunk timeout in streaming")
                            raise StreamError(
                                "Streaming chunk timeout - connection may be unstable",
                                suggestion="Try non-streaming mode or check network"
                            )
                        except json.JSONDecodeError as e:
                            self.logger.warning(f"Failed to parse streaming chunk: {buffer[:100]}")
                            if error_occurred is None:
                                error_occurred = e
                            buffer = ""
                            continue
                        except Exception as e:
                            self.logger.error(f"Unexpected error in streaming: {e}")
                            raise StreamError(
                                f"Streaming failed: {e}",
                                suggestion="Try non-streaming mode or check connection"
                            )

        except asyncio.TimeoutError:
            self.logger.error(f"Streaming timeout after {stream_timeout}s")
            raise StreamError(
                f"Streaming timed out after {stream_timeout}s",
                suggestion="Try increasing timeout or use non-streaming mode"
            )

        result = "".join(full_content)

        if not result and error_occurred:
            raise StreamError(
                "All streaming chunks failed to parse",
                original_error=error_occurred,
                suggestion="Check API response format or network stability"
            )

        if not result:
            raise EmptyResponseError(
                "Streaming completed but no content received",
                suggestion="Try increasing max_tokens or use non-streaming mode"
            )

        return result

    async def chat(
            self,
            messages: List[Dict[str, str]],
            model: Optional[str] = None,
            max_tokens: Optional[int] = None,
            stream: bool = False,
            **kwargs: Any,
    ) -> str:

        # Validate messages
        if not messages or not isinstance(messages, list):
            raise handle_validation_error(
                param_name="messages",
                param_value=str(messages)[:50],
                reason="must be a non-empty list"
            )

        # Validate each message
        for i, msg in enumerate(messages):
            if not isinstance(msg, dict):
                raise handle_validation_error(
                    param_name=f"messages[{i}]",
                    param_value=str(msg)[:50],
                    reason="must be a dictionary"
                )

            if "content" not in msg or not msg["content"]:
                raise handle_validation_error(
                    param_name=f"messages[{i}].content",
                    param_value="",
                    reason="cannot be empty"
                )

            if "role" not in msg or msg["role"] not in {"user", "assistant", "system"}:
                raise handle_validation_error(
                    param_name=f"messages[{i}].role",
                    param_value=msg.get("role"),
                    reason="must be 'user', 'assistant', or 'system'"
                )

        # Reject temperature
        if 'temperature' in kwargs:
            raise handle_validation_error(
                param_name="temperature",
                param_value=kwargs['temperature'],
                reason="not supported by pollinations.ai API",
                suggestion="Remove temperature parameter"
            )

        if max_tokens is None:
            max_tokens = 2000

        self.logger.info(
            "Chat request",
            message_count=len(messages),
            model=model,
            stream=stream,
        )

        text_model = TextModel.from_string(model or "openai")

        params_kwargs = {
            "model": text_model,
            "messages": messages,
            "stream": stream,
            "max_tokens": max_tokens,
        }
        params_kwargs.update({k: v for k, v in kwargs.items() if v is not None})

        try:
            params = ChatParamsV2(**params_kwargs)
            request_body = params.to_body()
            self.logger.debug("Chat request body prepared", has_messages=len(messages))
        except Exception as e:
            self.logger.error("Failed to prepare chat parameters", error=str(e))
            raise handle_validation_error(
                param_name="kwargs",
                param_value=str(kwargs)[:100],
                reason=f"invalid parameters: {e}"
            )

        # Execute request
        try:
            if stream:
                return await self._handle_streaming_chat(request_body)

            response = await self._async_request(
                "POST",
                ENDPOINTS.TEXT_CHAT,
                json_data=request_body,
                headers=self._get_auth_headers(),
                endpoint_type="default"
            )

            result = self._parse_response(response)
            self.logger.info("Chat response completed", length=len(result))
            return result

        except Blossom520Error:
            raise
        except RateLimitError:
            raise
        except AuthenticationError:
            raise
        except Exception as e:
            self.logger.error("Chat failed", error=str(e))
            raise

    def chat_sync(self, messages: List[Dict[str, str]], **kwargs: Any) -> str:
        """Synchronous chat."""
        from blossom_ai.utils.async_utils import _run_async
        return _run_async(self.chat(messages, **kwargs))

    async def _handle_streaming_chat(self, request_body: Dict[str, Any]) -> str:
        """Handle streaming chat with proper error handling."""
        return await self._handle_streaming_generate(request_body)

    def models(self) -> List[str]:
        """Return list of available text models."""
        return DEFAULT_TEXT_MODELS

    # === Resource Management ===

    async def close(self) -> None:

        try:
            await super().close()
            self.logger.info("TextGenerator closed successfully")
        except Exception as e:
            self.logger.error("Error during TextGenerator shutdown", error=str(e))


class AsyncTextGenerator(TextGenerator):
    """Async alias with identical implementation."""
    pass