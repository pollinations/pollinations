#!/bin/bash

# OptiLLM Setup Script for Pollinations
# This script manages OptiLLM installation and configuration

VENV_PATH="/home/ubuntu/optillm-venv"
OPTILLM_PORT=8100
DEFAULT_BACKEND="https://text.pollinations.ai/openai"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Emojis for visual feedback
ROCKET="🚀"
CHECK="✅"
WARNING="⚠️"
LIGHTBULB="💡"
SATELLITE="📡"
GEAR="⚙️"
TEST="🧪"
FIRE="🔥"

print_status() {
    echo -e "${BLUE}${ROCKET} Setting up OptiLLM for Pollinations...${NC}"
}

# Function to detect Azure OpenAI configuration
detect_azure_config() {
    if [ -f "../.env" ]; then
        AZURE_ENDPOINT=$(grep "^AZURE_OPENAI_41_ENDPOINT=" ../.env | cut -d'=' -f2- | tr -d '"')
        AZURE_API_KEY=$(grep "^AZURE_OPENAI_41_API_KEY=" ../.env | cut -d'=' -f2- | tr -d '"')
        
        if [ ! -z "$AZURE_ENDPOINT" ] && [ ! -z "$AZURE_API_KEY" ]; then
            # Extract base URL for Azure OpenAI (remove deployment-specific parts)
            # From: https://thot--m9jzyn1x-swedencentral.openai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2025-01-01-preview
            # To: https://thot--m9jzyn1x-swedencentral.openai.azure.com/
            AZURE_BASE_URL=$(echo "$AZURE_ENDPOINT" | sed -E 's|(/openai/deployments/.*)$||')
            # For OptiLLM with Azure, we need to set the model name to match the deployment
            AZURE_MODEL_NAME="gpt-4.1"
            echo -e "${CHECK} Found Azure OpenAI configuration in .env"
            echo -e "  ${GEAR} Base URL: $AZURE_BASE_URL"
            echo -e "  ${GEAR} Model: $AZURE_MODEL_NAME"
            echo -e "  ${GEAR} API Key: ${AZURE_API_KEY:0:12}..."
            return 0
        fi
    fi
    return 1
}

setup_optillm() {
    print_status
    
    # Check if virtual environment exists
    if [ ! -d "$VENV_PATH" ]; then
        echo -e "${YELLOW}${WARNING} Creating OptiLLM virtual environment...${NC}"
        python3 -m venv "$VENV_PATH"
        source "$VENV_PATH/bin/activate"
        pip install --upgrade pip
        pip install optillm
        echo -e "${GREEN}${CHECK} OptiLLM installed in virtual environment${NC}"
    else
        echo -e "${GREEN}${CHECK} OptiLLM virtual environment found at $VENV_PATH${NC}"
    fi
    
    # Test installation
    echo -e "${TEST} Testing OptiLLM installation..."
    source "$VENV_PATH/bin/activate"
    if optillm --version > /dev/null 2>&1; then
        echo -e "${GREEN}${CHECK} OptiLLM installation verified${NC}"
        echo -e "${GREEN}${FIRE} OptiLLM setup complete!${NC}"
        echo -e "${LIGHTBULB} Use './setup.sh start' to start the proxy${NC}"
    else
        echo -e "${RED}❌ OptiLLM installation failed${NC}"
        exit 1
    fi
}

start_optillm() {
    print_status
    
    # Check if already running
    if pgrep -f "optillm.*$OPTILLM_PORT" > /dev/null; then
        echo -e "${WARNING} OptiLLM is already running on port $OPTILLM_PORT${NC}"
        echo -e "${LIGHTBULB} Use 'pkill -f optillm' to stop it first${NC}"
        return 1
    fi
    
    # Detect backend configuration
    BACKEND_URL="$DEFAULT_BACKEND"
    EXTRA_ARGS=""
    
    if detect_azure_config; then
        echo -e "${LIGHTBULB} Choose backend configuration:"
        echo -e "  1) Direct Azure OpenAI (recommended for optimization)"
        echo -e "  2) Pollinations proxy (default)"
        read -p "Enter choice (1 or 2): " choice
        
        if [ "$choice" = "1" ]; then
            BACKEND_URL="$AZURE_BASE_URL"
            export OPENAI_API_KEY="$AZURE_API_KEY"
            echo -e "${SATELLITE} Using direct Azure OpenAI backend"
            echo -e "${SATELLITE} Backend: $BACKEND_URL"
            echo -e "${SATELLITE} Model: $AZURE_MODEL_NAME"
        else
            export OPENAI_API_KEY="sk-placeholder-key"
            echo -e "${SATELLITE} Using Pollinations proxy backend"
        fi
    else
        export OPENAI_API_KEY="sk-placeholder-key"
        echo -e "${SATELLITE} Using Pollinations proxy backend (no Azure config found)"
    fi
    
    echo -e "${SATELLITE} Starting OptiLLM proxy on port $OPTILLM_PORT..."
    echo -e "${SATELLITE} Proxying to: $BACKEND_URL"
    
    # Start OptiLLM in background
    source "$VENV_PATH/bin/activate"
    nohup optillm --port $OPTILLM_PORT --base-url "$BACKEND_URL" --approach none --log info > optillm.log 2>&1 &
    
    # Wait a moment and check if it started
    sleep 3
    if pgrep -f "optillm.*$OPTILLM_PORT" > /dev/null; then
        PID=$(pgrep -f "optillm.*$OPTILLM_PORT")
        echo -e "${GREEN}${CHECK} OptiLLM started successfully${NC}"
        echo -e "${GREEN}${CHECK} PID: $PID${NC}"
        echo -e "${LIGHTBULB} Check logs: tail -f optillm.log${NC}"
    else
        echo -e "${RED}❌ Failed to start OptiLLM${NC}"
        echo -e "${LIGHTBULB} Check optillm.log for errors${NC}"
        exit 1
    fi
}

stop_optillm() {
    echo -e "${WARNING} Stopping OptiLLM..."
    pkill -f optillm || echo "No OptiLLM process found"
    echo -e "${GREEN}${CHECK} OptiLLM stopped${NC}"
}

test_request() {
    echo -e "${TEST} Testing OptiLLM with sample request..."
    
    curl -s -X POST "http://localhost:$OPTILLM_PORT/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "openai-large",
            "messages": [{"role": "user", "content": "Hello from OptiLLM!"}],
            "max_tokens": 50
        }' | jq -r '.choices[0].message.content' || echo "❌ Test request failed"
}

# Main execution based on arguments
case "${1:-setup}" in
    "setup")
        setup_optillm
        ;;
    
    "start")
        start_optillm
        ;;
    
    "stop")
        stop_optillm
        ;;
    
    "restart")
        stop_optillm
        sleep 2
        start_optillm
        ;;
    
    "test")
        test_request
        ;;
    
    "status")
        if pgrep -f "optillm.*$OPTILLM_PORT" > /dev/null; then
            echo -e "${GREEN}${CHECK} OptiLLM is running on port $OPTILLM_PORT${NC}"
            PID=$(pgrep -f "optillm.*$OPTILLM_PORT")
            echo -e "${GREEN}${CHECK} PID: $PID${NC}"
        else
            echo -e "${RED}❌ OptiLLM is not running${NC}"
        fi
        ;;
    
    *)
        echo "Usage: $0 {setup|start|stop|restart|test|status}"
        echo ""
        echo "Commands:"
        echo "  setup   - Install OptiLLM in virtual environment"
        echo "  start   - Start OptiLLM proxy server"
        echo "  stop    - Stop OptiLLM proxy server"
        echo "  restart - Restart OptiLLM proxy server"
        echo "  test    - Send test request to OptiLLM"
        echo "  status  - Check if OptiLLM is running"
        exit 1
        ;;
esac
