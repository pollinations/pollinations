import modal
import os
import httpx

# Create a Modal app
app = modal.App("flux-svdquant-service")

# Create an image from the Docker registry with GPU support
image = (
    modal.Image.from_registry("voodoohop/flux-svdquant:modal-v1")
    .pip_install("httpx")  # Install httpx for proxying requests
)

@app.function(
    image=image,
    gpu="L40S",  # Using L40S GPU for optimal inference performance
    timeout=600,  # 10 minute timeout
    container_idle_timeout=300  # Keep container alive for 5 minutes
)
@modal.web_server(port=8000)
def web_app():
    import subprocess
    import time
    import sys
    
    # Set environment variables
    os.environ["PORT"] = "8000"
    os.environ["MODAL_URL"] = web_app.web_url  # Pass Modal's URL to the server
    os.environ["SERVICE_TYPE"] = "flux"  # Set service type for heartbeat
    
    # Start the server using the container's server.py
    process = subprocess.Popen(
        ["python3", "-m", "server"],
        cwd="/app",
        stdout=sys.stdout,
        stderr=sys.stderr,  # Forward output to Modal's logs
        env=dict(os.environ)
    )
    
    # Keep checking if the server is alive
    while True:
        if process.poll() is not None:
            print("Server process died, restarting...")
            process = subprocess.Popen(
                ["python3", "-m", "server"],
                cwd="/app",
                stdout=sys.stdout,
                stderr=sys.stderr,
                env=dict(os.environ)
            )
        time.sleep(1)

@app.function(
    image=image,
    gpu="L40S",  # Using L40S GPU for optimal inference performance
    timeout=600  # 10 minute timeout
)
@modal.asgi_app()
def proxy_app():
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
    web_app.spawn()  # Start the server in the background
    modal.run(proxy_app)
