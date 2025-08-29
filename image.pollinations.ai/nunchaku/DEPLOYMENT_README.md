# FLUX Schnell Deployment Guide

## Quick Setup

For a fresh deployment on a new instance, run:

```bash
git clone https://github.com/pollinations/pollinations.git
cd pollinations
git checkout flux-schnell-improvements
cd image.pollinations.ai/nunchaku
chmod +x setup_complete.sh
./setup_complete.sh
```

## What the Setup Script Does

1. **System Dependencies**: Updates packages and installs Python, pip, venv, git, curl, wget
2. **Python Environment**: Creates virtual environment and installs all required packages:
   - PyTorch with CUDA 11.8 support
   - diffusers, transformers, accelerate
   - FastAPI, uvicorn, python-multipart, aiohttp
   - protobuf, sentencepiece (required for FLUX tokenizer)
   - huggingface_hub for model authentication
3. **HuggingFace Authentication**: Sets up HF token and logs in automatically
4. **Service Scripts**: Creates management scripts for easy server control

## Required HuggingFace Token

You need to provide your own HuggingFace token when running the setup script:

```bash
./setup_complete.sh hf_your_token_here
```

The token is required for accessing the FLUX model from HuggingFace.

## Server Management

After setup, use these commands:

```bash
# Start the server
./manage_service.sh start

# Check status
./manage_service.sh status

# View logs
./manage_service.sh logs

# Stop the server
./manage_service.sh stop

# Restart the server
./manage_service.sh restart
```

## API Endpoint

Once running, the server is available at:
- **URL**: `http://<your-ip>:8765/generate`
- **Method**: POST
- **Content-Type**: application/json

### Example Request

```bash
curl -X POST "http://your-ip:8765/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompts": ["a cute cat"],
    "width": 512,
    "height": 512,
    "steps": 2,
    "seed": 42
  }'
```

### Request Parameters

- `prompts`: Array of strings (required)
- `width`: Integer, image width (default: 1024)
- `height`: Integer, image height (default: 1024)
- `steps`: Integer, inference steps (default: 2)
- `seed`: Integer, random seed (optional)
- `safety_checker_adj`: Float, NSFW detection sensitivity (default: 0.5)

## Dependencies Installed

- torch, torchvision, torchaudio (CUDA 11.8)
- diffusers, transformers, accelerate
- fastapi, uvicorn
- python-multipart, aiohttp
- requests, pillow
- protobuf, sentencepiece
- huggingface_hub

## Troubleshooting

1. **CUDA Issues**: Ensure GPU instance with CUDA 11.8+ support
2. **Memory Issues**: Requires ~8GB+ GPU memory for FLUX.1-schnell
3. **Authentication Issues**: Verify HF token has access to black-forest-labs/FLUX.1-schnell
4. **Port Issues**: Ensure port 8765 is open in security group

## Security Group Configuration

Ensure your AWS security group allows:
- **Inbound**: TCP port 8765 from 0.0.0.0/0 (or your IP range)
- **Outbound**: All traffic (for model downloads and heartbeat)

## Model Information

- **Model**: black-forest-labs/FLUX.1-schnell
- **Type**: Text-to-image diffusion model
- **License**: Requires HuggingFace authentication
- **GPU Memory**: ~8GB recommended
- **Generation Time**: ~10-30 seconds per image

## Current Deployment Status

✅ **Successfully Deployed**: Server running on 34.238.131.212:8765
- HuggingFace authentication configured
- All dependencies installed
- Service management scripts created
- API endpoint accessible externally
