import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..ai.client import UpstreamAuthError, _auth_override
from ..utils.json import dumps
from ..utils.uuid import uuid4_hex

logger = logging.getLogger(__name__)


class Message(BaseModel):
    role: str
    content: Any = None
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    messages: list[Message] = Field(min_length=1)
    model: str = "polli"
    stream: bool = False
    stream_options: dict[str, Any] | None = None
    user_name: str = "http_user"
    image_urls: list[str] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)
    file_urls: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_model(self):
        if self.model != "polli":
            raise ValueError(f"The model '{self.model}' does not exist")
        return self


class ResponsesRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str = "polli"
    input: str | list[dict[str, Any]]
    instructions: str | None = None
    stream: bool = False
    user_name: str = "http_user"


_LOCAL_KEYS = {
    "messages",
    "model",
    "stream",
    "stream_options",
    "user_name",
    "image_urls",
    "video_urls",
    "file_urls",
}


def _error(message: str, status: int, code: str | None = None, param: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "error": {
                "message": message,
                "type": "invalid_request_error",
                "param": param,
                "code": code,
            }
        },
    )


def _authorization(request: Request) -> str | None:
    value = request.headers.get("authorization", "")
    return value if value.lower().startswith("bearer ") else None


def _request_args(request: ChatRequest) -> dict[str, Any]:
    messages = [message.model_dump(exclude_none=True) for message in request.messages]
    last_user = next((message for message in reversed(messages) if message.get("role") == "user"), {})
    content = last_user.get("content", "")
    if isinstance(content, list):
        content = " ".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") in {"text", "input_text"}
        )
    params = request.model_dump(exclude_none=True, exclude=_LOCAL_KEYS)
    return {
        "user_message": content or "",
        "discord_username": request.user_name,
        "is_admin": False,
        "tool_context": {"is_admin": False, "is_http_api": True},
        "mode": "api",
        "api_params": params,
        "raw_messages": messages,
    }


def _responses_chat_request(request: ResponsesRequest) -> ChatRequest:
    messages: list[dict[str, Any]] = []
    if request.instructions:
        messages.append({"role": "system", "content": request.instructions})
    if isinstance(request.input, str):
        messages.append({"role": "user", "content": request.input})
    else:
        for item in request.input:
            item_type = item.get("type")
            if item_type == "function_call":
                call_id = item.get("call_id", item.get("id", ""))
                call = {
                    "id": call_id,
                    "type": "function",
                    "function": {"name": item.get("name", ""), "arguments": item.get("arguments", "")},
                }
                messages.append({"role": "assistant", "content": None, "tool_calls": [call]})
            elif item_type == "function_call_output":
                messages.append(
                    {"role": "tool", "tool_call_id": item.get("call_id", ""), "content": item.get("output", "")}
                )
            elif item_type == "message" or "role" in item:
                messages.append({"role": item.get("role", "user"), "content": item.get("content")})
    extras = request.model_dump(exclude_none=True, exclude={"input", "instructions", "stream", "user_name"})
    return ChatRequest.model_validate(
        {"messages": messages, "stream": request.stream, "user_name": request.user_name, **extras}
    )


def _usage(usage: dict[str, int] | None) -> dict[str, int]:
    value = usage or {}
    return {
        "prompt_tokens": value.get("prompt_tokens", value.get("input_tokens", 0)),
        "completion_tokens": value.get("completion_tokens", value.get("output_tokens", 0)),
        "total_tokens": value.get("total_tokens", 0),
    }


def _chat_response(result: dict[str, Any], completion_id: str, created: int) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": result.get("response", "")}
    if result.get("client_tool_calls"):
        message["tool_calls"] = result["client_tool_calls"]
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": "polli",
        "choices": [{"index": 0, "message": message, "finish_reason": result.get("finish_reason", "stop")}],
        "usage": _usage(result.get("usage")),
    }


def _sse(payload: dict[str, Any] | str) -> str:
    return f"data: {payload if isinstance(payload, str) else dumps(payload)}\n\n"


async def _chat_stream(client, args: dict[str, Any], auth: str, include_usage: bool) -> AsyncIterator[str]:
    completion_id = f"chatcmpl-{uuid4_hex()[:24]}"
    created = int(time.time())
    token = _auth_override.set(auth)
    try:
        yield _sse(
            {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": "polli",
                "choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": None}],
            }
        )
        usage = None
        finish_reason = "stop"
        async for event in client.stream_with_tools(**args):
            if event["type"] == "content.delta":
                yield _sse(
                    {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": "polli",
                        "choices": [{"index": 0, "delta": {"content": event["delta"]}, "finish_reason": None}],
                    }
                )
            elif event["type"] == "client.tool_call.delta":
                tool_call = {"index": 0, **event["tool_call"]}
                yield _sse(
                    {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": "polli",
                        "choices": [{"index": 0, "delta": {"tool_calls": [tool_call]}, "finish_reason": None}],
                    }
                )
            elif event["type"] == "completed":
                usage = _usage(event.get("usage"))
                finish_reason = event.get("finish_reason", "stop")
        yield _sse(
            {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": "polli",
                "choices": [{"index": 0, "delta": {}, "finish_reason": finish_reason}],
            }
        )
        if include_usage:
            yield _sse(
                {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": "polli",
                    "choices": [],
                    "usage": usage or _usage(None),
                }
            )
        yield _sse("[DONE]")
    finally:
        _auth_override.reset(token)


def _response_object(
    response_id: str,
    created: int,
    text: str,
    usage: dict[str, int] | None,
    message_id: str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    output: list[dict[str, Any]] = []
    if text or not tool_calls:
        output.append(
            {
                "id": message_id or f"msg_{uuid4_hex()[:24]}",
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{"type": "output_text", "text": text, "annotations": []}],
            }
        )
    for call in tool_calls or []:
        function = call.get("function", {})
        output.append(
            {
                "type": "function_call",
                "id": call.get("id", f"fc_{uuid4_hex()[:24]}"),
                "call_id": call.get("id", ""),
                "name": function.get("name", ""),
                "arguments": function.get("arguments", ""),
                "status": "completed",
            }
        )
    normalized = _usage(usage)
    return {
        "id": response_id,
        "object": "response",
        "created_at": created,
        "status": "completed",
        "model": "polli",
        "output": output,
        "output_text": text,
        "usage": {
            "input_tokens": normalized["prompt_tokens"],
            "output_tokens": normalized["completion_tokens"],
            "total_tokens": normalized["total_tokens"],
        },
        "error": None,
        "incomplete_details": None,
    }


async def _responses_stream(client, args: dict[str, Any], auth: str) -> AsyncIterator[str]:
    response_id = f"resp_{uuid4_hex()[:24]}"
    message_id = f"msg_{uuid4_hex()[:24]}"
    created = int(time.time())
    base = _response_object(response_id, created, "", None)
    base.update({"status": "in_progress", "output": []})
    yield _sse({"type": "response.created", "sequence_number": 0, "response": base})

    text = ""
    usage = None
    tool_calls: list[dict[str, Any]] = []
    sequence = 1
    text_started = False
    token = _auth_override.set(auth)
    try:
        async for event in client.stream_with_tools(**args):
            if event["type"] == "content.delta":
                if not text_started:
                    item = {
                        "id": message_id,
                        "type": "message",
                        "status": "in_progress",
                        "role": "assistant",
                        "content": [],
                    }
                    yield _sse(
                        {
                            "type": "response.output_item.added",
                            "sequence_number": sequence,
                            "output_index": 0,
                            "item": item,
                        }
                    )
                    sequence += 1
                    part = {"type": "output_text", "text": "", "annotations": []}
                    yield _sse(
                        {
                            "type": "response.content_part.added",
                            "sequence_number": sequence,
                            "item_id": message_id,
                            "output_index": 0,
                            "content_index": 0,
                            "part": part,
                        }
                    )
                    sequence += 1
                    text_started = True
                text += event["delta"]
                yield _sse(
                    {
                        "type": "response.output_text.delta",
                        "sequence_number": sequence,
                        "item_id": message_id,
                        "output_index": 0,
                        "content_index": 0,
                        "delta": event["delta"],
                        "logprobs": [],
                    }
                )
                sequence += 1
            elif event["type"] == "client.tool_call.delta":
                call = event["tool_call"]
                tool_calls.append(call)
                function = call.get("function", {})
                item = {
                    "type": "function_call",
                    "id": call.get("id"),
                    "call_id": call.get("id"),
                    "name": function.get("name", ""),
                    "arguments": function.get("arguments", ""),
                    "status": "completed",
                }
                output_index = int(text_started) + len(tool_calls) - 1
                yield _sse(
                    {
                        "type": "response.output_item.added",
                        "sequence_number": sequence,
                        "output_index": output_index,
                        "item": {**item, "status": "in_progress", "arguments": ""},
                    }
                )
                sequence += 1
                yield _sse(
                    {
                        "type": "response.function_call_arguments.delta",
                        "sequence_number": sequence,
                        "item_id": item["id"],
                        "output_index": output_index,
                        "delta": item["arguments"],
                    }
                )
                sequence += 1
                yield _sse(
                    {
                        "type": "response.function_call_arguments.done",
                        "sequence_number": sequence,
                        "item_id": item["id"],
                        "output_index": output_index,
                        "arguments": item["arguments"],
                    }
                )
                sequence += 1
                yield _sse(
                    {
                        "type": "response.output_item.done",
                        "sequence_number": sequence,
                        "output_index": output_index,
                        "item": item,
                    }
                )
                sequence += 1
            elif event["type"] == "completed":
                usage = event.get("usage")
    finally:
        _auth_override.reset(token)

    if text_started:
        done_part = {"type": "output_text", "text": text, "annotations": []}
        yield _sse(
            {
                "type": "response.output_text.done",
                "sequence_number": sequence,
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "text": text,
                "logprobs": [],
            }
        )
        sequence += 1
        yield _sse(
            {
                "type": "response.content_part.done",
                "sequence_number": sequence,
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "part": done_part,
            }
        )
        sequence += 1
        item = {"id": message_id, "type": "message", "status": "completed", "role": "assistant", "content": [done_part]}
        yield _sse({"type": "response.output_item.done", "sequence_number": sequence, "output_index": 0, "item": item})
        sequence += 1
    response = _response_object(response_id, created, text, usage, message_id, tool_calls)
    yield _sse({"type": "response.completed", "sequence_number": sequence, "response": response})
    yield _sse("[DONE]")


def create_api_app(pollinations_client, config):
    app = FastAPI(title="Polli API", description="OpenAI-compatible API for Polli")
    app.state.start_time = time.time()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.api.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(UpstreamAuthError)
    async def auth_error(_request: Request, exc: UpstreamAuthError):
        return _error(exc.detail, exc.status_code, "invalid_api_key")

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        errors = exc.errors()
        first = errors[0] if errors else {}
        location = first.get("loc", ())
        param = str(location[-1]) if location else None
        return _error(first.get("msg", "Invalid request"), 400, "invalid_request", param)

    @app.post("/v1/chat/completions")
    async def chat_completions(body: ChatRequest, request: Request):
        auth = _authorization(request)
        if not auth:
            return _error("Authorization header required", 401, "invalid_api_key")
        args = _request_args(body)
        if body.stream:
            include_usage = bool((body.stream_options or {}).get("include_usage"))
            return StreamingResponse(
                _chat_stream(pollinations_client, args, auth, include_usage),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        token = _auth_override.set(auth)
        try:
            result = await pollinations_client.process_with_tools(**args)
        except UpstreamAuthError as exc:
            return _error(exc.detail, exc.status_code, "invalid_api_key")
        except Exception:
            logger.exception("Error processing chat completion")
            return _error("Internal server error", 500, "internal_error")
        finally:
            _auth_override.reset(token)
        return JSONResponse(_chat_response(result, f"chatcmpl-{uuid4_hex()[:24]}", int(time.time())))

    @app.post("/v1/responses")
    async def responses(body: ResponsesRequest, request: Request):
        auth = _authorization(request)
        if not auth:
            return _error("Authorization header required", 401, "invalid_api_key")
        chat = _responses_chat_request(body)
        args = _request_args(chat)
        if body.stream:
            return StreamingResponse(
                _responses_stream(pollinations_client, args, auth),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        token = _auth_override.set(auth)
        try:
            result = await pollinations_client.process_with_tools(**args)
        except UpstreamAuthError as exc:
            return _error(exc.detail, exc.status_code, "invalid_api_key")
        except Exception:
            logger.exception("Error processing response")
            return _error("Internal server error", 500, "internal_error")
        finally:
            _auth_override.reset(token)
        return JSONResponse(
            _response_object(
                f"resp_{uuid4_hex()[:24]}",
                int(time.time()),
                result.get("response", ""),
                result.get("usage"),
                tool_calls=result.get("client_tool_calls"),
            )
        )

    @app.get("/v1/models")
    async def models(request: Request):
        if not _authorization(request):
            return _error("Authorization header required", 401, "invalid_api_key")
        created = int(app.state.start_time)
        return {
            "object": "list",
            "data": [{"id": "polli", "object": "model", "created": created, "owned_by": "pollinations"}],
        }

    @app.get("/v1/models/{model_id}")
    async def model(model_id: str, request: Request):
        if not _authorization(request):
            return _error("Authorization header required", 401, "invalid_api_key")
        if model_id != "polli":
            return _error(f"The model '{model_id}' does not exist", 404, "model_not_found", "model")
        return {"id": "polli", "object": "model", "created": int(app.state.start_time), "owned_by": "pollinations"}

    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "bot_name": config.bot.name,
            "uptime_seconds": int(time.time() - app.state.start_time),
            "mode": "embedded",
        }

    return app
