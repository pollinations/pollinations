from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import time
import io
import base64
import os
import requests
from safety_checker.censor import check_safety
import uvicorn

SAFETY_CHECKER = False

# Global variables to track time
total_request_time_accumulated = 0
first_request_time = None
request_count = 0

app = FastAPI()

def create_prompt(dynamic_text, width=1024, height=1024, seed=711058089000452):
    return {
        "6": {
            "inputs": {
                "text": dynamic_text,
                "clip": ["30", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "8": {
            "inputs": {
                "samples": ["31", 0],
                "vae": ["30", 2]
            },
            "class_type": "VAEDecode"
        },
        "9": {
            "inputs": {
                "images": ["8", 0],
                "filename_prefix": "ComfyUI"
            },
            "class_type": "SaveImage"
        },
        "27": {
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            },
            "class_type": "EmptySD3LatentImage"
        },
        "30": {
            "inputs": {
                "ckpt_name": "FLUX1/flux1-schnell-fp8.safetensors"
            },
            "class_type": "CheckpointLoaderSimple"
        },
        "31": {
            "inputs": {
                "seed": seed,
                "steps": 1,
                "cfg": 1,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1,
                "model": ["30", 0],
                "positive": ["6", 0],
                "negative": ["33", 0],
                "latent_image": ["27", 0]
            },
            "class_type": "KSampler"
        },
        "33": {
            "inputs": {
                "text": "",
                "clip": ["30", 1]
            },
            "class_type": "CLIPTextEncode"
        }
    }

async def queue_prompt(prompt):
    response = await requests.post("http://127.0.0.1:8188/prompt", json={"prompt": prompt})
    if response.status_code != 200:
        raise Exception(f"HTTP error! status: {response.status_code}")
    return response.json()

async def get_history(prompt_id):
    response = await requests.get(f"http://127.0.0.1:8188/history/{prompt_id}")
    if response.status_code != 200:
        raise Exception(f"HTTP error! status: {response.status_code}")
    return response.json()

async def poll_history(prompt_id):
    while True:
        history = await get_history(prompt_id)
        print(history)
        prompt_history = history.get(prompt_id)
        if prompt_history and prompt_history.get('status', {}).get('completed'):
            print('Generation completed:', prompt_history)
            return list(prompt_history['outputs'].values())[0]['images'][0]['filename']
        elif prompt_history and prompt_history.get('status', {}).get('status_str') == 'error':
            print('Generation failed:', prompt_history)
            raise Exception('Generation failed:', prompt_history)
        print('Generation in progress:', prompt_history)
        await asyncio.sleep(1)  # Wait for 1 second before polling again

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

    # ensure height and width are divisible by 8
    width = (width // 8) * 8
    height = (height // 8) * 8

    seed = convert_to_int(data.get('seed', -1), -1)

    # if the seed is not an integer set it to a random int
    # check again if its a positive integer and not a float or something else
    seed = int(seed) if seed > 0 else -1

    # Log the start time for the entire request processing
    request_start_time = time.time()

    # Prepare payload for ComfyUI
    prompt = create_prompt(prompts[0], width, height, seed if seed != -1 else None)

    # Queue the prompt and then poll for results
    try:
        data = await queue_prompt(prompt)
        print('Prompt queued:', data)
        filename = await poll_history(data['prompt_id'])
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

    # Load the generated image
    image_path = os.path.join(os.getenv("HOME"), "ComfyUI", "output", filename)
    if not os.path.exists(image_path):
        return JSONResponse(content={"error": "Generated image not found"}, status_code=500)

    with open(image_path, "rb") as image_file:
        img_byte_arr = image_file.read()

    # Convert image to base64
    img_base64 = base64.b64encode(img_byte_arr).decode('utf-8')

    # Log the start time for the safety checker
    safety_check_start_time = time.time()
    print("starting safety check")
    concepts, has_nsfw_concepts_list = check_safety([img_byte_arr], safety_checker_adj=0.0)
    print("end safety check")
    # Log the end time for the safety checker
    safety_check_end_time = time.time()
    safety_check_time = safety_check_end_time - safety_check_start_time
    print(f"Safety check time: {safety_check_time:.2f} seconds")

    response_content = {
        "image": img_base64,
        "has_nsfw_concept": has_nsfw_concepts_list[0],
        "concept": concepts[0],
        "width": width,
        "height": height,
        "seed": seed,
        "prompt": prompts[0]
    }

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
