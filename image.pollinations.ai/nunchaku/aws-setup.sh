#!/bin/bash
# AWS Security Group Setup Script for FLUX Schnell Service

# Configuration
INSTANCE_IP="54.221.16.149"
SG_NAME="pollinations-shared-sg"
SG_DESC="Shared security group for Pollinations AI services"

echo "Setting up AWS security group for FLUX Schnell service..."

# Get instance info
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=ip-address,Values=$INSTANCE_IP" --query 'Reservations[0].Instances[0].InstanceId' --output text)
VPC_ID=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].VpcId' --output text)

echo "Instance ID: $INSTANCE_ID"
echo "VPC ID: $VPC_ID"

# Create security group
SG_ID=$(aws ec2 create-security-group \
    --group-name $SG_NAME \
    --description "$SG_DESC" \
    --vpc-id $VPC_ID \
    --query 'GroupId' --output text)

echo "Security Group ID: $SG_ID"

# Add inbound rules
echo "Adding inbound rules..."

# SSH access
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0
echo "✓ SSH (22) added"

# FLUX Schnell service
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 8765 --cidr 0.0.0.0/0
echo "✓ FLUX Schnell (8765) added"

# HTTP/HTTPS
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0
echo "✓ HTTP (80) added"

aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0
echo "✓ HTTPS (443) added"

# Apply to instance
echo "Applying security group to instance..."
aws ec2 modify-instance-attribute --instance-id $INSTANCE_ID --groups $SG_ID
echo "✓ Security group applied to instance"

echo ""
echo "Setup complete! Test external access:"
echo "curl -X POST http://$INSTANCE_IP:8765/generate -H \"Content-Type: application/json\" -d '{\"prompts\": [\"test\"], \"width\": 512, \"height\": 512, \"steps\": 4}'"
