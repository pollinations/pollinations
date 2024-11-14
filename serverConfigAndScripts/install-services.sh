#!/bin/bash

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting service installation script"

# Get the public IP address
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)

# Check if the flag file exists
FLAG_FILE="/home/ubuntu/ComfyUI/models/all_models_downloaded_schnell_${PUBLIC_IP}.flag"

if [ -f "$FLAG_FILE" ]; then
    log "Flag file exists. Skipping downloads."
else
    # Navigate to the UNET models directory
    log "Navigating to UNET models directory"
    cd /home/ubuntu/ComfyUI/models/unet/ || { log "ERROR: Failed to change directory to UNET models"; exit 1; }

    # Download the required UNET model file, overwriting any existing file
    log "Downloading flux1-schnell-fp8-e4m3fn.safetensors"
    if wget -O flux1-schnell-fp8-e4m3fn.safetensors https://huggingface.co/Kijai/flux-fp8/resolve/main/flux1-schnell-fp8-e4m3fn.safetensors; then
        log "flux1-schnell-fp8-e4m3fn.safetensors downloaded successfully"
    else
        log "ERROR: Failed to download flux1-schnell-fp8-e4m3fn.safetensors"
        exit 1
    fi

    # # use https://huggingface.co/shuttleai/shuttle-3-diffusion-fp8/resolve/main/shuttle-3-diffusion-fp8.safetensors
    # if wget -O flux1-schnell-fp8-e4m3fn.safetensors https://huggingface.co/shuttleai/shuttle-3-diffusion-fp8/resolve/main/shuttle-3-diffusion-fp8.safetensors; then
    #     log "flux1-shuttle-fp8 downloaded successfully"
    # else
    #     log "ERROR: Failed to download flux1-shuttle-fp8"
    #     exit 1
    # fi

    # Navigate to the CLIP models directory
    log "Navigating to CLIP models directory"
    cd /home/ubuntu/ComfyUI/models/clip/ || { log "ERROR: Failed to change directory to CLIP models"; exit 1; }

    # Download the new CLIP model, overwriting any existing file
    log "Downloading ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors"
    if wget -O ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors https://huggingface.co/zer0int/CLIP-GmP-ViT-L-14/resolve/main/ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors; then
        log "ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors downloaded successfully"
    else
        log "ERROR: Failed to download ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors"
        exit 1
    fi

    # Download the additional CLIP model, overwriting any existing file
    log "Downloading t5xxl_fp8_e4m3fn.safetensors"
    if wget -O t5xxl_fp8_e4m3fn.safetensors https://huggingface.co/lllyasviel/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors; then
        log "t5xxl_fp8_e4m3fn.safetensors downloaded successfully"
    else
        log "ERROR: Failed to download t5xxl_fp8_e4m3fn.safetensors"
        exit 1
    fi

    # Navigate to the VAE models directory
    log "Navigating to VAE models directory"
    cd /home/ubuntu/ComfyUI/models/vae/ || { log "ERROR: Failed to change directory to VAE models"; exit 1; }

    # Download the required VAE model file, overwriting any existing file
    log "Downloading ae.safetensors"
    if wget -O ae.safetensors https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors; then
        log "ae.safetensors downloaded successfully"
    else
        log "ERROR: Failed to download ae.safetensors"
        exit 1
    fi

    # Create the flag file
    touch "$FLAG_FILE" && log "Flag file created"
fi

# Update ComfyUI and its custom nodes
log "Updating ComfyUI and its custom nodes"

# Navigate to the ComfyUI directory
log "Navigating to ComfyUI directory"
cd /home/ubuntu/ComfyUI || { log "ERROR: Failed to change directory to ComfyUI"; exit 1; }

# Pull the latest changes from the repository
log "Pulling latest changes from the repository"
git pull || { log "ERROR: Failed to pull latest changes"; exit 1; }

# Navigate to the custom_nodes subfolder and run git pull in each subfolder
log "Navigating to custom_nodes subfolder and updating each subfolder"
cd custom_nodes || { log "ERROR: Failed to change directory to custom_nodes"; exit 1; }
for dir in */; do
    if [ -d "$dir" ]; then
        log "Updating $dir"
        cd "$dir" && git pull || { log "ERROR: Failed to pull latest changes in $dir"; exit 1; }
        cd ..
    fi
done

# Navigate back to the ComfyUI directory
log "Navigating back to ComfyUI directory"
cd /home/ubuntu/ComfyUI || { log "ERROR: Failed to change directory to ComfyUI"; exit 1; }

# Activate the environment and upgrade dependencies
log "Activating environment and upgrading dependencies"
source comfyenv/bin/activate && pip install --upgrade -r requirements.txt || { log "ERROR: Failed to upgrade dependencies"; exit 1; }

# change folder to /home/ubuntu/pollinations/serverConfigAndScripts
cd /home/ubuntu/pollinations/serverConfigAndScripts || { log "ERROR: Failed to change directory to /home/ubuntu/pollinations/serverConfigAndScripts"; exit 1; }

# Copy service files to systemd directory
log "Copying service files to /etc/systemd/system/"
sudo cp pollinations-comfyui.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-comfyui.service"; exit 1; }
sudo cp pollinations-pyserver.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-pyserver.service"; exit 1; }
sudo cp pollinations-libretranslate.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-libretranslate.service"; exit 1; }
sudo cp pollinations-turbo.service /etc/systemd/system/ || { log "ERROR: Failed to copy pollinations-turbo.service"; exit 1; }

# Set correct permissions for the service files
log "Setting permissions for service files"
sudo chmod 644 /etc/systemd/system/pollinations-comfyui.service || { log "ERROR: Failed to set permissions for pollinations-comfyui.service"; exit 1; }
sudo chmod 644 /etc/systemd/system/pollinations-pyserver.service || { log "ERROR: Failed to set permissions for pollinations-pyserver.service"; exit 1; }
sudo chmod 644 /etc/systemd/system/pollinations-libretranslate.service || { log "ERROR: Failed to set permissions for pollinations-libretranslate.service"; exit 1; }
sudo chmod 644 /etc/systemd/system/pollinations-turbo.service || { log "ERROR: Failed to set permissions for pollinations-turbo.service"; exit 1; }
# Reload systemd to recognize new services
log "Reloading systemd"
sudo systemctl daemon-reload || { log "ERROR: Failed to reload systemd"; exit 1; }

# Enable the services
log "Enabling services"
sudo systemctl enable pollinations-comfyui.service || { log "ERROR: Failed to enable pollinations-comfyui.service"; exit 1; }
sudo systemctl enable pollinations-pyserver.service || { log "ERROR: Failed to enable pollinations-pyserver.service"; exit 1; }
sudo systemctl enable pollinations-libretranslate.service || { log "ERROR: Failed to enable pollinations-libretranslate.service"; exit 1; }
sudo systemctl enable pollinations-turbo.service || { log "ERROR: Failed to enable pollinations-turbo.service"; exit 1; }

log "Services installed successfully"
log "You can now start the services with:"
log "sudo systemctl start pollinations-comfyui.service"
log "sudo systemctl start pollinations-pyserver.service"
log "sudo systemctl start pollinations-libretranslate.service"
log "sudo systemctl start pollinations-turbo.service"

log "To follow the logs for each service, use the following commands:"
log "sudo journalctl -u pollinations-comfyui.service -f"
log "sudo journalctl -u pollinations-pyserver.service -f"
log "sudo journalctl -u pollinations-libretranslate.service -f"
log "sudo journalctl -u pollinations-turbo.service -f"