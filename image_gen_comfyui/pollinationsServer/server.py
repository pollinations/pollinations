from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import time
import io
import base64
import os
import requests
from safety_checker.censor import check_safety
import uvicorn
import logging
import traceback
from PIL import Image

SAFETY_CHECKER = False

# Global variables to track time
total_request_time_accumulated = 0
first_request_time = None
percentage_time_processing_last_2_minutes = 100
request_count = 0

# this is a list of tuples where the first element is the time of the request and the second the time the request took
request_time_log = []


# calculate the percentage of time spent processing requests in the last 2 minutes
def calculate_percentage_time_processing_requests_last_2_minutes():
    current_time = time.time()
    request_times = [t for t in request_time_log if current_time - t[0] <= 60]
    total_time_last_2_minutes = sum([t[1] for t in request_times])
    return (total_time_last_2_minutes / 60) * 100 if total_time_last_2_minutes > 0 else 0

app = FastAPI()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_prompt(dynamic_text, width=1024, height=1024, seed=711058089000452, steps=4):
    # if seed width or height are not numbers set them to the defaults
    if not isinstance(seed, int):
        seed = 711058089000452
    if not isinstance(width, int):
        width = 768
    if not isinstance(height, int):
        height = 768
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
                "steps": steps,
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
    try:
        response = requests.post("http://127.0.0.1:8188/prompt", json={"prompt": prompt})
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error in queue_prompt: {e}")
        logger.error(traceback.format_exc())
        raise

async def get_history(prompt_id):
    try:
        response = requests.get(f"http://127.0.0.1:8188/history/{prompt_id}")
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error in get_history: {e}")
        logger.error(traceback.format_exc())
        raise

async def poll_history(prompt_id):
    while True:
        try:
            history = await get_history(prompt_id)
            logger.info(history)
            prompt_history = history.get(prompt_id)
            if prompt_history and prompt_history.get('status', {}).get('completed'):
                logger.info('Generation completed:')
                return list(prompt_history['outputs'].values())[0]['images'][0]['filename']
            elif prompt_history and prompt_history.get('status', {}).get('status_str') == 'error':
                logger.error('Generation failed:', prompt_history)
                raise Exception('Generation failed:', prompt_history)
            #logger.info('Generation in progress:', prompt_history)
            time.sleep(1)  # Wait for 1 second before polling again
        except Exception as e:
            logger.error(f"Error in poll_history: {e}")
            logger.error(traceback.format_exc())
            raise

@app.post('/generate')
async def generate(request: Request):
    global total_request_time_accumulated, first_request_time, request_count, percentage_time_processing_last_2_minutes

    try:
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

        # Get the steps parameter, default to 2 if not supplied
        steps = convert_to_int(data.get('steps', 2), 2)

        # Log the start time for the entire request processing
        request_start_time = time.time()

        # Prepare payload for ComfyUI
        prompt = create_prompt(prompts[0], width, height, seed if seed != -1 else None, steps)

        # Queue the prompt and then poll for results
        try:
            data = await queue_prompt(prompt)
            logger.info('Prompt queued:', data)
            filename = await poll_history(data['prompt_id'])
        except Exception as e:
            logger.error(f"Error in generate while queuing or polling: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)

        # Load the generated image
        image_path = os.path.join(os.getenv("HOME"), "ComfyUI", "output", filename)
        if not os.path.exists(image_path):
            logger.error("Generated image not found")
            return JSONResponse(content={"error": "Generated image not found"}, status_code=500)

        with open(image_path, "rb") as image_file:
            img_byte_arr = image_file.read()

        # Convert image to base64
        img_base64 = base64.b64encode(img_byte_arr).decode('utf-8')

        # Convert image to PIL
        img_pil = Image.open(io.BytesIO(img_byte_arr))

        # Log the start time for the safety checker
        safety_check_start_time = time.time()
        logger.info("starting safety check")
        concepts, has_nsfw_concepts_list = check_safety([img_pil], safety_checker_adj=0.0)
        logger.info("end safety check")
        # Log the end time for the safety checker
        safety_check_end_time = time.time()
        safety_check_time = safety_check_end_time - safety_check_start_time
        logger.info(f"Safety check time: {safety_check_time:.2f} seconds")

        response_content = {
            "image": img_base64,
            "has_nsfw_concept": has_nsfw_concepts_list[0],
            "concept": concepts[0],
            "width": width,
            "height": height,
            "seed": seed,
            "prompt": prompts[0]
        }

        # Delete the local image file after it is not needed anymore
        try:
            os.remove(image_path)
            logger.info(f"Deleted local image file: {image_path}")
        except Exception as e:
            logger.error(f"Error deleting local image file: {e}")

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

        logger.info(f"Total request time: {total_request_time:.2f} seconds")
        logger.info(f"Percentage of time spent processing requests: {percentage_time_processing:.2f}%")

        request_time_log.append((request_start_time, total_request_time))
        if total_time_passed < 120:
            percentage_time_processing_last_2_minutes = percentage_time_processing
        else:
            percentage_time_processing_last_2_minutes = calculate_percentage_time_processing_requests_last_2_minutes()
        logger.info(f"Percentage of time spent processing requests in the last 2 minutes: {percentage_time_processing_last_2_minutes:.2f}%")

        return JSONResponse(content=response_content, media_type="application/json")
    except Exception as e:
        logger.error(f"Error in generate: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(content={"error": str(e)}, status_code=500)
import os

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5002))
    uvicorn.run(app, host='0.0.0.0', port=port)
