import logging
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from contextlib import asynccontextmanager

from ..config import config
from ..services.pollinations import pollinations_client
from ..logging_config import setup_logging
from ..services.github import TOOL_HANDLERS

setup_logging(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Polly API starting...")
    config.validate()
    
    handlers = dict(TOOL_HANDLERS)

    if config.local_embeddings_enabled:
        from ..bot import _code_search_handler
        handlers["code_search"] = _code_search_handler

    if config.doc_embeddings_enabled:
        from ..bot import _doc_search_handler
        handlers["doc_search"] = _doc_search_handler

    from ..services.pollinations import web_search_handler, web_handler
    handlers["web_search"] = web_search_handler
    handlers["web"] = web_handler
    
    from ..services.web_scraper import web_scrape_handler
    handlers["web_scrape"] = web_scrape_handler
    
    from ..services.discord_search import tool_discord_search
    handlers["discord_search"] = tool_discord_search
    
    for name, handler in handlers.items():
        pollinations_client.register_tool_handler(name, handler)
    logger.info(f"Registered {len(handlers)} tool handlers")
    
    yield
    
    logger.info("Polly API shutting down...")
    await pollinations_client.close()

app = FastAPI(title="Polly API", description="OpenAI-compatible API for Polly bot", lifespan=lifespan)

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

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    user_name: Optional[str] = "http_user"
    image_urls: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None
    file_urls: Optional[List[str]] = None
    is_admin: Optional[bool] = False

class ChatResponse(BaseModel):
    content: str
    tool_calls: Optional[List] = None

@app.post("/v1/chat/completions", response_model=ChatResponse)
async def chat_completions(request: ChatRequest) -> ChatResponse:
    thread_history = None
    
    if len(request.messages) > 1:
        thread_history = [{"role": m.role, "content": m.content} for m in request.messages[:-1]]
    
    user_message = request.messages[-1].content if request.messages else ""
    
    http_restriction = """

## ⚠️ HTTP API MODE - LIMITED TOOLS ONLY
You are running in HTTP API mode. You have LIMITED tool access:

**ALLOWED TOOLS:**
- github_overview: Search GitHub repository overview
- web_search: Search and fetch web results
- web_scrape: Scrape and extract web content
- web: Deep web research
- doc_search: Documentation search
- code_search: Semantic code search

**RESTRICTED (Discord-only):**
- Issue creation/management
- GitHub PR operations
- Discord search

If user requests restricted operations, politely explain they need to use the Discord bot directly."""
    
    if thread_history:
        thread_history.insert(0, {"role": "system", "content": http_restriction})
    else:
        thread_history = [{"role": "system", "content": http_restriction}]
    
    try:
        result = await pollinations_client.process_with_tools(
            user_message=user_message,
            discord_username=request.user_name,
            thread_history=thread_history,
            image_urls=request.image_urls or [],
            video_urls=request.video_urls or [],
            file_urls=request.file_urls or [],
            is_admin=request.is_admin or False,
            tool_context={
                "is_admin": request.is_admin or False,
                "user_name": request.user_name,
                "is_http_api": True,
            },
        )
        
        return ChatResponse(
            content=result.get("response", ""),
            tool_calls=result.get("tool_calls", [])
        )
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "bot_name": config.bot_name,
    }

if __name__ == "__main__":
    logger.info("Starting Polly API...")
    uvicorn.run("src.polly_api:app", host="0.0.0.0", port=8003, log_level="info")
