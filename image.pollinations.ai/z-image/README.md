# Z-Image-Turbo Server

FastAPI server for Z-Image-Turbo (6B parameter text-to-image model from Tongyi-MAI).

## Performance

- **512×512**: ~0.9s
- **1024×1024**: ~3.5s
- **VRAM**: ~20GB peak

## Quick Start

```bash
# Install dependencies
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt

# Run server
python server.py
```

## Docker

```bash
docker build -t z-image-turbo .
docker run --gpus all -p 10002:10002 z-image-turbo
```

## API

### POST /generate

```json
{
  "prompts": ["a cat wearing sunglasses"],
  "width": 1024,
  "height": 1024,
  "steps": 9,
  "seed": 42
}
```

### GET /health

Returns model status.

## Environment Variables

- `PORT`: Server port (default: 10002)
- `PUBLIC_IP`: IP for heartbeat registration
- `SERVICE_TYPE`: Service type for registration (default: zimage)
