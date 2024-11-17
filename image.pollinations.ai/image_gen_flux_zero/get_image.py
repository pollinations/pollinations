import time
import random
from gradio_client import Client

client_start_time = time.perf_counter()
client = Client("black-forest-labs/FLUX.1-schnell")
client_end_time = time.perf_counter()
client_creation_time = client_end_time - client_start_time
print(f"Client created in {client_creation_time:.2f} seconds")

prompts = [
    "A beautiful sunset over the mountains",
    "A futuristic cityscape",
    "A serene beach with crystal clear water",
    "A dense forest with rays of sunlight",
    "A bustling market in a foreign country",
    "A majestic castle on a hill",
    "A tranquil garden with blooming flowers",
    "A snowy landscape with a cozy cabin",
    "A vibrant underwater scene",
    "A starry night sky over a desert"
]

for i in range(10):
    prompt = random.choice(prompts)
    start_time = time.perf_counter()
    result = client.predict(
        prompt=prompt,
        seed=random.randint(0, 10000),
        randomize_seed=True,
        width=1024,
        height=1024,
        num_inference_steps=2,
        api_name="/infer"
    )
    end_time = time.perf_counter()
    generation_time = end_time - start_time
    print(f"Image {i+1} generated with prompt '{prompt}' in {generation_time:.2f} seconds")
    print(result)