#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting LibreTranslate startup script"

# Navigate to the home directory
cd $HOME || { log "ERROR: Failed to change directory to $HOME"; exit 1; }

# Check if the virtual environment exists, if not create it
if [ ! -d "libretranslateenv" ]; then
    log "Creating virtual environment for LibreTranslate"
    python3 -m venv libretranslateenv || { log "ERROR: Failed to create virtual environment"; exit 1; }
fi

# Activate the virtual environment
log "Activating virtual environment"
source libretranslateenv/bin/activate || { log "ERROR: Failed to activate virtual environment"; exit 1; }

# Install or upgrade LibreTranslate
log "Installing/Upgrading LibreTranslate"
pip install --upgrade libretranslate || { log "ERROR: Failed to install/upgrade LibreTranslate"; exit 1; }

# Start LibreTranslate
log "Starting LibreTranslate"
libretranslate --host 0.0.0.0 --port 5000
