echo "Starting ESRGAN model servers..."
cd ~/upscale.pollinations
echo "Starting Quart application with background cleanup..."
python api/app.py

wait