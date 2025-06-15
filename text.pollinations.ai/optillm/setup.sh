#!/bin/bash

# OptiLLM Setup Script for Pollinations
# This script sets up OptiLLM as a proxy for enhanced LLM inference

set -e

OPTILLM_VENV_PATH="/home/ubuntu/optillm-venv"
OPTILLM_PORT=8100
POLLINATIONS_OPENAI_ENDPOINT="https://text.pollinations.ai/openai"

echo "🚀 Setting up OptiLLM for Pollinations..."

# Function to check if virtual environment exists
check_venv() {
    if [ -d "$OPTILLM_VENV_PATH" ]; then
        echo "✅ OptiLLM virtual environment found at $OPTILLM_VENV_PATH"
        return 0
    else
        echo "❌ OptiLLM virtual environment not found"
        return 1
    fi
}

# Function to create and setup virtual environment
setup_venv() {
    echo "📦 Creating OptiLLM virtual environment..."
    python3 -m venv "$OPTILLM_VENV_PATH"
    
    echo "📥 Installing OptiLLM..."
    "$OPTILLM_VENV_PATH/bin/pip" install --upgrade pip
    "$OPTILLM_VENV_PATH/bin/pip" install optillm
    
    echo "✅ OptiLLM installed successfully"
}

# Function to test OptiLLM installation
test_installation() {
    echo "🧪 Testing OptiLLM installation..."
    "$OPTILLM_VENV_PATH/bin/optillm" --help > /dev/null
    echo "✅ OptiLLM installation verified"
}

# Function to start OptiLLM proxy
start_optillm() {
    echo "🌐 Starting OptiLLM proxy on port $OPTILLM_PORT..."
    echo "📡 Proxying to: $POLLINATIONS_OPENAI_ENDPOINT"
    
    export OPENAI_API_KEY="sk-placeholder-key"
    
    # Check if already running
    if lsof -Pi :$OPTILLM_PORT -sTCP:LISTEN -t >/dev/null; then
        echo "⚠️  OptiLLM is already running on port $OPTILLM_PORT"
        echo "💡 Use 'pkill -f optillm' to stop it first"
        return 1
    fi
    
    echo "▶️  Starting OptiLLM..."
    "$OPTILLM_VENV_PATH/bin/optillm" \
        --port $OPTILLM_PORT \
        --base_url "$POLLINATIONS_OPENAI_ENDPOINT" \
        --log info &
    
    OPTILLM_PID=$!
    echo "🆔 OptiLLM started with PID: $OPTILLM_PID"
    
    # Wait a moment for startup
    sleep 3
    
    # Test if it's responding
    if curl -s "http://localhost:$OPTILLM_PORT/v1/models" > /dev/null; then
        echo "✅ OptiLLM proxy is responding on http://localhost:$OPTILLM_PORT"
        echo "🎯 Ready to handle requests!"
    else
        echo "❌ OptiLLM proxy is not responding"
        return 1
    fi
}

# Function to stop OptiLLM
stop_optillm() {
    echo "🛑 Stopping OptiLLM..."
    pkill -f optillm || echo "No OptiLLM process found"
    echo "✅ OptiLLM stopped"
}

# Function to test OptiLLM with a sample request
test_request() {
    echo "🧪 Testing OptiLLM with sample request..."
    
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
        if ! check_venv; then
            setup_venv
        fi
        test_installation
        echo "🎉 OptiLLM setup complete!"
        echo "💡 Use './setup.sh start' to start the proxy"
        ;;
    
    "start")
        if ! check_venv; then
            echo "❌ OptiLLM not installed. Run './setup.sh setup' first"
            exit 1
        fi
        start_optillm
        ;;
    
    "stop")
        stop_optillm
        ;;
    
    "restart")
        stop_optillm
        sleep 2
        if check_venv; then
            start_optillm
        fi
        ;;
    
    "test")
        test_request
        ;;
    
    "status")
        if lsof -Pi :$OPTILLM_PORT -sTCP:LISTEN -t >/dev/null; then
            echo "✅ OptiLLM is running on port $OPTILLM_PORT"
            PID=$(lsof -Pi :$OPTILLM_PORT -sTCP:LISTEN -t)
            echo "🆔 PID: $PID"
        else
            echo "❌ OptiLLM is not running"
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
