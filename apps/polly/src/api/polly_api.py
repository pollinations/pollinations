import logging
import time
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..services.pollinations import UpstreamAuthError, _auth_override

logger = logging.getLogger(__name__)


class Message(BaseModel):
    role: str
    content: str | list | None = None


class ChatRequest(BaseModel):
    """OpenAI-compatible chat completion request.

    Accepts all standard OpenAI parameters. Generation params (temperature,
    max_tokens, etc.) are passed through to the underlying model.
    """

    messages: list[Message]
    model: str | None = None  # ignored — always routes to polly

    # Generation parameters — all passed through to the underlying LLM
    temperature: float | None = None
    max_tokens: int | None = None
    top_p: float | None = None
    top_k: int | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    repetition_penalty: float | None = None
    logit_bias: dict | None = None
    stop: str | list[str] | None = None
    seed: int | None = None
    response_format: dict | None = None
    reasoning_effort: str | None = None
    thinking: dict | None = None
    thinking_budget: int | None = None

    # Streaming
    stream: bool | None = False
    stream_options: dict | None = None

    # Modalities
    modalities: list[str] | None = None
    audio: dict | None = None

    # Tool use
    tools: list | None = None
    tool_choice: str | dict | None = None
    parallel_tool_calls: bool | None = None

    # Other
    user: str | None = None
    logprobs: bool | None = None
    top_logprobs: int | None = None
    n: int | None = None

    # Deprecated but supported
    function_call: str | dict | None = None
    functions: list | None = None

    # Polly-specific (Discord bot context)
    user_name: str | None = "http_user"
    image_urls: list[str] | None = None
    video_urls: list[str] | None = None
    file_urls: list[str] | None = None

    model_config = {"extra": "ignore"}


# OpenAI params to pass through to the underlying LLM
_PASSTHROUGH_KEYS = (
    "temperature",
    "max_tokens",
    "top_p",
    "top_k",
    "frequency_penalty",
    "presence_penalty",
    "repetition_penalty",
    "logit_bias",
    "stop",
    "seed",
    "n",
    "response_format",
    "reasoning_effort",
    "thinking",
    "thinking_budget",
    "modalities",
    "audio",
    "logprobs",
    "top_logprobs",
    "parallel_tool_calls",
    "user",
    "function_call",
    "functions",
)


def create_api_app(pollinations_client, config):
    """Create FastAPI app that shares the bot's services.

    No lifespan — bot handles init/shutdown.
    No tool registration — uses bot's pollinations_client directly.
    Key pass-through — user's Authorization header is forwarded to gen.pollinations.ai.
    """
    app = FastAPI(title="Polly API", description="OpenAI-compatible API for Polly")
    app.state.start_time = time.time()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:5174",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/v1/chat/completions")
    async def chat_completions(request: ChatRequest, raw_request: Request):
        # Pass through user's API key — no cross-contamination with bot's key
        auth_header = raw_request.headers.get("authorization", "")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            raise HTTPException(
                status_code=401,
                detail="Authorization header required. Use 'Bearer <your-pollinations-api-key>'",
            )
        _auth_override.set(auth_header)

        if request.stream:
            raise HTTPException(
                status_code=400,
                detail="Streaming is not supported for the polly model. Use stream=false.",
            )

        thread_history = None

        if len(request.messages) > 1:
            thread_history = [{"role": m.role, "content": m.content} for m in request.messages[:-1]]

        user_message = request.messages[-1].content if request.messages else ""
        # content can be a list of content parts — extract text
        if isinstance(user_message, list):
            user_message = " ".join(
                part.get("text", "") for part in user_message if isinstance(part, dict) and part.get("type") == "text"
            )

        # Collect ALL OpenAI params to pass through to the underlying model
        api_params: dict[str, Any] = {}
        for key in _PASSTHROUGH_KEYS:
            val = getattr(request, key, None)
            if val is not None:
                api_params[key] = val

        try:
            result = await pollinations_client.process_with_tools(
                user_message=user_message,
                discord_username=request.user_name,
                thread_history=thread_history,
                image_urls=request.image_urls or [],
                video_urls=request.video_urls or [],
                file_urls=request.file_urls or [],
                is_admin=False,  # API users are never admin
                tool_context={
                    "is_admin": False,
                    "user_name": request.user_name,
                    "is_http_api": True,
                },
                mode="api",
                api_params=api_params,
            )

            content = result.get("response", "")
            tool_calls = result.get("tool_calls") or []
            usage = result.get("usage") or {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            }

            # Build OpenAI-compatible response
            message: dict[str, Any] = {"role": "assistant", "content": content}
            if tool_calls:
                message["tool_calls"] = tool_calls

            return JSONResponse(content={
                "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "polly",
                "choices": [
                    {
                        "index": 0,
                        "message": message,
                        "finish_reason": "tool_calls" if tool_calls else "stop",
                    }
                ],
                "usage": usage,
            })
        except UpstreamAuthError as e:
            raise HTTPException(status_code=e.status_code, detail=e.detail)
        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
        finally:
            # Clear override so Discord bot path is never affected
            _auth_override.set("")

    @app.get("/health")
    async def health_check():
        uptime = time.time() - app.state.start_time
        return {
            "status": "healthy",
            "bot_name": config.bot_name,
            "uptime_seconds": int(uptime),
            "mode": "embedded",
        }

    return app
