import os
import time
import torch
from flask import Flask, request, jsonify
from diffusers import (
    AutoPipelineForText2Image, 
    StableDiffusionPipeline,
    EulerAncestralDiscreteScheduler,
    PixArtAlphaPipeline,
    ConsistencyDecoderVAE
)
from sfast.compilers.stable_diffusion_pipeline_compiler import compile, CompilationConfig
from collections import defaultdict
from performance_metrics import add_timestamp, get_average_generation_duration, calculate_throughput, get_timestamps
import uuid
import threading
from transformers import T5EncoderModel
import torch
import re

MODEL_NAME = "PixArt-alpha/PixArt-LCM-XL-2-1024-MS"
VAE_NAME = "openai/consistency-decoder"

# Flask App Initialization
app = Flask(__name__)

# create lock
lock = threading.Lock()

class Predictor:
    def __init__(self):

        self.turbo_pipe = self._load_turbo_model()
        self.deliberate_pipe = self._load_deliberate_model()
        self.pixart_pipe = self._load_pixart()
        print("CUDA version:", torch.version.cuda)
        print("PyTorch version:", torch.__version__)

    def _load_deliberate_model(self):
        """Loads and compiles the Deliberate model."""
        print("Loading Deliberate model...")
        pipe = StableDiffusionPipeline.from_single_file(
            "models/Deliberate_v4.safetensors", 
            torch_dtype=torch.float16, 
            safety_checker=None
        )
        pipe.safety_checker = None
        print("Deliberate model loaded.")
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
        pipe.to("cuda")
        return pipe
        return self._compile_pipeline(pipe)

    def _load_turbo_model(self):
        """Loads the Turbo model."""
        print("Loading Turbo model...")
        pipeline = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo", 
            torch_dtype=torch.float16, 
            variant="fp16"
        )
        print("Turbo model loaded.")
        return pipeline.to("cuda")
        return self._compile_pipeline(pipeline.to("cuda"))

    def _load_pixart(self):
        #only 1024-MS version is supported for now
        print("Loading PixArt model...")
        print("Using DALL-E 3 Consistency Decoder")
        # vae = ConsistencyDecoderVAE.from_pretrained(
        #     VAE_NAME,
        #     torch_dtype=torch.float16,
        #     # cache_dir=VAE_CACHE
        # )
        # pipe = PixArtAlphaPipeline.from_pretrained("PixArt-alpha/PixArt-LCM-XL-2-1024-MS", 
        #                                            torch_dtype=torch.float16, use_safetensors=True)
        # print("PixArt model loaded.")
        # pipe.text_encoder.to_bettertransformer()
        # pipe.enable_model_cpu_offload()
        # return pipe

        # # Enable memory optimizations.
        # pipe.enable_model_cpu_offload()
        # return pipe
        pipe = PixArtAlphaPipeline.from_pretrained("PixArt-alpha/PixArt-XL-2-1024-MS", torch_dtype=torch.float16, use_safetensors=True)
        pipe.enable_model_cpu_offload()
        pipe.text_encoder.to_bettertransformer()
        return pipe

        print("Using DALL-E 3 Consistency Decoder")
        vae = ConsistencyDecoderVAE.from_pretrained(
            VAE_NAME,
            torch_dtype=torch.float16,
            # cache_dir=VAE_CACHE
        )
        pipe = PixArtAlphaPipeline.from_pretrained(
            "PixArt-alpha/PixArt-LCM-XL-2-1024-MS",
            vae=vae,
            torch_dtype=torch.float16,
            use_safetensors=True,
            # cache_dir=MODEL_CACHE
        )
        # speed-up T5
        pipe.text_encoder.to_bettertransformer()
        return pipe.to("cuda")

    def _compile_pipeline(self, pipe):
        """Compiles the pipeline using xformers and Triton if available."""
        print("Compiling pipeline...")
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
        compiled_pipe = compile(pipe, config)
        print("Pipeline compiled.")
        return compiled_pipe

    def predict_batch(self, batch_data):

        results = []
        print("batch_data:", batch_data)
        # Process each batch
        data = batch_data

        model = data["model"]
        width = data["width"]
        height = data["height"]
        steps = data["steps"]
        prompts = data["prompts"]

        print(f"Running batch with model: {model}, width: {width}, height: {height}, number of prompts: {len(prompts)}, steps: {steps}")

        # print prompts in one line each
        print("Prompts:")
        for prompt in prompts:
            print(prompt)

        # make all prompts maximum 350 characters
        prompts = [prompt[:350] for prompt in prompts]

    

        max_batch_size = 16
        if model == "pixart":
            max_batch_size = 1
            # replace all non alpha numeric characters from prompts with spaces
            prompts = [re.sub(r'([^\s\w]|_)+', ' ', prompt) for prompt in prompts]
        if model == "deliberate":
            max_batch_size = 1
        # Process in chunks of 8
        for i in range(0, len(prompts),max_batch_size):
            chunked_prompts = prompts[i:i+max_batch_size]
            print("running on prompts", chunked_prompts)
            with lock:
                if model == "deliberate":
                    batch_results = self.deliberate_pipe(prompt=chunked_prompts, guidance_scale=3.5, num_inference_steps=24, width=width, height=height).images
                elif model == "pixart":
                    batch_results = self.pixart_pipe(prompt=chunked_prompts[0], guidance_scale=0.0, num_inference_steps=20, width=width, height=height).images
                else:  # turbo model
                    batch_results = self.turbo_pipe(prompt=chunked_prompts, guidance_scale=0.0, num_inference_steps=steps, width=width, height=height).images

            # Save results and add to output
            for result_image, prompt in zip(batch_results, chunked_prompts):
                output_path = self._save_result(result_image)
                results.append({
                    "output_path": output_path,
                    "model": model,
                    "width": width,
                    "height": height,
                    "steps": steps,
                    "prompt": prompt
                })
                print(f"Saved result for model: {model}, output path: {output_path}")

        return results

    def _validate_params(self, data):
        default_params = {"width": 512, "height": 512, "steps": 4, "seed": None, "model": "turbo"}
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
        print(f"Validated parameters: width: {params['width']}, height: {params['height']}, steps: {params['steps']}, seed: {params['seed']}, model: {params['model']}")
        return params
    
    def _log_performance_metrics(self, start_time, end_time):
        add_timestamp(start_time, end_time)
        average_duration = get_average_generation_duration()
        generation_speed = calculate_throughput(start_time, end_time)

        print(f"Average Generation Duration: {average_duration} seconds per image")
        print(f"Current Throughput: {generation_speed} images per second")
        print(f"Images Generated in Last 60 Seconds: {len(get_timestamps())}")

    def _save_result(self, result):
        """Saves the result image and returns its path."""
        print("Saving result image...")
        # timestamp = time.strftime("%Y%m%d-%H%M%S")

        unique_id = uuid.uuid4()
        output_dir = "/tmp/imagecache"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"out-{unique_id}.jpg")
        result.save(output_path)
        print("Result image saved at:", output_path)
        return output_path

predictor = Predictor()


import time
total_start_time = time.time()
accumulated_predict_duration = 0

@app.route('/predict', methods=['POST'])
def predict_endpoint():
    global accumulated_predict_duration

    data = request.json
    # Call _validate_params and update data with the returned params
    validated_params = predictor._validate_params(data)
    data.update(validated_params)
    
    # Start timing for predict_batch
    predict_start_time = time.time()
    response = predictor.predict_batch(data)
    predict_end_time = time.time()

    # Calculate the time spent in predict_batch
    predict_duration = predict_end_time - predict_start_time

    accumulated_predict_duration += predict_duration

    # Calculate the total time the app has been running
    total_time = time.time() - total_start_time

    # Calculate and print the percentage of time spent in predict_batch
    predict_percentage = (accumulated_predict_duration / total_time) * 100
    print(f"Predict time percentage: {predict_percentage}%")


    print("Returning response for one request.")
    return jsonify(response)


if __name__ == "__main__":
    print("Starting Flask app...")
    app.run(debug=False, host="0.0.0.0", port=5555)


