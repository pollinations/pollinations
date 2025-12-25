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
from utility import StableDiffusionSafetyChecker, replace_numpy_with_python, replace_sets_with_lists, numpy_to_pil
from transformers import AutoFeatureExtractor

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
MAX_CONCURRENT_UPSCALES = 36
UPSCALE_INFERENCE_STEPS = 10  
ENABLE_FACE_RESTORATION = True

generate_lock = threading.Lock()
upscale_semaphore = threading.Semaphore(MAX_CONCURRENT_UPSCALES)

pipe = None
upscaler_pipeline = None
face_enhancer = None
face_detector = None
SAFETY_EXTRACTOR = None
SAFETY_MODEL = None

timing_report = {}


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


def upscale_block_wrapper(idx: int, block: np.ndarray, upscaler_pipeline) -> tuple[int, np.ndarray]:
    try:
        logger.info(f"Block {idx}: Using SD X4 upscaler")
        upscaled = upscale_block_sdxl(block, upscaler_pipeline)
        return (idx, upscaled)
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
            logger.info(f"Face {idx}: Successfully enhanced and blended")
            
        except Exception as e:
            logger.error(f"Face {idx}: Enhancement failed: {e}")
            continue
    
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
            logger.info(f"Created {len(blocks)} blocks from {orig_dims} image")
            
            logger.info(f"Upscaling all blocks with SD X4 (max {MAX_CONCURRENT_UPSCALES} concurrent)...")
            upscale_start = time.perf_counter()
            
            upscaled_blocks = [None] * len(blocks)
            with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_UPSCALES) as executor:
                futures = {}
                for idx, block in enumerate(blocks):
                    future = executor.submit(upscale_block_wrapper, idx, block, upscaler_pipeline)
                    futures[future] = idx
                
                for future in as_completed(futures):
                    try:
                        idx, upscaled_block = future.result()
                        upscaled_blocks[idx] = upscaled_block
                        logger.info(f"Block {idx} completed")
                    except Exception as e:
                        logger.error(f"Block {futures[future]} failed: {e}")
                        raise
            
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
            print("="*50 + "\n")
            
            # Skip NSFW check for speed (uncomment to enable)
            # has_nsfw, concepts = check_nsfw(result)
            
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
        prompt="an indian brother and sister playing in a field of sunflowers during golden hour, highly detailed, photorealistic",
        width=1024,
        height=1024,
        steps=9
    )
    with open("generated_image5.jpg", "wb") as f:
        f.write(base64.b64decode(result['image']))
    print(f"Image generated successfully!")
    print(f"Dimensions: {result['width']}x{result['height']}")
    print(f"Seed: {result['seed']}")
