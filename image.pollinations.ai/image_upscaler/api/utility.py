from config import MAX_8K_DIMENSION, MAX_4K_DIMENSION, MAX_2K_DIMENSION, RESOLUTION_TARGETS, UPSCALING_THRESHOLDS
from loguru import logger
from PIL import Image
from config import MAX_FILE_SIZE, UPLOAD_FOLDER, MAX_IMAGE_DIMENSION
import os
from concurrent.futures import ThreadPoolExecutor
import io
import time 


executor = ThreadPoolExecutor(max_workers=10)


def parse_target_resolution(target: str) -> int:
    try:
        target_lower = str(target).lower().strip()
        if target_lower in RESOLUTION_TARGETS:
            return RESOLUTION_TARGETS[target_lower]
        pixel_value = int(target)
        if pixel_value > 0:
            return pixel_value
        
        logger.warning(f"Invalid target resolution '{target}', defaulting to 4K")
        return RESOLUTION_TARGETS['4k']
    except (ValueError, TypeError):
        logger.warning(f"Could not parse target resolution '{target}', defaulting to 4K")
        return RESOLUTION_TARGETS['4k']

def validate_upscaling_request(image_width: int, image_height: int, target_resolution: str) -> dict:
    target_lower = str(target_resolution).lower().strip()
    
    if target_lower not in UPSCALING_THRESHOLDS:
        return {
            'allowed': False,
            'reason': f"Unknown target resolution: {target_resolution}",
            'threshold_config': None,
            'max_input_dimension': 0,
            'max_scale_factor': 0,
            'image_max_dimension': max(image_width, image_height)
        }
    
    threshold_config = UPSCALING_THRESHOLDS[target_lower]
    max_input_dimension = threshold_config['max_input_dimension']
    max_scale_factor = threshold_config['max_scale_factor']
    image_max_dimension = max(image_width, image_height)
    if image_max_dimension > max_input_dimension:
        return {
            'allowed': False,
            'reason': f"Image too large for {target_resolution.upper()} upscaling. "
                     f"Max input dimension: {max_input_dimension}px, "
                     f"your image: {image_max_dimension}px. "
                     f"({threshold_config['description']})",
            'threshold_config': threshold_config,
            'max_input_dimension': max_input_dimension,
            'max_scale_factor': max_scale_factor,
            'image_max_dimension': image_max_dimension
        }
    
    return {
        'allowed': True,
        'reason': f"Request meets thresholds for {target_resolution.upper()} upscaling",
        'threshold_config': threshold_config,
        'max_input_dimension': max_input_dimension,
        'max_scale_factor': max_scale_factor,
        'image_max_dimension': image_max_dimension
    }

def calculate_upscale_strategy(image_width: int, image_height: int, target_max_dimension: int) -> dict:
    max_dimension = max(target_max_dimension, MAX_8K_DIMENSION)
    max_current_dimension = max(image_width, image_height)
    if max_current_dimension >= max_dimension:
        logger.info(f"Image already at or exceeds target dimension {max_current_dimension}px >= {max_dimension}px")
        return {
            'can_upscale': False,
            'strategy': [],
            'final_width': image_width,
            'final_height': image_height,
            'total_scale': 1.0,
            'reason': 'Image already meets or exceeds target resolution'
        }
    strategy = []
    current_width = image_width
    current_height = image_height
    total_scale = 1.0
    for pass_num in range(2):
        next_width = current_width * 2
        next_height = current_height * 2
        next_max_dimension = max(next_width, next_height)
        if next_max_dimension <= max_dimension:
            strategy.append(2)
            current_width = next_width
            current_height = next_height
            total_scale *= 2
            logger.info(f"Pass {pass_num + 1}: Can apply 2x upscaling -> {current_width}x{current_height}")
        else:
            logger.info(f"Pass {pass_num + 1}: Cannot apply 2x (would be {next_width}x{next_height}, exceeds {max_dimension}px)")
            break
    if len(strategy) == 0:
        max_scale_width = max_dimension / image_width
        max_scale_height = max_dimension / image_height
        optimal_scale = min(max_scale_width, max_scale_height)
        if optimal_scale >= 2:
            strategy.append(2)
            current_width = image_width * 2
            current_height = image_height * 2
            total_scale = 2.0
            logger.info(f"Using 2x upscaling: {current_width}x{current_height}")
        else:
            logger.warning(f"Image too large for any upscaling (max possible scale: {optimal_scale:.2f}x)")
            return {
                'can_upscale': False,
                'strategy': [],
                'final_width': image_width,
                'final_height': image_height,
                'total_scale': 1.0,
                'reason': f'Image too large for upscaling within limits (max scale: {optimal_scale:.2f}x)'
            }
    return {
        'can_upscale': len(strategy) > 0,
        'strategy': strategy,
        'final_width': current_width,
        'final_height': current_height,
        'total_scale': total_scale,
        'reason': f'Applied {len(strategy)} upscaling pass(es) with total scale {total_scale}x'
    }


def validate_and_prepare_image(image_data: bytes):
    try:
        if len(image_data) > MAX_FILE_SIZE:
            raise Exception(f"Image too large: {len(image_data)} bytes (max: {MAX_FILE_SIZE})")
        img = Image.open(io.BytesIO(image_data))
        width, height = img.size
        
        if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
            raise Exception(f"Image dimensions too large: {width}x{height} (max: {MAX_IMAGE_DIMENSION})")
        
        temp_file = os.path.join(UPLOAD_FOLDER, f"temp_{int(time.time() * 1000)}.jpg")
        img.save(temp_file, format="JPEG", quality=95)
        
        return temp_file, width, height, img.format
    except Exception as e:
        raise Exception(f"Invalid image: {str(e)}")