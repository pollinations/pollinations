# generative_image_url

## Architecture

```mermaid
flowchart TD
    A[Client Request] --> B[Input Validation]
    B --> C[Prompt Translation]
    C --> D[Parameter Normalization]
    D --> E[LlamaGuard Check]
    E -->|Safe| F[Image Generation]
    E -->|Unsafe| G[Error Response]
    F --> H[NSFW Check]
    H -->|Safe| I[Add Logo]
    H -->|NSFW| J[Block/Warn]
    I --> K[Return Image]
    
    subgraph Safety Checks
        E
        H
    end
    
    subgraph Image Processing
        F
        I
    end
```

## Installation Instructions

Install automatic1111's [webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui/)

Run with

```bash
./webui.sh --api [--xformers]
```
(xformers for speed up)


Run server (will listen on port 16384 by default)
```bash
mkdir -p /tmp/stableDiffusion_cache
npm install
node index.js
```
