# FLUX Schnell Deployment Guide

## Server Information
- **Instance ID**: `i-0102190ed7f2a6758`
- **Public IP**: `54.221.16.149`
- **VPC ID**: `vpc-0d37cc359b56f7d32`
- **Security Group**: `sg-0f426a194bfb9df86` (pollinations-shared-sg)
- **Service Port**: `8765`

## Quick Start Commands

### Start Server
```bash
cd /home/ubuntu/pollinations/image.pollinations.ai/nunchaku
source nunchaku_env/bin/activate
python server.py
```

### Test Local Access
```bash
curl -X POST http://localhost:8765/generate \
  -H "Content-Type: application/json" \
  -d '{"prompts": ["test"], "width": 512, "height": 512, "steps": 4}'
```

### Test External Access
```bash
curl -X POST http://54.221.16.149:8765/generate \
  -H "Content-Type: application/json" \
  -d '{"prompts": ["test voxel art"], "width": 1024, "height": 1024, "steps": 4, "seed": 42}'
```

## AWS Security Group Setup

### Create Shared Security Group (CloudShell)
```bash
# Get instance info
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=ip-address,Values=54.221.16.149" --query 'Reservations[0].Instances[0].InstanceId' --output text)
VPC_ID=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].VpcId' --output text)

# Create security group
SG_ID=$(aws ec2 create-security-group \
    --group-name pollinations-shared-sg \
    --description "Shared security group for Pollinations AI services" \
    --vpc-id $VPC_ID \
    --query 'GroupId' --output text)

# Add rules
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 8765 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0

# Apply to instance
aws ec2 modify-instance-attribute --instance-id $INSTANCE_ID --groups $SG_ID
```

## Service Features
- **Model**: FLUX Schnell with nunchaku INT4 quantization
- **Speed**: ~2 seconds for 4-step inference
- **Memory**: Optimized with quantization
- **Safety**: NSFW content filtering enabled
- **API**: FastAPI with `/generate` endpoint
- **Heartbeat**: Auto-registration with pollinations.ai

## Dependencies
- Python 3.10
- PyTorch 2.4.1 + CUDA 12.1
- Nunchaku 0.3.2
- Diffusers, Transformers, FastAPI
- HuggingFace authentication required

## Troubleshooting
- **External access blocked**: Check AWS security group port 8765
- **Server not responding**: Verify process running with `ps aux | grep server.py`
- **Model loading slow**: Normal for first startup (~2 minutes)
- **NSFW errors**: Safety checker loads automatically on first use
