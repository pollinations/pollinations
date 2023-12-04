import os
import time
import torch
from flask import Flask, request, jsonify
from diffusers import (
    AutoPipelineForText2Image, 
    StableDiffusionPipeline,
    EulerAncestralDiscreteScheduler,
    PixArtAlphaPipeline
)
from sfast.compilers.stable_diffusion_pipeline_compiler import compile, CompilationConfig
import threading
from collections import deque
from performance_metrics import add_timestamp, get_average_generation_duration, calculate_throughput, get_timestamps

# Flask App Initialization
app = Flask(__name__)
lock = threading.Lock()

# batching
request_queue = deque()
is_first_request_processing = False


class Predictor:
    def __init__(self):
        self.turbo_pipe = self._load_turbo_model()
        self.deliberate_pipe = self._load_deliberate_model()
        print("CUDA version:", torch.version.cuda)
        print("PyTorch version:", torch.__version__)

    def _load_pixart(self):
        # only 1024-MS version is supported for now
        print("Loading PixArt model...")
        pipe = PixArtAlphaPipeline.from_pretrained("PixArt-alpha/PixArt-LCM-XL-2-1024-MS", torch_dtype=torch.float16, use_safetensors=True)
        print("PixArt model loaded.")

        # Enable memory optimizations.
        pipe.enable_model_cpu_offload()
        return pipe


    def _load_deliberate_model(self):
        """Loads and compiles the Deliberate model."""
        pipe = StableDiffusionPipeline.from_single_file(
            "models/Deliberate_v4.safetensors", 
            torch_dtype=torch.float16, 
            safety_checker=None
        )
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
        pipe.to("cuda")
        return self._compile_pipeline(pipe)

    def _load_turbo_model(self):
        """Loads the Turbo model."""
        pipeline = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo", 
            torch_dtype=torch.float16, 
            variant="fp16"
        )
        return pipeline.to("cuda")

    def _compile_pipeline(self, pipe):
        """Compiles the pipeline using xformers and Triton if available."""
        config = CompilationConfig.Default()
        try:
            import xformers
            config.enable_xformers = True
        except ImportError:
            print('xformers not installed, skipping')
        
        try:
            import triton
            config.enable_triton = True
        except ImportError:
            print('Triton not installed, skipping')

        config.enable_cuda_graph = True
        return compile(pipe, config)

    def predict(self, prompt, width, height, steps, seed, model):
        """Generates an image based on the specified model and parameters."""
        seed = seed or int.from_bytes(os.urandom(2), "big")
        torch.manual_seed(seed)
        print("Running model:", model, "prompt", prompt)

        # if model == "deliberate":
        #     result = self.deliberate_pipe(prompt=prompt, guidance_scale=3.5, num_inference_steps=8, width=width, height=height).images[0]
        # else:
        #     steps = steps // 2
        #     result = self.turbo_pipe(prompt=prompt, guidance_scale=0.0, num_inference_steps=steps, width=width, height=height).images[0]

        if model == "deliberate":
            steps = 24
            result = self.deliberate_pipe(prompt=prompt, guidance_scale=3.5, num_inference_steps=steps, width=width, height=height).images[0]
        elif model == "pixart":
            print("Running pixart model with steps:", steps)
            result = self.pixart_pipe(prompt=prompt,num_inference_steps=steps, width=width, height=height).images[0]
        else:
            steps //= 2
            result = self.turbo_pipe(prompt=prompt, guidance_scale=0.0, num_inference_steps=steps, width=width, height=height).images[0]

        return self._save_result(result)

    def _save_result(self, result):
        """Saves the result image and returns its path."""
        print("Saving result image...")
        timestamp = time.strftime("%Y%m%d-%H%M%S-%f")  # Include milliseconds
        output_dir = "/tmp/imagecache"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"out-{timestamp}.jpg")
        result.save(output_path)
        print("Result image saved at:", output_path)
        return output_path

predictor = Predictor()



predictor = Predictor()
@app.route('/predict', methods=['POST'])
def predict_endpoint():
    global lock
    with lock:
        start_time = time.time()

        data = request.json
        default_params = {"width": 512, "height": 512, "steps": 4, "seed": None, "model": "turbo"}

        # Initialize parameters with default values
        params = default_params.copy()

        # Try to convert and update each parameter individually
        for param in ['width', 'height', 'steps', 'seed']:
            try:
                if param in data:
                    params[param] = int(data[param])
            except ValueError:
                print(f"Warning: Failed to convert '{param}'. Using default value.")

        # Ensure width and height are divisible by 8
        params["width"] -= params["width"] % 8
        params["height"] -= params["height"] % 8

        # Get 'model' parameter
        params["model"] = data.get("model", default_params["model"])

        output_path = predictor.predict(
            prompt=data["prompt"],
            width=params["width"],
            height=params["height"],
            steps=params["steps"],
            seed=params["seed"],
            model=params["model"]
        )

        end_time = time.time()
        add_timestamp(start_time, end_time)

        average_duration = get_average_generation_duration()
        generation_speed = calculate_throughput(start_time, end_time)

       # Log the performance metrics
        print(f"Average Generation Duration: {average_duration} seconds per image")
        print(f"Current Throughput: {generation_speed} images per second")
        print(f"Images Generated in Last 60 Seconds: {len(get_timestamps())}")

        result = {
            "output_path": output_path,
            "average_generation_duration_seconds": average_duration,
            "now_images_per_second": generation_speed,
            "images_generated_last_60_seconds": len(get_timestamps())
        }

        return jsonify(result)


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5555)