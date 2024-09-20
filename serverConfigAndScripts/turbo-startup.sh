#!/bin/bash

# Start the ComfyUI server
cd /home/ubuntu/pollinations/image_gen_dmd2/

# if venv not found, create it
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# activate venv
source venv/bin/activate

# install requirements
pip install -r requirements.txt

# start the server
python3 -m demo.text_to_image_sdxl