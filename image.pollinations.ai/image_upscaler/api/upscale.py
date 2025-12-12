import numpy as np
import cv2
from PIL import Image
import torch
from loguru import logger
from config import MAX_8K_DIMENSION, MAX_4K_DIMENSION, MAX_2K_DIMENSION, RESOLUTION_TARGETS, UPSCALING_THRESHOLDS
from model_utility import enhance_x2, enhance_x4, enhance_face_x2, enhance_face_x4
from utility import parse_target_resolution, validate_upscaling_request, calculate_upscale_strategy

def detect_faces(image_np):
    try:
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
        return faces
    except Exception as e:
        logger.warning(f"Face detection failed: {e}")
        return np.array([])

def apply_sequential_upscaling(img_array: np.ndarray, strategy: list, enhance_faces: bool = True) -> np.ndarray:
    current_img = img_array
    for pass_num, scale in enumerate(strategy, 1):
        logger.info(f"Applying upscaling pass {pass_num}/{len(strategy)} with scale {scale}x")
        current_img = upscale_image(current_img, scale, enhance_faces=enhance_faces)
    return current_img

def upscale_image(img_array: np.ndarray, scale: int, enhance_faces: bool = True) -> np.ndarray:
    try:
        img_data = {
            'data': img_array.tobytes(),
            'shape': img_array.shape,
            'dtype': str(img_array.dtype)
        }
        if scale == 2:
            if enhance_faces:
                logger.info("Upscaling with 2x face enhancement")
                result = enhance_face_x2(img_data)
            else:
                logger.info("Upscaling with 2x standard enhancement")
                result = enhance_x2(img_data)
        elif scale == 4:
            if enhance_faces:
                logger.info("Upscaling with 4x face enhancement")
                result = enhance_face_x4(img_data)
            else:
                logger.info("Upscaling with 4x standard enhancement")
                result = enhance_x4(img_data)
        else:
            raise ValueError(f"Invalid scale: {scale}. Must be 2 or 4")
        upscaled_img = np.frombuffer(result['data'], dtype=np.uint8).reshape(result['shape'])
        return upscaled_img
    except Exception as e:
        logger.error(f"Error during model server upscaling: {e}")
        raise

def upscale_image_pipeline(image_path: str, output_path: str, target_resolution: str = '4k', enhance_faces: bool = True) -> dict:
    try:
        image_pil = Image.open(image_path).convert('RGB')
        image_np = np.array(image_pil)
        original_height, original_width = image_np.shape[:2]
        
        logger.info(f"Original image size: {original_width}x{original_height}")
        
        target_max_dimension = parse_target_resolution(target_resolution)
        logger.info(f"Target resolution: {target_resolution} ({target_max_dimension}px max dimension)")
        
        validation_result = validate_upscaling_request(original_width, original_height, target_resolution)
        
        if not validation_result['allowed']:
            logger.warning(f"Request rejected: {validation_result['reason']}")
            return {
                "success": False,
                "error": validation_result['reason'],
                "original_size": {"width": original_width, "height": original_height},
                "target_resolution": target_resolution,
                "target_max_dimension": target_max_dimension,
                "validation_failed": True,
                "threshold_info": {
                    "max_input_dimension": validation_result['max_input_dimension'],
                    "max_scale_factor": validation_result['max_scale_factor'],
                    "description": validation_result['threshold_config']['description'] if validation_result['threshold_config'] else None
                }
            }
        
        strategy_result = calculate_upscale_strategy(
            original_width, original_height, target_max_dimension
        )
        
        if not strategy_result['can_upscale']:
            logger.warning(f"Cannot upscale: {strategy_result['reason']}")
            return {
                "success": False,
                "error": strategy_result['reason'],
                "original_size": {"width": original_width, "height": original_height},
                "target_resolution": target_resolution,
                "target_max_dimension": target_max_dimension
            }
        
        faces = []
        if enhance_faces:
            faces = detect_faces(image_np)
            if len(faces) > 0:
                logger.info(f"Detected {len(faces)} face(s)")
        
        logger.info(f"Applying upscaling strategy: {strategy_result['strategy']}")
        upscaled_img = apply_sequential_upscaling(image_np, strategy_result['strategy'], enhance_faces=(len(faces) > 0))
        
        upscaled_pil = Image.fromarray(upscaled_img.astype(np.uint8))
        upscaled_pil.save(output_path, format="JPEG", quality=95)
        logger.info(f"Upscaled image saved to {output_path}")
        
        return {
            "success": True,
            "file_path": output_path,
            "original_size": {"width": original_width, "height": original_height},
            "upscaled_size": {"width": strategy_result['final_width'], "height": strategy_result['final_height']},
            "target_resolution": target_resolution,
            "target_max_dimension": target_max_dimension,
            "upscaling_strategy": strategy_result['strategy'],
            "total_scale": strategy_result['total_scale'],
            "faces_detected": len(faces),
            "faces_enhanced": enhance_faces and len(faces) > 0,
            "strategy_reason": strategy_result['reason'],
            "threshold_validation": {
                "passed": True,
                "max_input_allowed": validation_result['max_input_dimension'],
                "description": validation_result['threshold_config']['description']
            }
        }
    
    except Exception as e:
        logger.error(f"Upscaling pipeline error: {e}")
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    input_image = "in.jpg"
    output_image = "upscaled_output.jpg"
    result = upscale_image_pipeline(input_image, output_image, target_resolution='4k', enhance_faces=True)
    print(f"Processing complete: {result}")
