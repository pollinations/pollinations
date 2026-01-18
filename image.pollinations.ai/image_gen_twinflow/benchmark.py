"""
Benchmark script for Z-Image-Turbo on Modal
Runs multiple generations to get accurate timing data
"""

import time
import modal

app = modal.App.lookup("zimage-turbo")
ZImageTurbo = modal.Cls.from_name("zimage-turbo", "ZImageTurbo")

prompts = [
    "a cute cat sitting on a windowsill, photorealistic",
    "a beautiful sunset over mountains, highly detailed, 8k",
    "a futuristic city at night with neon lights",
    "a portrait of a young woman with flowers in her hair",
    "an astronaut riding a horse on mars",
    "a cozy coffee shop interior, warm lighting",
    "a dragon flying over a medieval castle",
    "a tropical beach with crystal clear water",
    "a steampunk robot in a Victorian library",
    "a magical forest with glowing mushrooms",
]

def benchmark():
    print("🚀 Starting Z-Image-Turbo benchmark...")
    print(f"   Running {len(prompts)} generations\n")
    
    model = ZImageTurbo()
    times = []
    
    for i, prompt in enumerate(prompts):
        print(f"[{i+1}/{len(prompts)}] Generating: {prompt[:50]}...")
        
        t0 = time.time()
        image_bytes = model.generate.remote(
            prompt=prompt,
            width=1024,
            height=1024,
            num_inference_steps=9,
            seed=42 + i,
        )
        elapsed = time.time() - t0
        times.append(elapsed)
        
        print(f"   ✅ {elapsed:.2f}s ({len(image_bytes)} bytes)\n")
    
    print("\n" + "="*50)
    print("📊 BENCHMARK RESULTS")
    print("="*50)
    print(f"Total images: {len(times)}")
    print(f"Total time: {sum(times):.2f}s")
    print(f"Average: {sum(times)/len(times):.2f}s")
    print(f"Min: {min(times):.2f}s")
    print(f"Max: {max(times):.2f}s")
    print(f"First (cold): {times[0]:.2f}s")
    print(f"Avg (warm, excluding first): {sum(times[1:])/len(times[1:]):.2f}s")
    print("="*50)

if __name__ == "__main__":
    benchmark()
