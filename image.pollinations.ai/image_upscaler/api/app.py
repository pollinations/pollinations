from quart import Quart, request, jsonify
import asyncio
import base64
import os
from loguru import logger
import time
from upscale import upscale_image_pipeline
from quart_cors import cors
from config import UPLOAD_FOLDER, MAX_BASE64_SIZE
from utility import validate_and_prepare_image, executor



app = Quart(__name__)
cors(app, allow_origin="*")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


async def process_upscale(image_path: str, target_resolution: str, enhance_faces: bool = True):
    loop = asyncio.get_event_loop()
    try:
        output_file = os.path.join(UPLOAD_FOLDER, f"upscaled_{int(time.time() * 1000)}.jpg")
        result = await loop.run_in_executor(
            executor, 
            upscale_image_pipeline, 
            image_path, 
            output_file,
            target_resolution,
            enhance_faces
        )
        if result["success"]:
            with open(result["file_path"], "rb") as f:
                img_bytes = f.read()
                result["base64"] = base64.b64encode(img_bytes).decode()
        
        return result
    except Exception as e:
        logger.error(f"Upscaling error: {e}")
        raise


@app.route('/upscale', methods=['POST'])
async def upscale_endpoint():
    start_time = time.time()
    
    try:
        data = await request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        image_b64 = data.get('image_b64')
        target_resolution = data.get('target_resolution', '4k').lower()
        enhance_faces = data.get('enhance_faces', True)
        
        if not image_b64:
            return jsonify({"error": "image_b64 is required"}), 400
        
        if target_resolution not in ['2k', '4k', '8k']:
            return jsonify({"error": "Target resolution must be 2k, 4k, or 8k"}), 400
        
        try:
            image_data = base64.b64decode(image_b64)
        except Exception as e:
            logger.error(f"Base64 decode failed: {e}")
            return jsonify({"error": "Invalid base64 encoding"}), 400
        
        if len(image_data) > MAX_BASE64_SIZE:
            return jsonify({"error": f"Image too large: {len(image_data)} bytes (max: {MAX_BASE64_SIZE} bytes)"}), 400
        
        try:
            temp_image_path, width, height, img_format = validate_and_prepare_image(image_data)
            logger.info(f"Image validated: {width}x{height}, format: {img_format}, size: {len(image_data)} bytes")
        except Exception as e:
            logger.error(f"Image validation failed: {e}")
            return jsonify({"error": str(e)}), 400
        
        try:
            logger.info(f"Starting upscaling: {width}x{height} -> target: {target_resolution}")
            result = await process_upscale(temp_image_path, target_resolution, enhance_faces)
            
            if not result["success"]:
                return jsonify({"error": result["error"]}), 400
            
            processing_time = time.time() - start_time
            logger.info(f"Upscaling completed in {processing_time:.2f}s")
            
            return jsonify({
                "success": True,
                "file_path": result["file_path"],
                "base64": result["base64"],
                "original_size": result["original_size"],
                "upscaled_size": result["upscaled_size"],
                "target_resolution": result["target_resolution"],
                "total_scale": result["total_scale"],
                "upscaling_strategy": result["upscaling_strategy"],
                "faces_detected": result["faces_detected"],
                "faces_enhanced": result["faces_enhanced"],
                "processing_time": round(processing_time, 2)
            })
            
        except Exception as e:
            logger.error(f"Upscaling failed: {e}")
            return jsonify({"error": f"Upscaling failed: {str(e)}"}), 500
    
    except Exception as e:
        logger.error(f"Unexpected error in upscale endpoint: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route('/health', methods=['GET'])
async def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": time.time(),
        "max_image_size_mb": MAX_BASE64_SIZE / 1024 / 1024,
        "supported_resolutions": ["2k", "4k", "8k"]
    })


if __name__ == '__main__':
    logger.info("Starting Quart application...")
    app.run(host='0.0.0.0', port=8000, debug=False, workers=4)