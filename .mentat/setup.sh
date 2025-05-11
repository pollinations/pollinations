#!/bin/bash
set +e  # Continue on errors

# Defaults
INSTALL_PYTHON=0
INSTALL_NODE=1

# Parse command line arguments
while [ "$#" -gt 0 ]; do
  case "$1" in
    --python) INSTALL_PYTHON=1; shift 1;;
    --no-node) INSTALL_NODE=0; shift 1;;
    --help) 
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --python     Install Python dependencies (may be slow)"
      echo "  --no-node    Skip Node.js dependencies"
      echo "  --help       Show this help message"
      exit 0
      ;;
    *) echo "Unknown parameter: $1"; exit 1;;
  esac
done

# Essential system dependencies (minimal set needed for Node.js projects)
echo "Installing essential system dependencies..."
apt-get update
apt-get install -y build-essential make python2

# Set up Python environment only if requested
if [ "$INSTALL_PYTHON" -eq 1 ]; then
    echo "Installing Python dependencies (this may take a while)..."
    apt-get install -y python3-venv python3-dev node-gyp libvips-dev libvips libjpeg-dev libpng-dev gcc g++
    
    echo "Setting up Python virtual environment..."
    python3 -m venv venv
    . venv/bin/activate
    pip3 install --upgrade pip

    # Install Python requirements if the file exists
    if [ -f "image.pollinations.ai/image_gen_dmd2/requirements.txt" ]; then
        echo "Installing Python requirements (this can take several minutes)..."
        # Set a timeout to avoid the script hanging indefinitely
        timeout 180 pip3 install -r image.pollinations.ai/image_gen_dmd2/requirements.txt || echo "Python requirements installation timed out, continuing anyway"
        if [ -f "setup.py" ]; then
            timeout 60 pip3 install -e . || echo "setup.py installation timed out, continuing anyway"
        fi
    else
        echo "Python requirements file not found, skipping."
    fi
else
    echo "Skipping Python dependencies installation (use --python to install)"
fi

# Install Node.js dependencies
if [ "$INSTALL_NODE" -eq 1 ]; then
    # Install prettier and eslint globally for the precommit script
    echo "Installing global Node.js tools..."
    npm install -g prettier eslint
    
    # Install dependencies for each Node.js project
    echo "Installing Node.js project dependencies..."
    
    # Array of directories to process
    NODE_PROJECTS=("text.pollinations.ai" "image.pollinations.ai" "pollinations.ai" "pollinations-react" "model-context-protocol")
    
    for project in "${NODE_PROJECTS[@]}"; do
        if [ -d "$project" ]; then
            echo "Installing dependencies for $project..."
            # Use npm install instead of npm ci for better compatibility
            (cd "$project" && npm install --no-fund --no-audit --loglevel=error) || echo "Warning: Failed to install dependencies for $project"
        fi
    done
else
    echo "Skipping Node.js dependencies installation (use --no-node to skip)"
fi

echo "Setup completed! Some components may have been skipped."
echo ""
echo "To complete the setup with additional components, run:"
echo "  .mentat/setup.sh --python   # To install Python dependencies"
echo ""
echo "The precommit script will work with just the Node.js dependencies."
