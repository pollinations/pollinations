import os
import torch
import time
import requests
from flask import Flask, request, jsonify
from PIL import Image
from io import BytesIO
from upscaler import upscale_image

# Flask App Setup
app = Flask(__name__)

# Configurations
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5MB file size limit but pollinations may change it 
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}

def allowed_file(filename):
    """Check if the uploaded file is allowed."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route("/upscale", methods=["POST"])
def upscale():
    start_time = time.time()

    # Check for an image URL or a direct file upload
    image_url = request.form.get("image_url")
    file = request.files.get("image")

    if not image_url and not file:
        return jsonify({"error": "No image provided. Use 'image_url' or 'image'."}), 400

    try:
        if image_url:
            response = requests.get(image_url, stream=True, timeout=5)
            if response.status_code != 200:
                return jsonify({"error": "Failed to fetch image from URL."}), 400
            img = Image.open(BytesIO(response.content)).convert("RGB")

        elif file and allowed_file(file.filename):
            img = Image.open(BytesIO(file.read())).convert("RGB")  

        else:
            return jsonify({"error": "Invalid file format."}), 400

        # Run upscaling
        upscaled_image_path = upscale_image(img)

        elapsed_time = round(time.time() - start_time, 2)
        return jsonify({
            "message": "Upscaling complete!",
            "upscaled_image_url": f"https://cloudflare-hosted-pollinations-server/{upscaled_image_path}",
            "processing_time": f"{elapsed_time} sec"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
