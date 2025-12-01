import os.path
import io
import numpy as np
import torch
from PIL import Image
from abc import ABC
from diffusers.pipelines.stable_diffusion.safety_checker import StableDiffusionSafetyChecker as BaseSafetyChecker, cosine_distance
from diffusers.utils import logging
from transformers import CLIPConfig, AutoFeatureExtractor
from fastapi import FastAPI, File, UploadFile

logger = logging.get_logger(__name__)

safety_model_id = "CompVis/stable-diffusion-safety-checker"
safety_feature_extractor = None
safety_checker_model = None
warning_image = os.path.join("extensions", "stable-diffusion-webui-nsfw-filter", "warning", "warning.png")


class StableDiffusionSafetyChecker(BaseSafetyChecker, ABC):
    """Core safety checker that detects NSFW content"""
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
                result_img["concept_scores"][concept_idx] = round(concept_cos - concept_threshold + adjustment, 3)
                if result_img["concept_scores"][concept_idx] > 0:
                    result_img["bad_concepts"].append(concept_idx)

            result.append(result_img)

        has_nsfw_concepts = [len(res["bad_concepts"]) > 0 for res in result]
        return has_nsfw_concepts, result


# ============= Helper Functions =============

def _init_models():
    """Initialize models on first use"""
    global safety_feature_extractor, safety_checker_model
    if safety_feature_extractor is None:
        safety_feature_extractor = AutoFeatureExtractor.from_pretrained(safety_model_id)
        safety_checker_model = StableDiffusionSafetyChecker.from_pretrained(safety_model_id).to("cuda")


def _numpy_to_pil(images):
    """Convert numpy array to PIL images"""
    if images.ndim == 3:
        images = images[None, ...]
    images = (images * 255).round().astype("uint8")
    return [Image.fromarray(image) for image in images]


def _replace_sets_with_lists(obj):
    """Recursively convert sets to lists for JSON serialization"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = _replace_sets_with_lists(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = _replace_sets_with_lists(v)
    elif isinstance(obj, set):
        obj = list(obj)
    return obj


def _replace_numpy_with_python(obj):
    """Recursively convert numpy types to Python types"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = _replace_numpy_with_python(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = _replace_numpy_with_python(v)
    elif isinstance(obj, np.generic):
        obj = obj.item()
    return obj


# ============= Main API Functions =============

def check_nsfw(image_array, safety_checker_adj: float = 0.0):
    """
    Check if image contains NSFW content
    
    Args:
        image_array: numpy array (0-1 range) or PIL Image
        safety_checker_adj: adjustment factor (-0.5 to 0.5)
    
    Returns:
        tuple: (has_nsfw_list, concepts_dict)
            - has_nsfw_list: [True/False] for each image
            - concepts_dict: detailed concept scores
    """
    _init_models()
    
    if isinstance(image_array, list) and not isinstance(image_array[0], Image.Image):
        x_image = _numpy_to_pil(image_array)
    else:
        x_image = image_array if isinstance(image_array, list) else [image_array]
    
    safety_checker_input = safety_feature_extractor(x_image, return_tensors="pt").to("cuda")
    has_nsfw_concept, concepts = safety_checker_model(
        images=x_image,
        clip_input=safety_checker_input.pixel_values,
        safety_checker_adj=safety_checker_adj,
    )

    print("Concepts:", concepts, "Has NSFW:", has_nsfw_concept)
    return (
        _replace_numpy_with_python(_replace_sets_with_lists(has_nsfw_concept)),
        _replace_numpy_with_python(_replace_sets_with_lists(concepts))
    )


def get_safe_images(image_tensor, safety_checker_adj: float = 0.0):
    """
    Get censored images (replace unsafe images with warning image)
    
    Args:
        image_tensor: torch tensor (batch, channels, height, width)
        safety_checker_adj: adjustment factor
    
    Returns:
        torch.Tensor: censored image batch
    """
    x_samples_numpy = image_tensor.cpu().permute(0, 2, 3, 1).numpy()
    has_nsfw, concepts = check_nsfw(x_samples_numpy, safety_checker_adj)
    x = torch.from_numpy(x_samples_numpy).permute(0, 3, 1, 2)

    for index, unsafe_value in enumerate(has_nsfw):
        try:
            if unsafe_value is True:
                hwc = x.shape
                y = Image.open(warning_image).convert("RGB").resize((hwc[3], hwc[2]))
                y = (np.array(y) / 255.0).astype("float32")
                y = torch.from_numpy(y)
                y = torch.unsqueeze(y, 0).permute(0, 3, 1, 2)
                assert y.shape == x.shape
                x[index] = y
        except Exception as e:
            logger.warning(f"Error censoring image {index}: {e}")

    return x


# ============= FastAPI Service =============

app = FastAPI()

@app.post("/check")
async def api_check_nsfw(file: UploadFile = File(...)):
    """API endpoint to check NSFW content"""
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    image = np.array(image) / 255.0
    image = np.expand_dims(image, 0)
    
    [has_nsfw], [concepts] = check_nsfw(image, safety_checker_adj=0.0)
    return {"nsfw": has_nsfw, "concepts": concepts}


# ============= CLI Usage =============

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--image", help="path to image")
    parser.add_argument("--adj", type=float, default=0.0, help="safety adjustment")
    args = parser.parse_args()

    image = Image.open(args.image).convert("RGB")
    image = np.array(image) / 255.0
    image = np.expand_dims(image, 0)

    has_nsfw, concepts = check_nsfw(image, safety_checker_adj=args.adj)
    print("Has NSFW concept:", has_nsfw)
    print("Concepts:", concepts)

    # uvicorn safety_checker:app --reload --port 10000