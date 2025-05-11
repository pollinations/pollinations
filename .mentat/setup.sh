#!/bin/bash
set +e  # Continue on errors

echo "Installing system dependencies..."
apt-get update
apt-get install -y python3-venv build-essential python3-dev node-gyp \
    libvips-dev libvips libjpeg-dev libpng-dev gcc g++ make python2

# Set up Python environment for image generation
echo "Setting up Python environment..."
python3 -m venv venv
. venv/bin/activate
pip3 install --upgrade pip

# Install Python requirements if the file exists
if [ -f "image.pollinations.ai/image_gen_dmd2/requirements.txt" ]; then
    echo "Installing Python requirements..."
    pip3 install -r image.pollinations.ai/image_gen_dmd2/requirements.txt
    pip3 install -e .
else
    echo "Python requirements file not found, skipping."
fi

# Install global Node.js tools
echo "Installing global Node.js tools..."
npm install -g node-pre-gyp node-gyp prettier eslint

# Set environment variables for node-gyp
export NODE_GYP_FORCE_PYTHON=/usr/bin/python2
export npm_config_python=/usr/bin/python2

# Install dependencies for each project
if [ -d "text.pollinations.ai" ]; then
    echo "Installing text.pollinations.ai dependencies..."
    (cd text.pollinations.ai && npm ci)
fi

if [ -d "image.pollinations.ai" ]; then
    echo "Installing image.pollinations.ai dependencies..."
    (cd image.pollinations.ai && npm ci)
fi

if [ -d "pollinations.ai" ]; then
    echo "Installing pollinations.ai dependencies..."
    (cd pollinations.ai && npm ci)
fi

if [ -d "pollinations-react" ]; then
    echo "Installing pollinations-react dependencies..."
    (cd pollinations-react && npm ci)
fi

if [ -d "model-context-protocol" ]; then
    echo "Installing model-context-protocol dependencies..."
    (cd model-context-protocol && npm ci)
fi

echo "Setup completed successfully!"
