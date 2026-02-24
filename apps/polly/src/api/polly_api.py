import logging
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ..services.pollinations import UpstreamAuthError, _auth_override

logger = logging.getLogger(__name__)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    user_name: str | None = "http_user"
    image_urls: list[str] | None = None
    video_urls: list[str] | None = None
    file_urls: list[str] | None = None


class ChatResponse(BaseModel):
    model: str = "polly"
    content: str
    tool_calls: list | None = None


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

    @app.post("/v1/chat/completions", response_model=ChatResponse)
    async def chat_completions(request: ChatRequest, raw_request: Request) -> ChatResponse:
        # Pass through user's API key — no cross-contamination with bot's key
        auth_header = raw_request.headers.get("authorization", "")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            raise HTTPException(
                status_code=401,
                detail="Authorization header required. Use 'Bearer <your-pollinations-api-key>'",
            )
        _auth_override.set(auth_header)

        thread_history = None

        if len(request.messages) > 1:
            thread_history = [{"role": m.role, "content": m.content} for m in request.messages[:-1]]

        user_message = request.messages[-1].content if request.messages else ""

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
            )

            return ChatResponse(content=result.get("response", ""), tool_calls=result.get("tool_calls", []))
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
