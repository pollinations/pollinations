
from PIL import Image, ImageFilter
import numpy as np

def numpy_to_pil(images):
    if images.ndim == 3:
        images = images[None, ...]
    images = (images * 255).round().astype("uint8")
    return [Image.fromarray(image) for image in images]


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