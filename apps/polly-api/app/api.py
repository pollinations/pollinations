"""API endpoints - OpenAI-compatible /v1/chat/completions."""

import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Request

from .models import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    Choice,
    ModelInfo,
    ModelList,
    Usage,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Set by main.py on startup
_polly_client = None


def set_client(client):
    """Set the PollyClient instance for API handlers."""
    global _polly_client
    _polly_client = client


def _extract_bearer_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return ""


@router.post("/v1/chat/completions")
async def chat_completions(request: Request, body: ChatCompletionRequest) -> ChatCompletionResponse:
    """OpenAI-compatible chat completions endpoint.

    The user's API key (from Authorization header) is passed through
    to all upstream Pollinations AI calls. GitHub tools use server-side tokens.
    """
    if _polly_client is None:
        raise HTTPException(status_code=503, detail="Service not ready")

    if body.stream:
        raise HTTPException(
            status_code=400,
            detail="Streaming is not supported. Polly uses server-side tool calling which requires non-streaming mode.",
        )

    # Grab user's API key from the request — this is what gen.pollinations.ai forwarded
    user_api_key = _extract_bearer_token(request)

    # Convert Pydantic messages to dicts
    messages = [msg.model_dump(exclude_none=True) for msg in body.messages]

    # Extract user message text for tool filtering
    user_message = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, str):
                user_message = content
            elif isinstance(content, list):
                # Multimodal: extract text parts
                user_message = " ".join(
                    part.get("text", "") for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                )
            if user_message:
                break

    try:
        result = await _polly_client.process_with_tools(
            messages=messages,
            user_message=user_message,
            user_api_key=user_api_key,
        )

        response_text = result.get("response", "")
        if not response_text and result.get("error"):
            response_text = "Sorry, I had trouble processing that. Please try again."

        return ChatCompletionResponse(
            id=f"chatcmpl-{uuid.uuid4().hex[:12]}",
            created=int(time.time()),
            model="polly",
            choices=[
                Choice(
                    index=0,
                    message=ChatMessage(role="assistant", content=response_text),
                    finish_reason="stop",
                )
            ],
            usage=Usage(
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=0,
            ),
        )

    except Exception as e:
        logger.error(f"Chat completions error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal processing error")


@router.get("/v1/models")
async def list_models() -> ModelList:
    """List available models."""
    return ModelList(
        data=[
            ModelInfo(
                id="polly",
                created=int(time.time()),
                owned_by="pollinations",
            )
        ]
    )
