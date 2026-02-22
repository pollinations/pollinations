# io.net Deployment Summary - 2026-01-26

## Current Status
✅ **All 8 GPU workers operational** (4 Flux, 4 Z-Image)

### Flux Workers (4 GPUs)
- **vmaas-22e58f05**: Ports 20071, 23942 - 0% error rate ✅
- **vmaas-41e2e564**: Ports 26596, 31706 - Working ✅

### Z-Image Workers (4 GPUs)
- **vmaas-46665737**: Ports 24946, 21753 - 0% error rate ✅
- **vmaas-8afc966b**: Ports 24088, 30215 - 0.2% error rate ✅

## Key Fixes Applied

### 1. Cloudflare Blocking Issue
**Problem**: Some io.net outbound IPs were blocked by Cloudflare WAF
**Solution**: Updated all services to use direct EC2 endpoint `http://3.80.56.235:16384/register`

### 2. Flux Public IP Detection
**Problem**: Containers auto-detected wrong internal IP (209.137.137.19 instead of 3.21.229.114)
**Solution**: Set `PUBLIC_IP` environment variable explicitly in Docker run commands

### 3. HuggingFace Authentication
**Problem**: FLUX.1-schnell model requires authentication
**Solution**: Added working HF_TOKEN to all Flux containers

### 4. Server Code Updates
- Updated `server.py` to support PUBLIC_PORT environment variable
- Changed default REGISTER_URL to EC2 endpoint
- Improved error handling and logging

## Files Updated
- `image.pollinations.ai/nunchaku/server.py` - Added PUBLIC_PORT support, EC2 endpoint
- `image.pollinations.ai/IONET_INSTANCES.md` - Updated documentation with correct configs
- `image.pollinations.ai/src/availableServers.ts` - Removed slave server functionality (PR #7656)
- `enter.pollinations.ai/.testingtokens` - Added HF_TOKEN for testing

## Docker Image Updates
- Created `Dockerfile.updated` for building updated image
- Created `build-updated-image.sh` script for easy rebuilding
- ✅ Built `pollinations/flux-svdquant:updated` on vmaas-22e58f05
- Image size: 17.5GB total (only ~12KB difference from base)
- Successfully tested with flux1 and flux2 containers
- Ready to push to Docker Hub (needs credentials)

## Branch Changes
- Branch: `simplify/remove-slave-server-functionality`
- Removed master server syncing code
- Simplified architecture to only use local server registry

## Next Steps
1. Build and push updated Docker image: `pollinations/flux-svdquant:updated`
2. Update io.net deployments to use new image
3. Monitor error rates to ensure stability
4. Consider migrating Z-Image to similar EC2 endpoint configuration