import os.path
import numpy as np
import torch
from PIL import Image, ImageFilter
from loguru import logger
from multiprocessing.managers import BaseManager
from config import IPC_SECRET_KEY, IPC_PORT
from torchvision import transforms
from utility import numpy_to_pil, replace_sets_with_lists, replace_numpy_with_python



class ModelManager(BaseManager): pass
ModelManager.register('service')
manager = ModelManager(address=('localhost', IPC_PORT), authkey=IPC_SECRET_KEY)
manager.connect()
server = manager.service()
safety_feature_extractor, safety_checker_model = server._load_safety_checker()

def check_nsfw(image_array, safety_checker_adj: float = 0.0):
    if isinstance(image_array, list) and not isinstance(image_array[0], Image.Image):
        x_image = numpy_to_pil(image_array)
    else:
        x_image = image_array if isinstance(image_array, list) else [image_array]
    
    safety_checker_input = safety_feature_extractor(x_image, return_tensors="pt").to("cuda")
    has_nsfw_concept, concepts = safety_checker_model(
        images=x_image,
        clip_input=safety_checker_input.pixel_values,
        safety_checker_adj=safety_checker_adj,
    )

    return (
        replace_numpy_with_python(replace_sets_with_lists(has_nsfw_concept)),
        replace_numpy_with_python(replace_sets_with_lists(concepts))
    )


def get_safe_images(image_tensor, safety_checker_adj: float = 0.0):
    x_samples_numpy = image_tensor.cpu().permute(0, 2, 3, 1).numpy()
    has_nsfw, concepts = check_nsfw(x_samples_numpy, safety_checker_adj)
    x = torch.from_numpy(x_samples_numpy).permute(0, 3, 1, 2)

    for index, unsafe_value in enumerate(has_nsfw):
        try:
            if unsafe_value is True:
                img_np = x_samples_numpy[index]
                img_pil = Image.fromarray((img_np * 255).round().astype("uint8"))
                blurred_pil = img_pil.filter(ImageFilter.GaussianBlur(radius=16))
                blurred_np = (np.array(blurred_pil) / 255.0).astype("float32")
                blurred_tensor = torch.from_numpy(blurred_np).permute(2, 0, 1).unsqueeze(0)
                
                x[index] = blurred_tensor.squeeze(0)
        except Exception as e:
            logger.warning(f"Error blurring image {index}: {e}")

    return x

if __name__ == "__main__":
    image_path = "testImg2.jpg"
    pil_image = Image.open(image_path)
    transform = transforms.ToTensor()
    image_tensor = transform(pil_image).unsqueeze(0)  
    safe_image = get_safe_images(image_tensor, safety_checker_adj=0.0)
    result_np = safe_image[0].permute(1, 2, 0).numpy()
    result_pil = Image.fromarray((result_np * 255).round().astype("uint8"))
    result_pil.save("safe_image.jpg")
    
