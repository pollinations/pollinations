#!/bin/bash
# Monitor deployment progress for new workers

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Flux Worker Status Monitor${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Existing workers
echo -e "${GREEN}✅ Existing Workers (Running)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for host in io4090-6 io4090-7 io4090-8; do
  echo -n "  $host: "
  status=$(ssh $host "systemctl is-active ionet-flux-gpu0 ionet-flux-gpu1 2>/dev/null" | tr '\n' ' ')
  if [[ "$status" == "active active " ]]; then
    echo -e "${GREEN}✅ Both GPUs active${NC}"
  else
    echo -e "${RED}❌ Issue: $status${NC}"
  fi
done
echo ""

# New workers being deployed
echo -e "${YELLOW}🔄 New Workers (Deploying)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for host in io4090-9 io4090-10; do
  echo -e "\n${YELLOW}📍 $host${NC}"
  
  # Check if tar file exists
  if ssh $host "test -f /tmp/flux-worker.tar.gz" 2>/dev/null; then
    size=$(ssh $host "du -h /tmp/flux-worker.tar.gz 2>/dev/null | cut -f1")
    echo -e "  📦 Package: ${GREEN}✅ Received ($size)${NC}"
  else
    echo -e "  📦 Package: ${YELLOW}⏳ Transferring...${NC}"
  fi
  
  # Check if extraction started
  if ssh $host "test -d ~/nunchaku/venv" 2>/dev/null; then
    echo -e "  📂 Extraction: ${GREEN}✅ Complete${NC}"
  else
    echo -e "  📂 Extraction: ${YELLOW}⏳ Pending${NC}"
  fi
  
  # Check if services exist
  if ssh $host "systemctl list-unit-files | grep -q ionet-flux-gpu0" 2>/dev/null; then
    echo -e "  ⚙️  Services: ${GREEN}✅ Created${NC}"
    
    # Check service status
    gpu0=$(ssh $host "systemctl is-active ionet-flux-gpu0 2>/dev/null")
    gpu1=$(ssh $host "systemctl is-active ionet-flux-gpu1 2>/dev/null")
    
    if [[ "$gpu0" == "active" && "$gpu1" == "active" ]]; then
      echo -e "  🚀 Status: ${GREEN}✅ Running${NC}"
      
      # Check if models are loaded
      if ssh $host "journalctl -u ionet-flux-gpu0 -n 50 | grep -q 'Model loaded'" 2>/dev/null; then
        echo -e "  🤖 Models: ${GREEN}✅ Loaded${NC}"
      else
        echo -e "  🤖 Models: ${YELLOW}⏳ Loading...${NC}"
      fi
    else
      echo -e "  🚀 Status: ${YELLOW}⏳ Starting... (GPU0: $gpu0, GPU1: $gpu1)${NC}"
    fi
  else
    echo -e "  ⚙️  Services: ${YELLOW}⏳ Not created yet${NC}"
  fi
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📈 Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Running Workers: ${GREEN}3${NC} (io4090-6, io4090-7, io4090-8)"
echo -e "  Deploying Workers: ${YELLOW}2${NC} (io4090-9, io4090-10)"
echo -e "  Total GPUs: ${GREEN}6 active${NC} + ${YELLOW}4 deploying${NC} = 10 total"
echo ""
