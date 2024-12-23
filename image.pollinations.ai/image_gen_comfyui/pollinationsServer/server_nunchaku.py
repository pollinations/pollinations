from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import time
import io
import base64
import os
import requests
# from safety_checker.censor import check_safety
import uvicorn
import logging
import traceback
from PIL import Image
import json
import asyncio

SAFETY_CHECKER = False

# Global variables to track time
total_request_time_accumulated = 0
first_request_time = None
percentage_time_processing_last_2_minutes = 100
request_count = 0

# this is a list of tuples where the first element is the time of the request and the second the time the request took
request_time_log = []

# Flag to indicate if a request is being processed
is_processing_request = False

# Function to get public IP address
def get_public_ip():
    try:
        response = requests.get('https://api.ipify.org')
        return response.text
    except:
        return None

# Heartbeat function
async def send_heartbeat():
    public_ip = get_public_ip()
    if public_ip:
        try:
            port = int(os.getenv("PORT", 5002))
            url = f"http://{public_ip}:{port}"
            response = requests.post('https://image.pollinations.ai/register', json={'url': url})
            if response.status_code == 200:
                logging.info(f"Heartbeat sent successfully. URL: {url}")
            else:
                logging.error(f"Failed to send heartbeat. Status code: {response.status_code}")
        except Exception as e:
            logging.error(f"Error sending heartbeat: {str(e)}")
    else:
        logging.error("Failed to get public IP address")

# Periodic heartbeat function
async def periodic_heartbeat():
    while True:
        if not is_processing_request:
            await send_heartbeat()
        await asyncio.sleep(30)  # Send heartbeat every 60 seconds

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

# FLUX server settings
FLUX_SERVER_URL = "http://localhost:8000/predict"

@app.post('/generate')
async def generate(request: Request):
    global total_request_time_accumulated, first_request_time, request_count, percentage_time_processing_last_2_minutes, is_processing_request

    is_processing_request = True
    try:
        try:
            raw_body = await request.body()
            # Decode the bytes to a string (assuming UTF-8 encoding)
            decoded_body = raw_body.decode('utf-8')
            # Parse the decoded string as JSON
            data = json.loads(decoded_body)
        except Exception as e:
            logger.error(f"Error in generate while parsing json: {e}")
            logger.error(f"Response text: {decoded_body}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500, headers={"Connection": "close"})
        
        prompts = data.get('prompts', ['children'])

        def convert_to_int(value, default):
            try:
                return int(value)
            except (ValueError, TypeError):
                return default

        width = max((convert_to_int(data.get('width'), 1024)), 32)
        height = max((convert_to_int(data.get('height'), 1024)), 32)

        # ensure height and width are divisible by 8
        width = (width // 8) * 8
        height = (height // 8) * 8

        seed = convert_to_int(data.get('seed', -1), -1)
        seed = int(seed) if seed > 0 else None

        # Get the steps parameter, default to 4 if not supplied
        steps = convert_to_int(data.get('steps', 4), 4)

        # Log the start time for the entire request processing
        request_start_time = time.time()

        # Send request to FLUX server
        try:
            flux_request = {
                "prompt": prompts[0],
                "width": width,
                "height": height,
                "num_inference_steps": steps,
                "seed": seed
            }
            response = requests.post(FLUX_SERVER_URL, json=flux_request)
            response.raise_for_status()
            image_path = response.json()["image_path"]
            
            if not os.path.exists(image_path):
                logger.error("Generated image not found")
                return JSONResponse(content={"error": "Generated image not found"}, status_code=500)

            with open(image_path, "rb") as image_file:
                img_byte_arr = image_file.read()

            # Remove the file from disk after it's sent
            os.remove(image_path)

        except Exception as e:
            logger.error(f"Error in generate while calling FLUX server: {e}")
            logger.error(traceback.format_exc())
            return JSONResponse(content={"error": str(e)}, status_code=500)

        # Convert image to base64
        img_base64 = base64.b64encode(img_byte_arr).decode('utf-8')

        # Convert image to PIL
        img_pil = Image.open(io.BytesIO(img_byte_arr))

        # Log the start time for the safety checker
        safety_check_start_time = time.time()
        logger.info("starting safety check")
        # concepts, has_nsfw_concepts_list = check_safety([img_pil], safety_checker_adj=0.0)
        concepts, has_nsfw_concepts_list = [None], [False]
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
            "seed": seed if seed is not None else -1,
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

        logger.info(f"Total request time: {total_request_time:.2f} seconds")
        logger.info(f"Percentage of time spent processing requests: {percentage_time_processing:.2f}%")

        request_time_log.append((request_start_time, total_request_time))
        if total_time_passed < 120:
            percentage_time_processing_last_2_minutes = percentage_time_processing
        else:
            percentage_time_processing_last_2_minutes = calculate_percentage_time_processing_requests_last_2_minutes()
        logger.info(f"Percentage of time spent processing requests in the last 2 minutes: {percentage_time_processing_last_2_minutes:.2f}%")

        # Send a heartbeat after the request is completed
        await send_heartbeat()

        return JSONResponse(content=response_content, media_type="application/json", headers={"Connection": "close"})
    except Exception as e:
        logger.error(f"Error in generate: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse(content={"error": str(e)}, status_code=500, headers={"Connection": "close"})
    finally:
        is_processing_request = False

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(periodic_heartbeat())

import os

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5002))
    print("To run the server with multiple workers, use the following command:")
    print(f"uvicorn server:app --host 0.0.0.0 --port {port} --workers 4")
    raise Exception("run using uvicorn server:app --host 0.0.0.0 --port 5002 --workers 2")
    # uvicorn.run(app, host='0.0.0.0', port=port)