# FLUX Schnell Nunchaku Deployment Guide

## Quick Setup

For a fresh deployment on a new instance:

```bash
git clone https://github.com/pollinations/pollinations.git
cd pollinations
git checkout flux-schnell-improvements
cd image.pollinations.ai/nunchaku
./setup_complete.sh hf_your_token_here
```

## What the Setup Script Does

1. **System Dependencies**: Updates packages and installs Python, pip, venv, git, curl, wget
2. **Python Environment**: Creates virtual environment and installs:
   - PyTorch with CUDA 11.8 support
   - diffusers, transformers, accelerate
   - FastAPI, uvicorn, python-multipart, aiohttp
   - protobuf, sentencepiece (FLUX tokenizer)
   - huggingface_hub for model authentication
   - **nunchaku 0.3.2+torch2.5** for INT4 quantization optimization
3. **HuggingFace Authentication**: Sets up HF token securely via parameter
4. **Service Management**: Creates both custom scripts AND systemd service
5. **Model Configuration**: Uses quantized model `mit-han-lab/svdq-int4-flux.1-schnell`

## Required HuggingFace Token

You need to provide your own HuggingFace token when running the setup script:

```bash
./setup_complete.sh hf_your_token_here
```

The token is required for accessing the FLUX model from HuggingFace.

## Server Management

After setup, use either systemd or custom scripts:

**Systemd (Recommended):**
```bash
sudo systemctl start flux-server
sudo systemctl status flux-server
sudo journalctl -u flux-server -f
sudo systemctl stop flux-server
sudo systemctl restart flux-server
```

**Custom Scripts:**
```bash
./manage_service.sh start
./manage_service.sh status
./manage_service.sh logs
./manage_service.sh stop
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
    "prompt": "a cute cat",
    "width": 512,
    "height": 512,
    "steps": 4,
    "seed": 42
  }'
```

### Request Parameters

- `prompt`: String (required)
- `width`: Integer, image width (default: 1024)
- `height`: Integer, image height (default: 1024)
- `steps`: Integer, inference steps (default: 4)
- `seed`: Integer, random seed (optional)
- `safety_checker_adj`: Float, NSFW detection sensitivity (default: 0.5)

## Key Features

- **Nunchaku Optimization**: INT4 quantization for faster inference
- **Quantized Model**: `mit-han-lab/svdq-int4-flux.1-schnell`
- **Safety Checking**: Built-in NSFW content filtering
- **Systemd Service**: Auto-start and proper service management
- **Performance**: ~2-4 seconds generation time with nunchaku
- **Memory Efficient**: Reduced GPU memory usage with quantization

## Troubleshooting

1. **CUDA Issues**: Ensure GPU instance with CUDA 11.8+ support
2. **Memory Issues**: Requires ~8GB+ GPU memory for FLUX.1-schnell
3. **Authentication Issues**: Verify HF token has access to black-forest-labs/FLUX.1-schnell
4. **Port Issues**: Ensure port 8765 is open in security group

## Security Group Configuration

Ensure your AWS security group allows:
- **Inbound**: TCP port 8765 from 0.0.0.0/0 (or your IP range)
- **Outbound**: All traffic (for model downloads and heartbeat)

## Adding New Instances

**For existing EC2 instance:**
```bash
# 1. SSH to instance
ssh -i ./audioinstance.pem ubuntu@<INSTANCE_IP>

# 2. Deploy FLUX
git clone https://github.com/pollinations/pollinations.git
cd pollinations
git checkout flux-schnell-improvements
cd image.pollinations.ai/nunchaku
./setup_complete.sh hf_your_token_here

# 3. Configure security group (AWS CLI)
aws ec2 modify-instance-attribute \
    --instance-id <INSTANCE_ID> \
    --groups <CURRENT_SG> sg-0f426a194bfb9df86
```

**Automated deployment available with AWS CLI authentication.**

## Current Production Deployment

✅ **Live Instance**: 34.238.131.212:8765 (i-02e19443f56f3e19c)
- Systemd service: `flux-server.service` running
- Security groups: `launch-wizard-7` + `pollinations-shared-sg`
- Model: `mit-han-lab/svdq-int4-flux.1-schnell` with nunchaku optimization
- External API access: **WORKING**
- Performance: ~2-4 seconds per image generation
