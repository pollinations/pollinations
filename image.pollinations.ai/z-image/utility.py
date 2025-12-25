from gfpgan import GFPGANer
from PIL import Image
import numpy as np
from diffusers.pipelines.stable_diffusion.safety_checker import StableDiffusionSafetyChecker as BaseSafetyChecker, cosine_distance
from abc import ABC
import torch
from transformers import CLIPConfig
from scipy.ndimage import gaussian_filter
from skimage import filters
from loguru import logger
import threading
import os
import requests


UPSCALER_MODEL_PATH = "model_cache"
MODEL_PATH = "model_cache"
BLOCK_SIZE = 128
DEBUG_BLOCK_ANALYSIS = False
FLAT_BLOCK_VARIANCE_THRESHOLD = 350.0
UPSCALE_INFERENCE_STEPS = 10  
UPSCALE_FACTOR = 4
MAX_CONCURRENT_UPSCALES = 4 
generate_lock = threading.Lock()
upscale_semaphore = threading.Semaphore(MAX_CONCURRENT_UPSCALES)
upscale_stats = {
    "total_blocks": 0,
    "sdxl_blocks": 0,
    "lanczos_blocks": 0,
    "face_enhanced_blocks": 0
}


def download_model(model_name : str):
    model_url_map = {
        "GFPGANv1.4.pth": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth"
    }
    
    if not os.path.exists(UPSCALER_MODEL_PATH):
        os.makedirs(UPSCALER_MODEL_PATH, exist_ok=True)
    model_path = os.path.join(UPSCALER_MODEL_PATH, model_name)
    if not os.path.exists(model_path):
        print(f"Downloading {model_name}...")
        url = model_url_map.get(model_name)
        if not url:
            print(f"Model {model_name} not found in available models")
            return
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(model_path, "wb") as f:
            for chunk in response.iter_content(8192):
                f.write(chunk)
        
        print(f"Model downloaded: {UPSCALER_MODEL_PATH}/{model_name}")

def numpy_to_pil(images):
    if images.ndim == 3:
        images = images[None, ...]
    images = (images * 255).round().astype("uint8")
    return [Image.fromarray(image) for image in images]

CONCEPT_ADJUSTMENTS = {
    1: -0.01,   
    2: -0.01,   
    4: -0.01,   
    8: -0.01,   
    10: -0.02,  
    11: -0.02,  
    16: -0.01,  
}



def compute_saliency_map(image_np: np.ndarray) -> np.ndarray:
    if len(image_np.shape) == 3 and image_np.shape[2] >= 3:
        gray = np.mean(image_np[:, :, :3], axis=2)
    else:
        gray = image_np if len(image_np.shape) == 2 else np.mean(image_np, axis=2)
    
    gray = gray.astype(np.float32) / 255.0 if gray.max() > 1 else gray
    
    edges_x = filters.sobel_h(gray)
    edges_y = filters.sobel_v(gray)
    edge_map = np.sqrt(edges_x**2 + edges_y**2)
    edge_map = edge_map / (edge_map.max() + 1e-8)
    
    laplacian_map = np.abs(filters.laplace(gray))
    laplacian_map = laplacian_map / (laplacian_map.max() + 1e-8)
    
    if len(image_np.shape) == 3 and image_np.shape[2] >= 3:
        rgb_norm = image_np[:, :, :3].astype(np.float32) / 255.0 if image_np.max() > 1 else image_np[:, :, :3].astype(np.float32)
        color_variance = np.var(rgb_norm, axis=2)
        color_variance = color_variance / (color_variance.max() + 1e-8)
    else:
        color_variance = np.zeros_like(gray)
    
    saliency = 0.4 * edge_map + 0.4 * laplacian_map + 0.2 * color_variance
    
    saliency = gaussian_filter(saliency, sigma=2)
    
    saliency = saliency / (saliency.max() + 1e-8)
    
    return saliency


def get_subject_aware_blocks_no_padding(image_np: np.ndarray, blocks: list[np.ndarray], 
                                        block_positions: list[tuple], 
                                        block_size: int = BLOCK_SIZE) -> set[int]:
    logger.info("Computing saliency map to identify main subject...")
    saliency = compute_saliency_map(image_np)
    
    h, w = image_np.shape[:2]
    saliency_threshold = np.percentile(saliency, 85)
    
    subject_blocks = set()
    
    for idx, (y, x) in enumerate(block_positions):
        y_end = min(y + block_size, h)
        x_end = min(x + block_size, w)
        
        block_saliency = saliency[y:y_end, x:x_end]
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
    target_lanczos_count = int(total_blocks * target_lanczos_ratio)
    
    lanczos_blocks = flat_blocks.copy()
    sdxl_blocks = subject_blocks.copy()
    other_blocks = set(range(total_blocks)) - subject_blocks - flat_blocks
    
    current_lanczos = len(lanczos_blocks)
    current_sdxl = len(sdxl_blocks)
    
    logger.info(f"Target ratio: {target_lanczos_ratio:.1%} LANCZOS, {1-target_lanczos_ratio:.1%} SDXL")
    logger.info(f"Before adjustment: {current_lanczos} LANCZOS, {current_sdxl} SDXL, {len(other_blocks)} unclassified")
    
    if current_lanczos < target_lanczos_count:
        needed = target_lanczos_count - current_lanczos
        other_blocks_list = sorted(list(other_blocks))
        take_from_other = min(needed, len(other_blocks_list))
        lanczos_blocks.update(other_blocks_list[:take_from_other])
        for block_idx in other_blocks_list[:take_from_other]:
            other_blocks.discard(block_idx)
        current_lanczos += take_from_other
    
    elif current_lanczos > target_lanczos_count:
        excess = current_lanczos - target_lanczos_count
        flat_blocks_list = sorted(list(flat_blocks))
        remove_from_flat = min(excess, len(flat_blocks_list))
        for block_idx in flat_blocks_list[-remove_from_flat:]:
            lanczos_blocks.discard(block_idx)
            other_blocks.add(block_idx)
        current_lanczos -= remove_from_flat
    
    sdxl_blocks.update(other_blocks)
    
    final_lanczos_count = len(lanczos_blocks)
    final_sdxl_count = len(sdxl_blocks)
    final_lanczos_ratio = final_lanczos_count / total_blocks if total_blocks > 0 else 0
    
    logger.info(f"After adjustment: {final_lanczos_count} LANCZOS ({final_lanczos_ratio:.1%}), {final_sdxl_count} SDXL ({1-final_lanczos_ratio:.1%})")
    
    return sdxl_blocks, lanczos_blocks


def is_flat_or_smooth_block(block: np.ndarray) -> bool:
    if len(block.shape) == 3:
        gray = np.mean(block[:, :, :3], axis=2)
    else:
        gray = block
    
    block_variance = np.var(gray)
    
    if block_variance < FLAT_BLOCK_VARIANCE_THRESHOLD * 0.5:
        if DEBUG_BLOCK_ANALYSIS:
            logger.info(f"  Block is VERY FLAT: variance={block_variance:.2f}")
        return True
    
    if DEBUG_BLOCK_ANALYSIS:
        logger.info(f"  Block has detail: variance={block_variance:.2f}")
    return False


def slice_into_non_overlapping_blocks(image_np: np.ndarray, 
                                      block_size: int = BLOCK_SIZE) -> tuple[list[np.ndarray], list[tuple], list[dict]]:
    """
    Slice image into non-overlapping 128x128 blocks from top-left.
    Returns complete blocks, their positions, and edge regions for Lanczos upscaling.
    """
    h, w = image_np.shape[:2]
    
    # Calculate how many complete blocks fit
    n_blocks_h = h // block_size
    n_blocks_w = w // block_size
    
    blocks = []
    block_positions = []
    
    # Extract complete 128x128 blocks
    for i in range(n_blocks_h):
        for j in range(n_blocks_w):
            y = i * block_size
            x = j * block_size
            block = image_np[y:y+block_size, x:x+block_size].copy()
            blocks.append(block)
            block_positions.append((y, x))
    
    # Handle edge regions (right edge and bottom edge)
    edge_regions = []
    
    # Right edge (if exists)
    right_edge_x = n_blocks_w * block_size
    if right_edge_x < w:
        right_edge = image_np[:, right_edge_x:].copy()
        edge_regions.append({
            'type': 'right',
            'data': right_edge,
            'x': right_edge_x,
            'y': 0,
            'width': w - right_edge_x,
            'height': h
        })
    
    # Bottom edge (if exists)
    bottom_edge_y = n_blocks_h * block_size
    if bottom_edge_y < h:
        # Only take bottom edge up to where complete blocks end horizontally
        bottom_edge_width = n_blocks_w * block_size
        bottom_edge = image_np[bottom_edge_y:, :bottom_edge_width].copy()
        edge_regions.append({
            'type': 'bottom',
            'data': bottom_edge,
            'x': 0,
            'y': bottom_edge_y,
            'width': bottom_edge_width,
            'height': h - bottom_edge_y
        })
    
    # Bottom-right corner (if both edges exist)
    if right_edge_x < w and bottom_edge_y < h:
        corner = image_np[bottom_edge_y:, right_edge_x:].copy()
        edge_regions.append({
            'type': 'corner',
            'data': corner,
            'x': right_edge_x,
            'y': bottom_edge_y,
            'width': w - right_edge_x,
            'height': h - bottom_edge_y
        })
    
    logger.info(f"Created {len(blocks)} complete {block_size}x{block_size} blocks ({n_blocks_h}x{n_blocks_w} grid)")
    logger.info(f"Edge regions: {len(edge_regions)} ({', '.join([e['type'] for e in edge_regions])})")
    
    return blocks, block_positions, edge_regions


def stitch_non_overlapping_blocks(blocks: list[np.ndarray], 
                                  block_positions: list[tuple],
                                  edge_regions: list[dict],
                                  original_dims: tuple[int, int],
                                  block_size: int = BLOCK_SIZE,
                                  scale_factor: int = 4) -> np.ndarray:
    """
    Stitch non-overlapping upscaled blocks and Lanczos-upscaled edge regions seamlessly.
    """
    orig_h, orig_w = original_dims
    out_h = orig_h * scale_factor
    out_w = orig_w * scale_factor
    
    if len(blocks[0].shape) == 3:
        channels = blocks[0].shape[2]
        result = np.zeros((out_h, out_w, channels), dtype=np.uint8)
    else:
        result = np.zeros((out_h, out_w), dtype=np.uint8)
    
    upscaled_block_size = block_size * scale_factor
    
    # Place all upscaled blocks
    for block, (y_orig, x_orig) in zip(blocks, block_positions):
        y = y_orig * scale_factor
        x = x_orig * scale_factor
        
        # Ensure block is correct size
        if block.shape[0] != upscaled_block_size or block.shape[1] != upscaled_block_size:
            block_pil = Image.fromarray(block.astype(np.uint8))
            block_pil = block_pil.resize((upscaled_block_size, upscaled_block_size), Image.Resampling.LANCZOS)
            block = np.array(block_pil)
        
        result[y:y+upscaled_block_size, x:x+upscaled_block_size] = block
    
    # Upscale and place edge regions using Lanczos
    for edge in edge_regions:
        edge_data = edge['data']
        edge_type = edge['type']
        
        # Upscale edge region with Lanczos
        edge_pil = Image.fromarray(edge_data.astype(np.uint8))
        new_w = edge['width'] * scale_factor
        new_h = edge['height'] * scale_factor
        edge_upscaled = edge_pil.resize((new_w, new_h), Image.Resampling.LANCZOS)
        edge_upscaled_np = np.array(edge_upscaled)
        
        # Place in result
        y_pos = edge['y'] * scale_factor
        x_pos = edge['x'] * scale_factor
        
        result[y_pos:y_pos+new_h, x_pos:x_pos+new_w] = edge_upscaled_np
        
        logger.info(f"Placed {edge_type} edge region at ({x_pos}, {y_pos}) with size {new_w}x{new_h}")
    
    return result


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


def create_feather_mask(size: int, feather_width: int) -> np.ndarray:
    """Create a feather mask for smooth blending."""
    mask = np.ones((size, size), dtype=np.float32)
    if feather_width > 0:
        for i in range(feather_width):
            alpha = i / feather_width
            mask[i, :] *= alpha
            mask[-i-1, :] *= alpha
            mask[:, i] *= alpha
            mask[:, -i-1] *= alpha
    return mask


class StableDiffusionSafetyChecker(BaseSafetyChecker, ABC):
    def __init__(self, config: CLIPConfig):
        super().__init__(config)

    @torch.no_grad()
    def forward(self, clip_input, images, safety_checker_adj: float = 0):
        pooled_output = self.vision_model(clip_input)[1]
        image_embeds = self.visual_projection(pooled_output)

        special_cos_dist = cosine_distance(image_embeds, self.special_care_embeds).cpu().float().numpy()
        cos_dist = cosine_distance(image_embeds, self.concept_embeds).cpu().float().numpy()

        result = []
        batch_size = image_embeds.shape[0]
        for i in range(batch_size):
            result_img = {"special_scores": {}, "special_care": [], "concept_scores": {}, "bad_concepts": []}
            adjustment = safety_checker_adj

            for concept_idx in range(len(special_cos_dist[0])):
                concept_cos = special_cos_dist[i][concept_idx]
                concept_threshold = self.special_care_embeds_weights[concept_idx].item()
                result_img["special_scores"][concept_idx] = round(concept_cos - concept_threshold + adjustment, 3)
                if result_img["special_scores"][concept_idx] > 0:
                    result_img["special_care"].append({concept_idx, result_img["special_scores"][concept_idx]})
                    adjustment = 0.01

            for concept_idx in range(len(cos_dist[0])):
                concept_cos = cos_dist[i][concept_idx]
                concept_threshold = self.concept_embeds_weights[concept_idx].item()
                per_concept_adj = CONCEPT_ADJUSTMENTS.get(concept_idx, 0)
                result_img["concept_scores"][concept_idx] = round(concept_cos - concept_threshold + adjustment + per_concept_adj, 3)
                if result_img["concept_scores"][concept_idx] > 0:
                    result_img["bad_concepts"].append(concept_idx)

            result.append(result_img)

        has_nsfw_concepts = [len(res["bad_concepts"]) > 0 for res in result]
        return has_nsfw_concepts, result


def replace_sets_with_lists(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = replace_sets_with_lists(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = replace_sets_with_lists(v)
    elif isinstance(obj, set):
        obj = list(obj)
    return obj


def replace_numpy_with_python(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = replace_numpy_with_python(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = replace_numpy_with_python(v)
    elif isinstance(obj, np.generic):
        obj = obj.item()
    return obj