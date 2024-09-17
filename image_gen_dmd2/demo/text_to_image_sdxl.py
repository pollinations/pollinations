import torch
from diffusers import DiffusionPipeline, UNet2DConditionModel, LCMScheduler, AutoencoderTiny, DDIMScheduler, EulerAncestralDiscreteScheduler
from huggingface_hub import hf_hub_download
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import time
import io
import base64
import cv2
import numpy as np
from safety_checker.censor import check_safety
import uvicorn
import os
from hidiffusion import apply_hidiffusion, remove_hidiffusion
from compel import Compel, ReturnedEmbeddingsType

base_model_id = "GraydientPlatformAPI/boltning-xl"
repo_name = "tianweiy/DMD2"


# ckpt_name = "dmd2_sdxl_4step_unet_fp16.bin"

# Load model
# unet = UNet2DConditionModel.from_pretrained(base_model_id, subfolder="unet").to("cuda", torch.float16)
# unet.load_state_dict(torch.load(hf_hub_download(repo_name, ckpt_name), map_location="cuda"))
# # apply_hidiffusion(unet)
# pipe = DiffusionPipeline.from_pretrained(base_model_id, unet=unet, torch_dtype=torch.float16, variant="fp16").to("cuda")
# pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
# pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16).to("cuda", torch.float16)

ckpt_name = "dmd2_sdxl_4step_lora_fp16.safetensors"
# Load model.
pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float32).to("cuda")
pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
pipe.fuse_lora(lora_scale=0.5)  # we might want to make the scale smaller for community models
pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16).to("cuda", torch.float16)
pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)

print("scheduler config", pipe.scheduler.config)
print("scheduler timesteps", pipe.scheduler.timesteps)
print("pipe timesteps", pipe.scheduler.timesteps)

pipe.to(torch.float16)
# apply_hidiffusion(pipe)
compel = Compel(
  tokenizer=[pipe.tokenizer, pipe.tokenizer_2] ,
  text_encoder=[pipe.text_encoder, pipe.text_encoder_2],
  returned_embeddings_type=ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
  requires_pooled=[False, True]
)

SAFETY_CHECKER = False

# Global variables to track time
total_request_time_accumulated = 0
first_request_time = None
request_count = 0

app = FastAPI()

@app.post('/generate')
async def generate(request: Request):
    global total_request_time_accumulated, first_request_time, request_count

    data = await request.json()
    prompts = data.get('prompts', ['children'])

    def convert_to_int(value, default):
        try:
            return int(value)
        except (ValueError, TypeError):
            return default
    width = max((convert_to_int(data.get('width', 1024), 1024)), 32)
    height = max((convert_to_int(data.get('height', 1024), 1024)), 32)

    min_pixels = 800 * 800
    current_pixels = width * height

    if current_pixels < min_pixels:
        scale_factor = (min_pixels / current_pixels) ** 0.5
        width = int(width * scale_factor)
        height = int(height * scale_factor)

    # esnsure height and width are divisible by 8
    width = (width // 8) * 8
    height = (height // 8) * 8

    seed = convert_to_int(data.get('seed', -1), -1)

    # if the seed is not an integer set it to a random int
    # check again if its a positive integer and not a float or somethuing eles

    seed = int(seed) if seed > 0 else -1


    # Log the start time for the entire request processing
    request_start_time = time.time()
    # Set the seed for reproducibility
    if seed != -1:
        generator = torch.manual_seed(seed)
    else:
        generator = None


    prompt_embeds,pooled_prompt_embeds = compel(prompts)
    # Generate images for each prompt
    images = pipe(prompt_embeds=prompt_embeds, pooled_prompt_embeds=pooled_prompt_embeds, num_inference_steps=4, guidance_scale=0, generator=generator, width=width, height=height, timesteps=[999, 749, 499, 249]).images
    # images = pipe(prompt=prompts, num_inference_steps=4, guidance_scale=0, generator=generator, width=width, height=height, 
    # timesteps=[999, 749, 499, 249]
    # ).images

    if not images:
        return JSONResponse(content={"error": "No images generated"}, status_code=500)

    response_content = []
    total_image_creation_time = 0
    total_safety_check_time = 0

    # Log the start time for image creation
    image_creation_start_time = time.time()

    # Process images in batch
    img_byte_arr_list = []
    for idx, image in enumerate(images):
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG')
        img_byte_arr_list.append(img_byte_arr.getvalue())

        # Save image to a tmp file and log it
        # tmp_file_path = f"/tmp/generated_image_{idx}.png"
        # with open(tmp_file_path, "wb") as f:
        #     f.write(img_byte_arr.getvalue())
        # print(f"Image saved to {tmp_file_path}")

    # Convert images to base64
    img_base64_list = [base64.b64encode(img_byte_arr).decode('utf-8') for img_byte_arr in img_byte_arr_list]

    # Log the end time for image creation
    image_creation_end_time = time.time()
    image_creation_time = image_creation_end_time - image_creation_start_time
    total_image_creation_time += image_creation_time
    print(f"Image creation time: {image_creation_time:.2f} seconds")

    # Log the start time for the safety checker
    safety_check_start_time = time.time()
    print("starting safety check")
    concepts, has_nsfw_concepts_list = check_safety(images, safety_checker_adj=0.0)
    print("end safety check")
    # concepts, has_nsfw_concepts_list = [None]*len(images), [None]*len(images)
    # Log the end time for the safety checker
    safety_check_end_time = time.time()
    safety_check_time = safety_check_end_time - safety_check_start_time
    total_safety_check_time += safety_check_time
    print(f"Safety check time: {safety_check_time:.2f} seconds")

    for img_base64, prompt, has_nsfw_concept, concept in zip(img_base64_list, prompts, has_nsfw_concepts_list, concepts):
        image_content = {
            "image": img_base64,
            "has_nsfw_concept": has_nsfw_concept,
            "concept": concept,
            "width": width,
            "height": height,
            "seed": seed,
            "prompt": prompt
        }

        response_content.append(image_content)

    # Log the end time for the entire request processing
    request_end_time = time.time()
    total_request_time = request_end_time - request_start_time

    # Update global time accumulators and request count
    total_request_time_accumulated += total_request_time
    request_count += 1

    # Record the time of the first request
    if first_request_time is None:
        first_request_time = request_start_time

    # Calculate the total time passed since the first request
    total_time_passed = request_end_time - first_request_time

    # Calculate the percentage of time spent processing requests
    percentage_time_processing = (total_request_time_accumulated / total_time_passed) * 100

    print(f"Total request time: {total_request_time:.2f} seconds")
    print(f"Percentage of time spent processing requests: {percentage_time_processing:.2f}%")

    return JSONResponse(content=response_content, media_type="application/json")

if __name__ == "__main__":
    uvicorn.run(app, host='0.0.0.0', port=5002)
