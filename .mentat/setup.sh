#!/bin/bash
set +e  # Continue on errors

echo "Minimal setup script - installing only essential tools needed for precommit"

# We install only the formatter tools needed for the precommit script
# This keeps the script fast and prevents timeouts
echo "Installing prettier and eslint globally..."
npm install -g prettier eslint

echo "Basic setup completed!"
echo ""
echo "NOTE: This is a minimal setup that only installs formatting tools."
echo "For development, you'll need to manually install dependencies for each project:"
echo ""
echo "  cd text.pollinations.ai && npm install"
echo "  cd image.pollinations.ai && npm install"
echo "  cd pollinations.ai && npm install"
echo "  cd pollinations-react && npm install"
echo "  cd model-context-protocol && npm install"
echo ""
echo "Python dependencies were skipped to prevent timeout."
echo "The precommit script will work with just the formatter tools installed."
