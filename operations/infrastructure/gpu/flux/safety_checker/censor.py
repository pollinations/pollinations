import os.path

# import gradio as gr
import numpy as np
import torch
from PIL import Image
from diffusers.utils import logging
from safety_checker.safety_checker import StableDiffusionSafetyChecker
from transformers import AutoFeatureExtractor



logger = logging.get_logger(__name__)

safety_model_id = "CompVis/stable-diffusion-safety-checker"
safety_feature_extractor = None
safety_checker = None

warning_image = os.path.join("extensions", "stable-diffusion-webui-nsfw-filter", "warning", "warning.png")


def numpy_to_pil(images):
    """
    Convert a numpy image or a batch of images to a PIL image.
    """
    if images.ndim == 3:
        images = images[None, ...]
    images = (images * 255).round().astype("uint8")
    pil_images = [Image.fromarray(image) for image in images]

    return pil_images


# check and replace nsfw content
def check_safety(x_image, safety_checker_adj: float):
    global safety_feature_extractor, safety_checker

    if safety_feature_extractor is None:
        safety_feature_extractor = AutoFeatureExtractor.from_pretrained(safety_model_id)
        safety_checker = StableDiffusionSafetyChecker.from_pretrained(safety_model_id).to("cuda")

    # if x_image is an array of PIL images dont convert
    if isinstance(x_image, list) and not isinstance(x_image[0], Image.Image):
        x_image = numpy_to_pil(x_image)
    
    safety_checker_input = safety_feature_extractor(x_image, return_tensors="pt").to("cuda")
    has_nsfw_concept, concepts = safety_checker(
        images=x_image,
        clip_input=safety_checker_input.pixel_values,
        safety_checker_adj=safety_checker_adj,  # customize adjustment
    )

    print("concept", concepts, "has_nsfw_concept", has_nsfw_concept)

    # Convert both numpy types and sets to Python types
    return replace_numpy_with_python(replace_sets_with_lists(concepts)), replace_numpy_with_python(replace_sets_with_lists(has_nsfw_concept))


def censor_batch(x, safety_checker_adj: float):
    x_samples_ddim_numpy = x.cpu().permute(0, 2, 3, 1).numpy()
    x_checked_image, has_nsfw_concept = check_safety(x_samples_ddim_numpy, safety_checker_adj)
    x = torch.from_numpy(x_checked_image).permute(0, 3, 1, 2)

    index = 0
    for unsafe_value in has_nsfw_concept:
        try:
            if unsafe_value is True:
                hwc = x.shape
                y = Image.open(warning_image).convert("RGB").resize((hwc[3], hwc[2]))
                y = (np.array(y) / 255.0).astype("float32")
                y = torch.from_numpy(y)
                y = torch.unsqueeze(y, 0).permute(0, 3, 1, 2)
                assert y.shape == x.shape
                x[index] = y
            index += 1
        except Exception as e:
            logger.warning(e)
            index += 1

    return x


# class NsfwCheckScript(scripts.Script):
#     def title(self):
#         return "NSFW check"

#     def show(self, is_img2img):
#         return scripts.AlwaysVisible

#     def postprocess_batch(self, p, *args, **kwargs):
#         """
#         Args:
#             p:
#             *args:
#                 args[0]: enable_nsfw_filer. True: NSFW filter enabled; False: NSFW filter disabled
#                 args[1]: safety_checker_adj
#             **kwargs:
#         Returns:
#             images
#         """

#         images = kwargs['images']
#         if args[0] is True:
#             images[:] = censor_batch(images, args[1])[:]    

#     def ui(self, is_img2img):
#         enable_nsfw_filer = gr.Checkbox(label='Enable NSFW filter',
#                                         value=False,
#                                         elem_id=self.elem_id("enable_nsfw_filer"))
#         safety_checker_adj = gr.Slider(label="Safety checker adjustment",
#                                        minimum=-0.5, maximum=0.5, value=0.0, step=0.001,
#                                        elem_id=self.elem_id("safety_checker_adj"))
#         return [enable_nsfw_filer, safety_checker_adj]



# image is passed as first argument when calling this script from command line
import argparse

if __name__ == "__main__":

    # get arguments
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", help="path to image")
    args = parser.parse_args()

    # load image
    image = Image.open(args.image).convert("RGB")

    # convert image to numpy array
    image = np.array(image) / 255.0

    #  reshape
    image = np.expand_dims(image, 0)

    # check safety
    _image, has_nsfw_concept = check_safety(image, safety_checker_adj=0.0)
    
    print("Has NSFW concept:", has_nsfw_concept)


# mininmal fastapi service for check
from fastapi import FastAPI, File, UploadFile
import io

app = FastAPI()

@app.post("/check")
async def check(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    image = np.array(image) / 255.0
    image = np.expand_dims(image, 0)
    [concept], [has_nsfw_concept] = check_safety(image, safety_checker_adj=0.0)
    print("NSFW", has_nsfw_concept, concept)
    return {"nsfw": has_nsfw_concept, "concept": concept}


# function to recursively travers a list or dict and replace all sets with lists
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

# function to recursively traverse a list or dict and replace all numpy numbers with regular Python numbers
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

# run with uvicorn
# uvicorn scripts.censor:app --reload --port 10000

# curl command
# curl -X POST -F "file=@<image_file_path>" http://localhost:8000/check 
# result: {"nsfw": true/false}


# node example with node-fetch
# const fetch = require('node-fetch');
# const fs = require('fs');
# const FormData = require('form-data');
# const form = new FormData();
# form.append('file', fs.createReadStream('<image_file_path>'));
# fetch('http://localhost:8000/check', { method: 'POST', body: form })
#     .then(res => res.json())
#     .then(json => console.log(json))