import modal
import httpx

# Create a Modal app
app = modal.App("flux-svdquant-service")

# Create an image from the Docker registry with GPU support
image = (
    modal.Image.from_registry("voodoohop/flux-svdquant:latest")
    .pip_install("httpx")  # Install httpx for proxying requests
)

@app.function(
    image=image,
    gpu="L40S",  # Using L40S GPU for optimal inference performance
    timeout=600  # 10 minute timeout
)
@modal.asgi_app()
def web_app():
    from fastapi import FastAPI, Request
    from fastapi.responses import StreamingResponse
    import asyncio

    app = FastAPI()
    
    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def proxy(request: Request, path: str):
        # Forward request to the internal service
        url = f"http://localhost:8000/{path}"
        
        # Wait a bit for the internal service to start
        for _ in range(5):
            try:
                async with httpx.AsyncClient() as client:
                    # Forward the request with the same method, headers, and body
                    response = await client.request(
                        method=request.method,
                        url=url,
                        headers=dict(request.headers),
                        content=await request.body()
                    )
                    return StreamingResponse(
                        response.aiter_bytes(),
                        status_code=response.status_code,
                        headers=dict(response.headers)
                    )
            except httpx.ConnectError:
                await asyncio.sleep(1)
                continue
        
        return {"error": "Internal service not available"}

    return app

if __name__ == "__main__":
    modal.serve(web_app)
