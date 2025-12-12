MODEL_DIR = "model_cache"
MODEL_PATH_x4 = "model_cache/RealESRGAN_x4plus.pth"
MODEL_PATH_x2 = "model_cache/RealESRGAN_x2plus.pth"
FACE_ENHANCER_MODEL = "model_cache/GFPGANv1.4.pth"
NUM_SERVERS = 2
MAX_FILE_SIZE = 7 * 1024 * 1024  
MAX_IMAGE_DIMENSION = 2048 
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'bmp'}
CLEANUP_INTERVAL = 300  
FILE_MAX_AGE = 300  

MAX_8K_DIMENSION = 7680  
MAX_4K_DIMENSION = 3840  
MAX_2K_DIMENSION = 2048  
RESOLUTION_TARGETS = {
    '2k': 2048,
    '4k': 3840,
    '8k': 7680
}

UPSCALING_THRESHOLDS = {
    '2k': {
        'max_input_dimension': 2048,
        'max_scale_factor': 1.0,
        'description': 'No upscaling for 2K target'
    },
    '4k': {
        'max_input_dimension': 2048,  
        'max_scale_factor': 2.0,
        'description': '4K: Max 2x upscaling'
    },
    '8k': {
        'max_input_dimension': 2048,   
        'max_scale_factor': 4.0,
        'description': '8K: Max 4x upscaling'
    }
}

MAX_BASE64_SIZE = 8 * 1024 * 1024
