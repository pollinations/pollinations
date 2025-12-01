import os.path
import numpy as np
import torch
from PIL import Image
from abc import ABC
from diffusers.pipelines.stable_diffusion.safety_checker import StableDiffusionSafetyChecker as BaseSafetyChecker, cosine_distance
from diffusers.utils import logging
from transformers import CLIPConfig, AutoFeatureExtractor
from torchvision import transforms

logger = logging.get_logger(__name__)

safety_model_id = "CompVis/stable-diffusion-safety-checker"
safety_feature_extractor = None
safety_checker_model = None
warning_image = ""


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
                result_img["concept_scores"][concept_idx] = round(concept_cos - concept_threshold + adjustment, 3)
                if result_img["concept_scores"][concept_idx] > 0:
                    result_img["bad_concepts"].append(concept_idx)

            result.append(result_img)

        has_nsfw_concepts = [len(res["bad_concepts"]) > 0 for res in result]
        return has_nsfw_concepts, result



def _init_models():
    global safety_feature_extractor, safety_checker_model
    if safety_feature_extractor is None:
        safety_feature_extractor = AutoFeatureExtractor.from_pretrained(safety_model_id)
        safety_checker_model = StableDiffusionSafetyChecker.from_pretrained(safety_model_id).to("cuda")


def _numpy_to_pil(images):
    if images.ndim == 3:
        images = images[None, ...]
    images = (images * 255).round().astype("uint8")
    return [Image.fromarray(image) for image in images]


def _replace_sets_with_lists(obj):
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
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = _replace_numpy_with_python(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = _replace_numpy_with_python(v)
    elif isinstance(obj, np.generic):
        obj = obj.item()
    return obj




def check_nsfw(image_array, safety_checker_adj: float = 0.0):

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

    return (
        _replace_numpy_with_python(_replace_sets_with_lists(has_nsfw_concept)),
        _replace_numpy_with_python(_replace_sets_with_lists(concepts))
    )


def get_safe_images(image_tensor, safety_checker_adj: float = 0.0):
    x_samples_numpy = image_tensor.cpu().permute(0, 2, 3, 1).numpy()
    has_nsfw, concepts = check_nsfw(x_samples_numpy, safety_checker_adj)
    x = torch.from_numpy(x_samples_numpy).permute(0, 3, 1, 2)

    for index, unsafe_value in enumerate(has_nsfw):
        try:
            if unsafe_value is True:
                # Convert tensor to PIL image for blurring
                img_np = x_samples_numpy[index]
                img_pil = Image.fromarray((img_np * 255).round().astype("uint8"))
                
                # Apply blur filter
                blurred_pil = img_pil.filter(Image.BLUR)
                
                # Convert back to tensor
                blurred_np = (np.array(blurred_pil) / 255.0).astype("float32")
                blurred_tensor = torch.from_numpy(blurred_np).permute(2, 0, 1).unsqueeze(0)
                
                x[index] = blurred_tensor.squeeze(0)
        except Exception as e:
            logger.warning(f"Error blurring image {index}: {e}")

    return x

if __name__ == "__main__":
    image_path = "test_image.png"
    pil_image = Image.open(image_path)
    transform = transforms.ToTensor()
    image_tensor = transform(pil_image).unsqueeze(0)  
    safe_image = get_safe_images(image_tensor, safety_checker_adj=0.0)
    result_np = safe_image[0].permute(1, 2, 0).numpy()
    result_pil = Image.fromarray((result_np * 255).round().astype("uint8"))
    result_pil.save("safe_image.png")
    
