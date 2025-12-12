echo "Starting ESRGAN model servers..."
cd ~/pollinations/image.pollinations.ai/image_upscaler/
echo "Starting Quart application with background cleanup..."
python api/server.py

wait