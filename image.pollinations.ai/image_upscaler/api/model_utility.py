from basicsr.archs.rrdbnet_arch import RRDBNet
from config import MODEL_PATH_x2, MODEL_PATH_x4, FACE_ENHANCER_MODEL
from realesrgan import RealESRGANer
from gfpgan import GFPGANer
import torch
import numpy as np
from loguru import logger


device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
use_half = torch.cuda.is_available()

model_x2 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
model_x4 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
upsampler_x2 = RealESRGANer(
            scale=2,
            model_path=MODEL_PATH_x2,
            model=model_x2,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=use_half,
            device=device
        )
upsampler_x4 = RealESRGANer(
            scale=4,
            model_path=MODEL_PATH_x4,
            model=model_x4,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=use_half,
            device=device
        )
face_enhancer_x2 = GFPGANer(
            model_path=FACE_ENHANCER_MODEL,
            upscale=2,
            arch='clean',
            channel_multiplier=2,
            bg_upsampler=upsampler_x2,
            device=device
        )
face_enhancer_x4 = GFPGANer(
            model_path=FACE_ENHANCER_MODEL,
            upscale=4,
            arch='clean',
            channel_multiplier=2,
            bg_upsampler=upsampler_x4,
            device=device
        )
def enhance_x2(img_data: dict, outscale=2):
    try:
        img_array = np.frombuffer(img_data['data'], dtype=np.uint8).reshape(img_data['shape'])
        upscaled_img, _ = upsampler_x2.enhance(img_array, outscale=outscale)
        return {
            'data': upscaled_img.tobytes(),
            'shape': upscaled_img.shape,
            'dtype': str(upscaled_img.dtype)
        }
    except Exception as e:
        logger.error(f"Error in x2 enhancement: {e}")
        raise

def enhance_x4(img_data: dict, outscale=4):
    try:
        img_array = np.frombuffer(img_data['data'], dtype=np.uint8).reshape(img_data['shape'])
        upscaled_img, _ = upsampler_x4.enhance(img_array, outscale=outscale)
        return {
            'data': upscaled_img.tobytes(),
            'shape': upscaled_img.shape,
            'dtype': str(upscaled_img.dtype)
        }
    except Exception as e:
        logger.error(f"Error in x4 enhancement: {e}")
        raise

def enhance_face_x2(img_data: dict):
    try:
        img_array = np.frombuffer(img_data['data'], dtype=np.uint8).reshape(img_data['shape'])
        _, _, face_restored = face_enhancer_x2.enhance(
            img_array,
            has_aligned=False,
            only_center_face=False,
            paste_back=True
        )
        return {
            'data': face_restored.tobytes(),
            'shape': face_restored.shape,
            'dtype': str(face_restored.dtype)
        }
    except Exception as e:
        logger.error(f"Error in x2 face enhancement: {e}")
        raise

def enhance_face_x4(img_data: dict):
    try:
        img_array = np.frombuffer(img_data['data'], dtype=np.uint8).reshape(img_data['shape'])
        _, _, face_restored = face_enhancer_x4.enhance(
            img_array,
            has_aligned=False,
            only_center_face=False,
            paste_back=True
        )
        return {
            'data': face_restored.tobytes(),
            'shape': face_restored.shape,
            'dtype': str(face_restored.dtype)
        }
    except Exception as e:
        logger.error(f"Error in x4 face enhancement: {e}")
        raise