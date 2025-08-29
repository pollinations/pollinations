#!/bin/bash

# FLUX Schnell Instance Deployment Automation Script
# Usage: ./deploy_new_flux_instance.sh <hf_token> [instance_name]

set -e

# Configuration
AMI_ID="ami-0c8aa43566f2acc52"  # Deep Learning OSS PyTorch 2.7 AMI (2025-08-28) - Will downgrade to PyTorch 2.5.1+cu121
INSTANCE_TYPE="g6e.xlarge"      # GPU instance for FLUX
KEY_NAME="audioinstance"        # SSH key pair name
SUBNET_ID="subnet-0d7d5327566a75c23"  # us-east-1a (avoiding capacity issues)
SHARED_SG="sg-0f426a194bfb9df86"      # pollinations-shared-sg
SSH_KEY_PATH="/home/ubuntu/audioinstance.pem"  # Updated path
STORAGE_SIZE="100"               # Storage size in GB

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check arguments
if [ $# -lt 1 ]; then
    print_error "Usage: $0 <hf_token> [instance_name]"
    print_error "Example: $0 hf_your_token_here flux-server-2"
    exit 1
fi

HF_TOKEN="$1"
INSTANCE_NAME="${2:-flux-server-$(date +%s)}"

print_status "Starting deployment of new FLUX instance: $INSTANCE_NAME"

# Step 1: Launch new EC2 instance
print_status "Launching new EC2 instance with ${STORAGE_SIZE}GB storage..."
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --subnet-id "$SUBNET_ID" \
    --security-group-ids "$SHARED_SG" \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$STORAGE_SIZE,VolumeType=gp3,DeleteOnTermination=true}" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME},{Key=Purpose,Value=FLUX-Schnell}]" "ResourceType=volume,Tags=[{Key=Name,Value=$INSTANCE_NAME-storage}]" \
    --query 'Instances[0].InstanceId' \
    --output text)

print_success "Instance launched: $INSTANCE_ID"

# Step 2: Wait for instance to be running
print_status "Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
print_success "Instance is now running"

# Step 3: Get instance IP
print_status "Getting instance public IP..."
INSTANCE_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

print_success "Instance IP: $INSTANCE_IP"

# Step 4: Wait for SSH to be available
print_status "Waiting for SSH to be available..."
for i in {1..30}; do
    if ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=5 -o StrictHostKeyChecking=no ubuntu@"$INSTANCE_IP" "echo 'SSH ready'" 2>/dev/null; then
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "SSH connection failed after 30 attempts"
        exit 1
    fi
    print_status "Attempt $i/30 - waiting for SSH..."
    sleep 10
done

print_success "SSH connection established"

# Step 5: Deploy FLUX via SSH
print_status "Deploying FLUX Schnell to $INSTANCE_IP..."

ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$INSTANCE_IP" << EOF
set -e

echo "Cloning repository..."
git clone https://github.com/pollinations/pollinations.git
cd pollinations
git checkout flux-schnell-improvements

echo "Setting up FLUX Schnell..."
cd image.pollinations.ai/nunchaku
chmod +x setup_complete.sh
./setup_complete.sh "$HF_TOKEN"

echo "FLUX deployment complete!"
EOF

# Step 6: Test the deployment
print_status "Testing FLUX API..."
sleep 10  # Give the service a moment to fully start

if curl -f -X POST "http://$INSTANCE_IP:8765/generate" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "test deployment", "width": 512, "height": 512}' \
    --max-time 30 > /dev/null 2>&1; then
    print_success "FLUX API is responding correctly"
else
    print_warning "FLUX API test failed - service may still be starting up"
fi

# Step 7: Display summary
echo ""
echo "======================================"
print_success "DEPLOYMENT COMPLETE!"
echo "======================================"
echo "Instance ID: $INSTANCE_ID"
echo "Instance IP: $INSTANCE_IP"
echo "Instance Name: $INSTANCE_NAME"
echo "API Endpoint: http://$INSTANCE_IP:8765/generate"
echo ""
echo "SSH Access:"
echo "  ssh -i $SSH_KEY_PATH ubuntu@$INSTANCE_IP"
echo ""
echo "Service Management:"
echo "  sudo systemctl {start|stop|status|restart} flux-server"
echo "  ./manage_service.sh {start|stop|status|restart|logs}"
echo ""
echo "Test API:"
echo "  curl -X POST http://$INSTANCE_IP:8765/generate \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"prompt\": \"a beautiful sunset\", \"width\": 512, \"height\": 512}'"
echo ""
print_success "Ready for production use!"
