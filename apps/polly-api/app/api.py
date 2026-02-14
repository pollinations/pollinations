"""API endpoints - OpenAI-compatible /v1/chat/completions."""

import logging
import time
import uuid

from fastapi import APIRouter, HTTPException

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


@router.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest) -> ChatCompletionResponse:
    """OpenAI-compatible chat completions endpoint."""
    if _polly_client is None:
        raise HTTPException(status_code=503, detail="Service not ready")

    if request.stream:
        raise HTTPException(
            status_code=400,
            detail="Streaming is not supported. Polly uses server-side tool calling which requires non-streaming mode.",
        )

    # Convert Pydantic messages to dicts
    messages = [msg.model_dump(exclude_none=True) for msg in request.messages]

    # Extract user message for tool filtering
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
            is_admin=False,
            user_message=user_message,
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
        raise HTTPException(status_code=500, detail=str(e))


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
