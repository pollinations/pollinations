#!/bin/bash
# AWS Security Group Setup Script for Pollinations AI Services
# This script applies the shared security group to new instances

set -e

# Configuration
SG_NAME="pollinations-shared-sg"
REQUIRED_PORTS=(22 80 443 8765)

echo "🔧 Setting up AWS security group for Pollinations AI services..."

# Function to get instance metadata
get_instance_metadata() {
    local metadata_path="$1"
    curl -s "http://169.254.169.254/latest/meta-data/$metadata_path" 2>/dev/null || echo ""
}

# Get current instance info
INSTANCE_ID=$(get_instance_metadata "instance-id")
REGION=$(get_instance_metadata "placement/region")
VPC_ID=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --region "$REGION" --query 'Reservations[0].Instances[0].VpcId' --output text 2>/dev/null || echo "")

if [[ -z "$INSTANCE_ID" || -z "$REGION" || -z "$VPC_ID" ]]; then
    echo "❌ Could not retrieve instance metadata. Are you running on EC2?"
    exit 1
fi

echo "📍 Instance ID: $INSTANCE_ID"
echo "📍 Region: $REGION" 
echo "📍 VPC ID: $VPC_ID"

# Check if security group exists
SG_ID=$(aws ec2 describe-security-groups \
    --region "$REGION" \
    --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [[ "$SG_ID" == "None" || -z "$SG_ID" ]]; then
    echo "🆕 Creating security group '$SG_NAME'..."
    
    # Create security group
    SG_ID=$(aws ec2 create-security-group \
        --region "$REGION" \
        --group-name "$SG_NAME" \
        --description "Shared security group for Pollinations AI services" \
        --vpc-id "$VPC_ID" \
        --query 'GroupId' --output text)
    
    echo "✅ Created security group: $SG_ID"
    
    # Add inbound rules
    echo "🔓 Adding inbound rules..."
    
    # SSH
    aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0
    echo "  ✓ SSH (22)"
    
    # HTTP
    aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
    echo "  ✓ HTTP (80)"
    
    # HTTPS  
    aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0
    echo "  ✓ HTTPS (443)"
    
    # FLUX Schnell service
    aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 8765 --cidr 0.0.0.0/0
    echo "  ✓ FLUX Schnell (8765)"
    
else
    echo "✅ Found existing security group: $SG_ID"
fi

# Apply security group to current instance
echo "🔗 Applying security group to instance..."
aws ec2 modify-instance-attribute --region "$REGION" --instance-id "$INSTANCE_ID" --groups "$SG_ID"
echo "✅ Security group applied successfully!"

# Verify the setup
echo ""
echo "🔍 Verification:"
echo "  Security Group: $SG_NAME ($SG_ID)"
echo "  Applied to: $INSTANCE_ID"
echo ""
echo "🚀 Your instance is now configured with the shared security group!"
echo "   All Pollinations AI services (port 8765) are accessible externally."
echo ""
echo "💡 To use this script on new instances:"
echo "   1. Launch new EC2 instance"
echo "   2. Run: curl -s https://raw.githubusercontent.com/pollinations/pollinations/main/image.pollinations.ai/serverConfigAndScripts/setup-security-group.sh | bash"
echo "   3. Or copy this script and run locally"
