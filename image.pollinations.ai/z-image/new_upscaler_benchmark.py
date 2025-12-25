import os
import io
import base64
import logging
import torch
import numpy as np
from PIL import Image
from diffusers import ZImagePipeline, StableDiffusionUpscalePipeline
from gfpgan import GFPGANer
import mediapipe as mp
import time
from pydantic import BaseModel, Field
import threading
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from scipy.ndimage import gaussian_filter
from scipy.spatial.distance import cosine
from utility import StableDiffusionSafetyChecker, replace_numpy_with_python, replace_sets_with_lists, numpy_to_pil
from transformers import AutoFeatureExtractor
from skimage import filters

os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TQDM_DISABLE"] = "1"
warnings.filterwarnings("ignore")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)
for noisy in ["httpx", "httpcore", "urllib3", "diffusers", "transformers", "huggingface_hub"]:
    logging.getLogger(noisy).setLevel(logging.WARNING)

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
UPSCALER_MODEL_ID = "stabilityai/stable-diffusion-x4-upscaler"
FACE_ENHANCER_MODEL = "model_cache/GFPGANv1.4.pth"
SAFETY_NSFW_MODEL = "CompVis/stable-diffusion-safety-checker"

MIN_GEN_SIZE = 512
MAX_GEN_SIZE = 768
BLOCK_SIZE = 128
OVERLAP = 32 
UPSCALE_FACTOR = 4
MAX_FINAL_SIZE = 2048
MAX_CONCURRENT_UPSCALES = 4
UPSCALE_INFERENCE_STEPS = 10  
ENABLE_FACE_RESTORATION = True
ENABLE_NSFW_CHECK = False
FLAT_BLOCK_VARIANCE_THRESHOLD = 350.0  
# If we use more -- around 300-400 -- we get more SDXL usage on mildly detailed areas
# We try to keep this range b/w 50 - 500
BLUR_DETECTION_THRESHOLD = 1.5
# If we increase to ~1.3-1.5 to use more SDXL on moderately textured areas
DEBUG_BLOCK_ANALYSIS = False
TARGET_LANCZOS_RATIO = 0.8
# ====================================================

def compute_saliency_map(image_np: np.ndarray) -> np.ndarray:
    if len(image_np.shape) == 3 and image_np.shape[2] >= 3:
        gray = np.mean(image_np[:, :, :3], axis=2)
    else:
        gray = image_np if len(image_np.shape) == 2 else np.mean(image_np, axis=2)
    
    gray = gray.astype(np.float32) / 255.0 if gray.max() > 1 else gray
    
    # 1. Edge detection using Sobel
    edges_x = filters.sobel_h(gray)
    edges_y = filters.sobel_v(gray)
    edge_map = np.sqrt(edges_x**2 + edges_y**2)
    edge_map = edge_map / (edge_map.max() + 1e-8)
    
    # 2. Local contrast (Laplacian)
    laplacian_map = np.abs(filters.laplace(gray))
    laplacian_map = laplacian_map / (laplacian_map.max() + 1e-8)
    
    # 3. Color variance for RGB images
    if len(image_np.shape) == 3 and image_np.shape[2] >= 3:
        rgb_norm = image_np[:, :, :3].astype(np.float32) / 255.0 if image_np.max() > 1 else image_np[:, :, :3].astype(np.float32)
        color_variance = np.var(rgb_norm, axis=2)
        color_variance = color_variance / (color_variance.max() + 1e-8)
    else:
        color_variance = np.zeros_like(gray)
    
    # Combine saliency measures
    saliency = 0.4 * edge_map + 0.4 * laplacian_map + 0.2 * color_variance
    
    # Apply Gaussian smoothing for spatial continuity
    saliency = gaussian_filter(saliency, sigma=2)
    
    # Normalize
    saliency = saliency / (saliency.max() + 1e-8)
    
    return saliency


def get_subject_aware_blocks(image_np: np.ndarray, blocks: list[np.ndarray], 
                             block_positions: list[tuple], padded_dims: tuple,
                             orig_dims: tuple, block_size: int = BLOCK_SIZE,
                             overlap: int = OVERLAP) -> set[int]:
    """
    Identify blocks that contain the main subject using saliency detection.
    Returns set of block indices that should use SDXL (subject blocks).
    Only marks ~15-20% of the image as subject for SDXL processing.
    """
    logger.info("Computing saliency map to identify main subject...")
    saliency = compute_saliency_map(image_np)
    
    padded_h, padded_w = padded_dims
    orig_h, orig_w = orig_dims
    
    # Threshold for subject detection (top 15% of saliency - stricter)
    saliency_threshold = np.percentile(saliency, 85)
    
    subject_blocks = set()
    stride = block_size - overlap
    
    # Create padded saliency map
    padded_saliency = np.zeros((padded_h, padded_w), dtype=np.float32)
    padded_saliency[:orig_h, :orig_w] = saliency
    
    for idx, (y_orig, x_orig, _, _) in enumerate(block_positions):
        y_end = min(y_orig + block_size, padded_h)
        x_end = min(x_orig + block_size, padded_w)
        
        block_saliency = padded_saliency[y_orig:y_end, x_orig:x_end]
        mean_saliency = np.mean(block_saliency)
        max_saliency = np.max(block_saliency)
        if max_saliency > saliency_threshold and mean_saliency > saliency_threshold * 0.8:
            subject_blocks.add(idx)
            if DEBUG_BLOCK_ANALYSIS:
                logger.info(f"  Block {idx}: SUBJECT (mean_sal={mean_saliency:.3f}, max_sal={max_saliency:.3f})")
    
    logger.info(f"Identified {len(subject_blocks)} subject blocks out of {len(blocks)} total blocks for SDXL")
    return subject_blocks

def enforce_upscaler_ratio(total_blocks: int, subject_blocks: set[int], flat_blocks: set[int], 
                           target_lanczos_ratio: float) -> tuple[set[int], set[int]]:
    """
    Enforce target LANCZOS/SDXL ratio across all blocks.
    
    Priority order for LANCZOS (faster, lower quality):
    1. Extremely flat blocks (best candidates for LANCZOS)
    2. Non-subject background blocks (if we need more LANCZOS)
    
    Always preserves subject blocks for SDXL (highest priority).
    
    Args:
        total_blocks: Total number of blocks
        subject_blocks: Set of subject block indices (always SDXL)
        flat_blocks: Set of flat block indices (candidates for LANCZOS)
        target_lanczos_ratio: Target ratio (0.0 = all SDXL, 1.0 = all LANCZOS)
    
    Returns:
        Tuple of (final_subject_blocks, final_flat_blocks) that meet the target ratio
    """
    target_lanczos_count = int(total_blocks * target_lanczos_ratio)
    target_sdxl_count = total_blocks - target_lanczos_count
    
    # Start with what we have
    lanczos_blocks = flat_blocks.copy()
    sdxl_blocks = subject_blocks.copy()
    other_blocks = set(range(total_blocks)) - subject_blocks - flat_blocks
    
    current_lanczos = len(lanczos_blocks)
    current_sdxl = len(sdxl_blocks)
    
    logger.info(f"Target ratio: {target_lanczos_ratio:.1%} LANCZOS, {1-target_lanczos_ratio:.1%} SDXL")
    logger.info(f"Before adjustment: {current_lanczos} LANCZOS, {current_sdxl} SDXL, {len(other_blocks)} unclassified")
    
    # If we need more LANCZOS blocks
    if current_lanczos < target_lanczos_count:
        needed = target_lanczos_count - current_lanczos
        # Convert non-subject detail blocks to LANCZOS
        other_blocks_list = sorted(list(other_blocks))
        take_from_other = min(needed, len(other_blocks_list))
        lanczos_blocks.update(other_blocks_list[:take_from_other])
        for block_idx in other_blocks_list[:take_from_other]:
            other_blocks.discard(block_idx)
        current_lanczos += take_from_other
    
    # If we need fewer LANCZOS blocks (too many)
    elif current_lanczos > target_lanczos_count:
        excess = current_lanczos - target_lanczos_count
        # Remove from flat blocks first (they're candidates)
        flat_blocks_list = sorted(list(flat_blocks))
        remove_from_flat = min(excess, len(flat_blocks_list))
        for block_idx in flat_blocks_list[-remove_from_flat:]:
            lanczos_blocks.discard(block_idx)
            other_blocks.add(block_idx)
        current_lanczos -= remove_from_flat
    
    # Remaining blocks go to SDXL
    sdxl_blocks.update(other_blocks)
    
    final_lanczos_count = len(lanczos_blocks)
    final_sdxl_count = len(sdxl_blocks)
    final_lanczos_ratio = final_lanczos_count / total_blocks if total_blocks > 0 else 0
    
    logger.info(f"After adjustment: {final_lanczos_count} LANCZOS ({final_lanczos_ratio:.1%}), {final_sdxl_count} SDXL ({1-final_lanczos_ratio:.1%})")
    
    return sdxl_blocks, lanczos_blocks

generate_lock = threading.Lock()
upscale_semaphore = threading.Semaphore(MAX_CONCURRENT_UPSCALES)

pipe = None
upscaler_pipeline = None
face_enhancer = None
face_detector = None
SAFETY_EXTRACTOR = None
SAFETY_MODEL = None

timing_report = {}
upscale_stats = {
    "total_blocks": 0,
    "sdxl_blocks": 0,
    "lanczos_blocks": 0,
    "face_enhanced_blocks": 0
}


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, le=4096)
    height: int = Field(default=1024, le=4096)
    steps: int = Field(default=9, le=50)
    seed: int | None = None

def record_time(stage: str, elapsed: float):
    timing_report[stage] = elapsed
    logger.info(f"{stage}: {elapsed:.2f}s")


def detect_faces_mediapipe(image_np, face_detector):
    results = face_detector.process(image_np)
    if not results.detections:
        return []
    h, w = image_np.shape[:2]
    faces = []
    for detection in results.detections:
        bbox = detection.location_data.relative_bounding_box
        x = int(bbox.xmin * w)
        y = int(bbox.ymin * h)
        w_box = int(bbox.width * w)
        h_box = int(bbox.height * h)
        
        padding = int(max(w_box, h_box) * 0.2)
        x = max(0, x - padding)
        y = max(0, y - padding)
        w_box = min(w_box + 2 * padding, w - x)
        h_box = min(h_box + 2 * padding, h - y)
        
        if w_box > 0 and h_box > 0:
            faces.append((x, y, w_box, h_box))
    return faces


def create_feather_mask(size: int, overlap: int) -> np.ndarray:
    mask = np.ones((size, size), dtype=np.float32)
    if overlap > 0:
        for i in range(overlap):
            alpha = i / overlap
            mask[i, :] *= alpha
            mask[-i-1, :] *= alpha
            mask[:, i] *= alpha
            mask[:, -i-1] *= alpha
    return mask


def is_flat_or_smooth_block(block: np.ndarray) -> bool:
    """
    Detect if a block is flat (solid color), smooth (sky, blurred areas) or has very low detail.
    Uses variance and edge detection to determine if upscaling is necessary.
    
    Only returns True for VERY flat/smooth areas (pure background).
    Most detail-containing blocks will return False to use SDXL.
    
    Uses global thresholds:
    - FLAT_BLOCK_VARIANCE_THRESHOLD: Higher value = more SDXL usage (more sensitive to detail)
    - BLUR_DETECTION_THRESHOLD: Higher value = more SDXL usage (requires stronger blur)
    
    Returns:
        True if block is VERY flat and should use LANCZOS, False if should use SDXL
    """
    if len(block.shape) == 3:
        gray = np.mean(block[:, :, :3], axis=2)
    else:
        gray = block
    
    # Calculate color/intensity variance
    block_variance = np.var(gray)
    
    # Only use LANCZOS for extremely flat areas (solid colors)
    if block_variance < FLAT_BLOCK_VARIANCE_THRESHOLD * 0.5:
        # Very uniform color - use LANCZOS
        if DEBUG_BLOCK_ANALYSIS:
            logger.info(f"  Block is VERY FLAT: variance={block_variance:.2f}")
        return True
    
    # For everything else with some variance, use SDXL for better quality
    if DEBUG_BLOCK_ANALYSIS:
        logger.info(f"  Block has detail: variance={block_variance:.2f}")
    return False


def slice_into_overlapping_blocks(image_np: np.ndarray, block_size: int = BLOCK_SIZE, 
                                  overlap: int = OVERLAP) -> tuple[list[np.ndarray], list[tuple], tuple[int, int], tuple[int, int]]:
    h, w = image_np.shape[:2]
    stride = block_size - overlap
    
    n_blocks_h = int(np.ceil((h - overlap) / stride))
    n_blocks_w = int(np.ceil((w - overlap) / stride))
    
    padded_h = (n_blocks_h - 1) * stride + block_size
    padded_w = (n_blocks_w - 1) * stride + block_size
    
    if len(image_np.shape) == 3:
        padded_image = np.zeros((padded_h, padded_w, image_np.shape[2]), dtype=image_np.dtype)
    else:
        padded_image = np.zeros((padded_h, padded_w), dtype=image_np.dtype)
    
    padded_image[:h, :w] = image_np
    
    blocks = []
    block_positions = []
    
    for block_idx in range(n_blocks_h):
        for j in range(n_blocks_w):
            y = block_idx * stride
            x = j * stride
            block = padded_image[y:y+block_size, x:x+block_size].copy()
            blocks.append(block)
            block_positions.append((y, x, block_idx, j))
    
    logger.info(f"Created {len(blocks)} overlapping blocks ({n_blocks_h}x{n_blocks_w} grid)")
    
    return blocks, block_positions, (h, w), (padded_h, padded_w)


def stitch_overlapping_blocks(blocks: list[np.ndarray], block_positions: list[tuple], 
                              padded_dims: tuple[int, int], original_dims: tuple[int, int],
                              block_size: int = BLOCK_SIZE, overlap: int = OVERLAP,
                              scale_factor: int = 1) -> np.ndarray:
    padded_h, padded_w = padded_dims
    orig_h, orig_w = original_dims
    
    scaled_overlap = overlap * scale_factor
    
    out_h = padded_h * scale_factor
    out_w = padded_w * scale_factor
    
    if len(blocks[0].shape) == 3:
        channels = blocks[0].shape[2]
        stitched = np.zeros((out_h, out_w, channels), dtype=np.float32)
        weight_map = np.zeros((out_h, out_w, 1), dtype=np.float32)
    else:
        stitched = np.zeros((out_h, out_w), dtype=np.float32)
        weight_map = np.zeros((out_h, out_w), dtype=np.float32)
    
    upscaled_block_size = blocks[0].shape[0]
    mask = create_feather_mask(upscaled_block_size, scaled_overlap)
    
    if len(blocks[0].shape) == 3:
        mask = mask[:, :, np.newaxis]
    
    for block, pos in zip(blocks, block_positions):
        y_orig, x_orig, _, _ = pos
        y = y_orig * scale_factor
        x = x_orig * scale_factor
        
        if block.shape[0] != upscaled_block_size or block.shape[1] != upscaled_block_size:
            block_pil = Image.fromarray(block.astype(np.uint8))
            block_pil = block_pil.resize((upscaled_block_size, upscaled_block_size), Image.Resampling.LANCZOS)
            block = np.array(block_pil).astype(np.float32)
        else:
            block = block.astype(np.float32)
        
        y_end = min(y + upscaled_block_size, out_h)
        x_end = min(x + upscaled_block_size, out_w)
        block_h = y_end - y
        block_w = x_end - x
        
        block_portion = block[:block_h, :block_w]
        mask_portion = mask[:block_h, :block_w]
        
        stitched[y:y_end, x:x_end] += block_portion * mask_portion
        weight_map[y:y_end, x:x_end] += mask_portion
    
    weight_map = np.maximum(weight_map, 1e-8)
    stitched = stitched / weight_map
    
    final_h = orig_h * scale_factor
    final_w = orig_w * scale_factor
    result = stitched[:final_h, :final_w]
    
    return result.astype(np.uint8)


def upscale_block_sdxl(block_np: np.ndarray, upscaler_pipeline) -> np.ndarray:
    with upscale_semaphore:
        if block_np.dtype == np.uint8:
            block_pil = Image.fromarray(block_np)
        else:
            block_norm = ((block_np.astype(np.float32) + 1) / 2 * 255).astype(np.uint8)
            block_pil = Image.fromarray(block_norm)
        
        with torch.inference_mode():
            upscaled_pil = upscaler_pipeline(
                prompt="high quality, detailed",
                image=block_pil,
                num_inference_steps=UPSCALE_INFERENCE_STEPS,
                guidance_scale=0.0,
                output_type="pil"
            ).images[0]
        
        return np.array(upscaled_pil)


def upscale_block_simple(block_np: np.ndarray, scale_factor: int = UPSCALE_FACTOR) -> np.ndarray:
    """Simple LANCZOS upscaling for flat/smooth blocks (much faster)"""
    if block_np.dtype == np.uint8:
        block_pil = Image.fromarray(block_np)
    else:
        block_norm = ((block_np.astype(np.float32) + 1) / 2 * 255).astype(np.uint8)
        block_pil = Image.fromarray(block_norm)
    
    new_size = (block_pil.width * scale_factor, block_pil.height * scale_factor)
    upscaled_pil = block_pil.resize(new_size, Image.Resampling.LANCZOS)
    return np.array(upscaled_pil)


def upscale_block_wrapper(idx: int, block: np.ndarray, upscaler_pipeline, use_simple: bool = False) -> tuple[int, np.ndarray, bool]:
    try:
        if use_simple:
            logger.info(f"Block {idx}: Using simple LANCZOS upscaling (flat/smooth block)")
            upscaled = upscale_block_simple(block)
            return (idx, upscaled, True)
        else:
            logger.info(f"Block {idx}: Using SD X4 upscaler")
            upscaled = upscale_block_sdxl(block, upscaler_pipeline)
            return (idx, upscaled, False)
    except Exception as e:
        logger.error(f"Block {idx} upscaling failed: {e}")
        raise


def restore_faces_in_upscaled_image(upscaled_np: np.ndarray, faces: list[tuple], 
                                    face_enhancer: GFPGANer, scale_factor: int = 4) -> np.ndarray:
    if len(faces) == 0:
        return upscaled_np
    
    logger.info(f"Restoring {len(faces)} face(s) in upscaled image...")
    result = upscaled_np.copy()
    feather_mask_cache = {}
    faces_enhanced = 0
    
    for idx, (x, y, w, h) in enumerate(faces):
        x_scaled = x * scale_factor
        y_scaled = y * scale_factor
        w_scaled = w * scale_factor
        h_scaled = h * scale_factor
        
        padding = int(max(w_scaled, h_scaled) * 0.3)
        x1 = max(0, x_scaled - padding)
        y1 = max(0, y_scaled - padding)
        x2 = min(upscaled_np.shape[1], x_scaled + w_scaled + padding)
        y2 = min(upscaled_np.shape[0], y_scaled + h_scaled + padding)
        
        face_region = upscaled_np[y1:y2, x1:x2].copy()
        
        if face_region.shape[0] == 0 or face_region.shape[1] == 0:
            logger.warning(f"Face {idx}: Invalid region, skipping")
            continue
        
        try:
            logger.info(f"Face {idx}: Enhancing region at ({x1},{y1}) size {face_region.shape}")
            _, _, enhanced_face = face_enhancer.enhance(
                face_region,
                has_aligned=False,
                only_center_face=False,
                paste_back=True,
                weight=0.3
            )
            
            if enhanced_face.dtype != np.uint8:
                enhanced_face = (enhanced_face * 255).astype(np.uint8) if enhanced_face.max() <= 1.0 else enhanced_face.astype(np.uint8)
            
            if len(enhanced_face.shape) == 2:
                enhanced_face = np.stack([enhanced_face] * 3, axis=-1)
            elif enhanced_face.shape[2] == 1:
                enhanced_face = np.repeat(enhanced_face, 3, axis=2)
            elif enhanced_face.shape[2] == 4:
                enhanced_face = enhanced_face[:, :, :3]
            
            face_h, face_w = face_region.shape[:2]
            enhanced_h, enhanced_w = enhanced_face.shape[:2]
            
            if (enhanced_h, enhanced_w) != (face_h, face_w):
                enhanced_pil = Image.fromarray(enhanced_face)
                enhanced_pil = enhanced_pil.resize((face_w, face_h), Image.Resampling.LANCZOS)
                enhanced_face = np.array(enhanced_pil)
            
            feather_size = int(min(face_h, face_w) * 0.35)
            if feather_size not in feather_mask_cache:
                blend_mask = create_feather_mask(feather_size, feather_size // 3)
                blend_mask = gaussian_filter(blend_mask, sigma=feather_size/2)
                feather_mask_cache[feather_size] = blend_mask
            else:
                blend_mask = feather_mask_cache[feather_size].copy()
            
            if blend_mask.shape[:2] != (face_h, face_w):
                blend_mask_pil = Image.fromarray((blend_mask * 255).astype(np.uint8))
                blend_mask_pil = blend_mask_pil.resize((face_w, face_h), Image.Resampling.BILINEAR)
                blend_mask = np.array(blend_mask_pil).astype(np.float32) / 255
            blend_mask = blend_mask[:, :, np.newaxis]
            
            enhanced_face = enhanced_face.astype(np.float32)
            face_region = face_region.astype(np.float32)
            blended = enhanced_face * blend_mask + face_region * (1 - blend_mask)
            
            result[y1:y2, x1:x2] = blended.astype(np.uint8)
            faces_enhanced += 1
            logger.info(f"Face {idx}: Successfully enhanced and blended")
            
        except Exception as e:
            logger.error(f"Face {idx}: Enhancement failed: {e}")
            continue
    
    upscale_stats["face_enhanced_blocks"] = faces_enhanced
    return result


def check_nsfw(image_array):
    if isinstance(image_array, np.ndarray):
        if image_array.max() <= 1.0:
            image_array = (image_array * 255).astype("uint8")
        else:
            image_array = image_array.astype("uint8")
        x_image = Image.fromarray(image_array)
        x_image = [x_image]
    elif isinstance(image_array, list) and not isinstance(image_array[0], Image.Image):
        x_image = numpy_to_pil(image_array)
    else:
        x_image = image_array if isinstance(image_array, list) else [image_array]
    safety_checker_input = SAFETY_EXTRACTOR(x_image, return_tensors="pt").to("cuda")
    has_nsfw_concept, concepts = SAFETY_MODEL(
        images=x_image,
        clip_input=safety_checker_input.pixel_values
    )
    has_nsfw_bool = bool(has_nsfw_concept[0])
    return (
        has_nsfw_bool,
        replace_numpy_with_python(replace_sets_with_lists(concepts[0] if isinstance(concepts, list) else concepts))
    )


def load_models():
    global pipe, upscaler_pipeline, face_enhancer, face_detector, SAFETY_EXTRACTOR, SAFETY_MODEL
    
    logger.info("Loading models...")
    load_model_time = time.perf_counter()
    
    try:
        pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
            low_cpu_mem_usage=False,
        ).to("cuda")
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except:
            pass
        
        upscaler_pipeline = StableDiffusionUpscalePipeline.from_pretrained(
            UPSCALER_MODEL_ID,
            torch_dtype=torch.float32,
            cache_dir=MODEL_CACHE,
        ).to("cuda")
        try:
            upscaler_pipeline.enable_xformers_memory_efficient_attention()
        except:
            upscaler_pipeline.enable_attention_slicing()
        upscaler_pipeline.vae.to(torch.float32)
        
        face_enhancer = GFPGANer(
            model_path=FACE_ENHANCER_MODEL,
            upscale=4,
            arch='clean',
            channel_multiplier=2,
            bg_upsampler=None,
            device="cuda"
        )
        
        mp_face_detection = mp.solutions.face_detection
        face_detector = mp_face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.5
        )
        
        SAFETY_EXTRACTOR = AutoFeatureExtractor.from_pretrained(
            SAFETY_NSFW_MODEL,
            cache_dir="model_cache"
        )
        SAFETY_MODEL = StableDiffusionSafetyChecker.from_pretrained(
            SAFETY_NSFW_MODEL,
            cache_dir="model_cache"
        ).to("cuda")
        
        record_time("Model Loading", time.perf_counter() - load_model_time)
        logger.info("Models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise


def calculate_generation_dimensions(requested_width: int, requested_height: int) -> tuple[int, int, int, int]:
    final_w, final_h = requested_width, requested_height
    
    if final_w > MAX_FINAL_SIZE or final_h > MAX_FINAL_SIZE:
        scale = min(MAX_FINAL_SIZE / final_w, MAX_FINAL_SIZE / final_h)
        final_w = int(final_w * scale)
        final_h = int(final_h * scale)
    
    max_dim = max(final_w, final_h)
    
    if max_dim > MAX_GEN_SIZE:
        scale = MAX_GEN_SIZE / max_dim
        gen_w = int(final_w * scale)
        gen_h = int(final_h * scale)
    elif max_dim < MIN_GEN_SIZE:
        scale = MIN_GEN_SIZE / max_dim
        gen_w = int(final_w * scale)
        gen_h = int(final_h * scale)
    else:
        gen_w, gen_h = final_w, final_h
    
    gen_w = max(256, (gen_w // 16) * 16)
    gen_h = max(256, (gen_h // 16) * 16)
    
    return gen_w, gen_h, final_w, final_h


def generate_image(prompt: str, width: int = 1024, height: int = 1024, steps: int = 9, seed: int | None = None) -> dict:
    if pipe is None:
        raise RuntimeError("Models not loaded. Call load_models() first.")
    
    request = ImageRequest(prompts=[prompt], width=width, height=height, steps=steps, seed=seed)
    logger.info(f"Request: {request}")
    
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(8), "big")
    logger.info(f"Using seed: {seed}")
    generator = torch.Generator("cuda").manual_seed(seed)
    
    gen_w, gen_h, final_w, final_h = calculate_generation_dimensions(request.width, request.height)
    logger.info(f"Requested: {request.width}x{request.height} -> Generation: {gen_w}x{gen_h} -> Final: {final_w}x{final_h}")
    pipeline_start = time.perf_counter()
    
    try:
        with generate_lock:
            logger.info("Generating base image with Z-Image...")
            gen_start = time.perf_counter()
            with torch.inference_mode():
                output = pipe(
                    prompt=prompt,
                    generator=generator,
                    width=gen_w,
                    height=gen_h,
                    num_inference_steps=steps,
                    guidance_scale=0.0,
                )
            image = output.images[0]
            image_np = np.array(image)
            record_time("Base Generation", time.perf_counter() - gen_start)
            if ENABLE_NSFW_CHECK:
                has_nsfw, concepts = check_nsfw(image_np)
                if has_nsfw:
                    logger.warning("NSFW content detected in generated image.")
                else:
                    logger.info("No NSFW content detected.")
            faces = []
            if ENABLE_FACE_RESTORATION:
                logger.info("Detecting faces in base image...")
                faces = detect_faces_mediapipe(image_np, face_detector)
                logger.info(f"Detected {len(faces)} face(s)")
            
            logger.info("Slicing image into overlapping blocks...")
            slice_start = time.perf_counter()
            blocks, block_positions, orig_dims, padded_dims = slice_into_overlapping_blocks(
                image_np, BLOCK_SIZE, OVERLAP
            )
            record_time("Block Slicing", time.perf_counter() - slice_start)
            upscale_stats["total_blocks"] = len(blocks)
            logger.info(f"Created {len(blocks)} blocks from {orig_dims} image")
            
            logger.info("Detecting main subject using saliency analysis...")
            subject_blocks = get_subject_aware_blocks(image_np, blocks, block_positions, padded_dims, orig_dims, BLOCK_SIZE, OVERLAP)
            
            logger.info("Analyzing blocks for very flat areas...")
            flat_blocks = set()
            for idx, block in enumerate(blocks):
                # Only use LANCZOS for extremely flat areas, never for subject
                if idx not in subject_blocks and is_flat_or_smooth_block(block):
                    flat_blocks.add(idx)
            
            logger.info(f"Block classification before ratio enforcement:")
            logger.info(f"  Subject blocks (SDXL): {len(subject_blocks)}")
            logger.info(f"  Very flat background blocks (LANCZOS): {len(flat_blocks)}")
            logger.info(f"  Detail blocks (SDXL): {len(blocks) - len(flat_blocks) - len(subject_blocks)}")
            
            # Enforce target LANCZOS/SDXL ratio
            sdxl_blocks_final, lanczos_blocks_final = enforce_upscaler_ratio(
                len(blocks), subject_blocks, flat_blocks, TARGET_LANCZOS_RATIO
            )
            
            logger.info(f"Upscaling blocks (max {MAX_CONCURRENT_UPSCALES} concurrent)...")
            upscale_start = time.perf_counter()
            
            upscaled_blocks = [None] * len(blocks)
            sdxl_count = 0
            lanczos_count = 0
            
            with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_UPSCALES) as executor:
                futures = {}
                for idx, block in enumerate(blocks):
                    use_simple = idx in lanczos_blocks_final
                    future = executor.submit(upscale_block_wrapper, idx, block, upscaler_pipeline, use_simple)
                    futures[future] = idx
                
                for future in as_completed(futures):
                    try:
                        idx, upscaled_block, used_simple = future.result()
                        upscaled_blocks[idx] = upscaled_block
                        method = "LANCZOS" if used_simple else "SD X4"
                        if used_simple:
                            lanczos_count += 1
                        else:
                            sdxl_count += 1
                        logger.info(f"Block {idx} completed ({method})")
                    except Exception as e:
                        logger.error(f"Block {futures[future]} failed: {e}")
                        raise
            
            upscale_stats["sdxl_blocks"] = sdxl_count
            upscale_stats["lanczos_blocks"] = lanczos_count
            record_time("Block Upscaling", time.perf_counter() - upscale_start)
            
            logger.info("Stitching blocks with feather blending...")
            stitch_start = time.perf_counter()
            upscaled_image = stitch_overlapping_blocks(
                upscaled_blocks, block_positions, padded_dims, orig_dims,
                BLOCK_SIZE, OVERLAP, UPSCALE_FACTOR
            )
            record_time("Block Stitching", time.perf_counter() - stitch_start)
            logger.info(f"Stitched result: {upscaled_image.shape}")
            
            if ENABLE_FACE_RESTORATION and len(faces) > 0:
                logger.info("Applying face restoration to upscaled image...")
                face_restore_start = time.perf_counter()
                result = restore_faces_in_upscaled_image(upscaled_image, faces, face_enhancer, UPSCALE_FACTOR)
                record_time("Face Restoration", time.perf_counter() - face_restore_start)
            else:
                result = upscaled_image
            
            logger.info(f"Resizing to requested dimensions: {request.width}x{request.height}")
            result_pil = Image.fromarray(result.astype(np.uint8))
            result_pil = result_pil.resize((request.width, request.height), Image.Resampling.LANCZOS)
            
            logger.info("Encoding result image...")
            img_byte_arr = io.BytesIO()
            result_pil.save(img_byte_arr, format='JPEG', quality=95)
            img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
            
            record_time("Total Pipeline", time.perf_counter() - pipeline_start)
            
            print("\n" + "="*50)
            print("PIPELINE TIMING REPORT")
            print("="*50)
            for stage, elapsed in timing_report.items():
                print(f"{stage:.<40} {elapsed:>8.2f}s")
            print("="*50)
            
            print("\nBLOCK UPSCALING STATISTICS")
            print("="*50)
            print(f"Total blocks formed...................... {upscale_stats['total_blocks']}")
            print(f"Blocks upscaled via SDXL................ {upscale_stats['sdxl_blocks']}")
            print(f"Blocks upscaled via LANCZOS............. {upscale_stats['lanczos_blocks']}")
            print(f"Faces enhanced in final image........... {upscale_stats['face_enhanced_blocks']}")
            print("="*50 + "\n")

            return {
                "image": img_base64,
                "has_nsfw_concept": False,
                "concept": [],
                "width": result_pil.width,
                "height": result_pil.height,
                "seed": seed,
                "prompt": prompt,
                "timing_report": timing_report
            }
            
    except torch.cuda.OutOfMemoryError as e:
        logger.error(f"CUDA OOM Error: {e}")
        raise


if __name__ == "__main__":
    load_models()
    
    result = generate_image(
        prompt="a high resolution cinematic photograph of a man holding an open book, shallow depth of field, dramatic warm lighting, professional studio setup, bokeh background, cinematic color grading, sharp focus on face and book, volumetric lighting, 8k, award winning photography",
        width=1024,
        height=768,
        steps=9
    )
    with open("generated_image9.jpg", "wb") as f:
        f.write(base64.b64decode(result['image']))
    print(f"Image generated successfully!")
    print(f"Dimensions: {result['width']}x{result['height']}")
    print(f"Seed: {result['seed']}")
