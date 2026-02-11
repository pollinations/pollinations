#!/bin/bash

set -e

echo "=== FLUX.2-dev-Turbo Deployment Script ==="

if [ ! -f .env ]; then
    echo "❌ .env file not found. Run setup-flux-docker.sh first"
    exit 1
fi

source .env

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Checking for running containers..."
if docker ps --format '{{.Names}}' | grep -q "^flux2-dev-turbo$"; then
    echo "⏹️  Stopping existing flux2-dev-turbo container..."
    docker stop flux2-dev-turbo || true
    docker rm flux2-dev-turbo || true
    sleep 2
fi

echo "🔨 Building Docker image..."
docker build -t flux2-dev-turbo:latest . || {
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
}
echo -e "${GREEN}✅ Image built successfully${NC}"

echo ""
echo "🚀 Starting FLUX.2-dev-Turbo container..."
docker run -d \
    --name flux2-dev-turbo \
    --gpus all \
    -p 10003:10003 \
    -e PORT="${PORT}" \
    -e SERVICE_TYPE="${SERVICE_TYPE}" \
    -e PLN_ENTER_TOKEN="${PLN_ENTER_TOKEN}" \
    -e CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES}" \
    -v "$(pwd)/model_cache:/app/model_cache" \
    -v "$(pwd)/logs:/app/logs" \
    --health-cmd='curl -f http://localhost:10003/health || exit 1' \
    --health-interval=30s \
    --health-timeout=10s \
    --health-retries=3 \
    flux2-dev-turbo:latest

sleep 2

if docker ps --format '{{.Names}}' | grep -q "^flux2-dev-turbo$"; then
    echo -e "${GREEN}✅ Container started successfully${NC}"
else
    echo -e "${RED}❌ Container failed to start${NC}"
    docker logs flux2-dev-turbo
    exit 1
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo -e "${GREEN}Service Information:${NC}"
echo "  Container: flux2-dev-turbo"
echo "  Port: 10003"
echo "  Service Type: ${SERVICE_TYPE}"
echo "  GPU: ${CUDA_VISIBLE_DEVICES}"
echo ""
echo -e "${GREEN}Check status:${NC}"
echo "  docker ps -a"
echo "  docker logs flux2-dev-turbo"
echo "  curl http://localhost:10003/health"
echo ""
echo -e "${GREEN}Test generation:${NC}"
echo "  curl -X POST http://localhost:10003/generate \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'x-enter-token: ${PLN_ENTER_TOKEN}' \\"
echo "    -d '{\"prompts\": [\"a cat\"], \"width\": 1024, \"height\": 1024}'"
echo ""
