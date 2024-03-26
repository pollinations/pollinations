import sys
sys.path.append('./StreamDiffusion/src')
import os
import time
import torch
from transformers import T5Tokenizer, T5ForConditionalGeneration
from flask import Flask, request, jsonify
from diffusers import (
    AutoPipelineForText2Image, 
    StableDiffusionPipeline,
    EulerAncestralDiscreteScheduler,
    PixArtAlphaPipeline,
    ConsistencyDecoderVAE,
    LCMScheduler,
    DPMSolverSDEScheduler,
    StableDiffusionXLPipeline,
    StableDiffusionImg2ImgPipeline,
    StableDiffusionXLImg2ImgPipeline,
    DiffusionPipeline,
    UNet2DConditionModel,
    AutoencoderTiny,
    UniPCMultistepScheduler
)
import sys
from typing import Literal, Dict, Optional
sys.path.append(os.path.join(os.path.dirname(__file__), "StreamDiffusion"))

T_INDEX_LIST=[0, 10, 30, 45]
n_steps=50
# from streamdiffusion import StreamDiffusion
# from streamdiffusion.image_utils import postprocess_image

from utils.wrapper_xl import StreamDiffusionWrapper

# from sfast.compilers.stable_diffusion_pipeline_compiler import compile, CompilationConfig
from collections import defaultdict
from performance_metrics import add_timestamp, get_average_generation_duration, calculate_throughput, get_timestamps
import uuid
import threading
from transformers import T5EncoderModel
import torch
import re
from safety_checker.censor import check_safety



import os
import torch
import torch.nn as nn
from os.path import expanduser  # pylint: disable=import-outside-toplevel
from urllib.request import urlretrieve  # pylint: disable=import-outside-toplevel

tinyAutoencoder = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16)

tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-small")
pimper_model = T5ForConditionalGeneration.from_pretrained("roborovski/superprompt-v1", device_map="auto")


def get_aesthetic_model(clip_model="vit_l_14"):
    """load the aethetic model"""
    home = expanduser("~")
    cache_folder = home + "/.cache/emb_reader"
    path_to_model = cache_folder + "/sa_0_4_"+clip_model+"_linear.pth"
    if not os.path.exists(path_to_model):
        os.makedirs(cache_folder, exist_ok=True)
        url_model = (
            "https://github.com/LAION-AI/aesthetic-predictor/blob/main/sa_0_4_"+clip_model+"_linear.pth?raw=true"
        )
        urlretrieve(url_model, path_to_model)
    if clip_model == "vit_l_14":
        m = nn.Linear(768, 1)
    elif clip_model == "vit_b_32":
        m = nn.Linear(512, 1)
    else:
        raise ValueError()
    s = torch.load(path_to_model)
    m.load_state_dict(s)
    m.eval()
    return m.half().to("cuda")
 

MODEL_NAME = "PixArt-alpha/PixArt-LCM-XL-2-1024-MS"
VAE_NAME = "openai/consistency-decoder"

# Flask App Initialization
app = Flask(__name__)

# create lock
lock = threading.Lock()

# from line_profiler import LineProfiler
# profile = LineProfiler()

class Predictor:
    # @profile
    def __init__(self):
        self.streamdiffusion = self._load_streamdiffusion_model()
        print("CUDA version:", torch.version.cuda)
        print("PyTorch version:", torch.__version__)

    # @profile
    def load_cutycat_model(self):
        pipeline = DiffusionPipeline.from_single_file("models/cutycat.pth")
        pipeline.enable_model_cpu_offload()
        pipeline.vae = tinyAutoencoder
        return pipeline

    # @profile
    def _load_streamdiffusion_model(
        self,
        model_id_or_path: str = "lykon/dreamshaper-xl-lightning",
        lora_dict: Optional[Dict[str, float]] = None,
        width: int = 1024,
        height: int = 1024,
        acceleration: Literal["none", "xformers", "tensorrt","sfast"] = "xformers",
        use_denoising_batch: bool = False,
        seed: int = 2,
    ):
        stream = StreamDiffusionWrapper(
            model_id_or_path=model_id_or_path,
            t_index_list=T_INDEX_LIST,
            frame_buffer_size=1,
            width=width,
            height=height,
            warmup=10,
            acceleration=acceleration,
            mode="txt2img",
            use_denoising_batch=use_denoising_batch,
            cfg_type="none",
            seed=seed,
            use_tiny_vae=True,
            use_lcm_lora=True,
        )
        return stream

    # @profile
    def predict_batch(self, batch_data):
        results = []
        print("batch_data:", batch_data)
        data = batch_data
        model = data["model"]
        width = data["width"]
        height = data["height"]
        if width<32:
            width = 32
        if height<32:
            height=32
        steps = data["steps"]
        prompts = data["prompts"]
        refine = data["refine"]
        negative_prompt = data["negative_prompt"]
        if not negative_prompt:
            negative_prompt = "worst quality, low quality, blurry"
        print(f"Running batch with model: {model}, width: {width}, height: {height}, number of prompts: {len(prompts)}, steps: {steps}")
        prompts = [prompt[:250] for prompt in prompts]
        max_batch_size = 32
        model = "turbo"
        predict_duration = 0
        batch_results = []
        for i in range(0, len(prompts),max_batch_size):
            chunked_prompts = prompts[i:i+max_batch_size]
            # original_prompt = chunked_prompts[0]
            # chunked_prompts[0] = original_prompt# + ". " + prompt_pimping(original_prompt)
            print("running on prompts", chunked_prompts)
            with lock:
                predict_start_time = time.time()
                try:
                    self.streamdiffusion.prepare(
                            prompt=chunked_prompts,
                            num_inference_steps=n_steps,
                            width=width,
                            height=height,
                            negative_prompt=negative_prompt
                        )
                    for _ in range(self.streamdiffusion.batch_size - 1):
                        self.streamdiffusion()
                    batch_results.append(self.streamdiffusion())
                except Exception as e:
                    print("Exception occurred:", e)
                    import traceback
                    traceback.print_exc()
                    os._exit(1)
                predict_end_time = time.time()
                predict_duration += predict_end_time - predict_start_time
        concepts, has_nsfw_concepts = check_safety(batch_results, 0.0)
        for i, (result_image, prompt) in enumerate(zip(batch_results, chunked_prompts)):
            output_path = self._save_result(result_image)
            results.append({
                "output_path": output_path,
                "model": model,
                "width": width,
                "height": height,
                "steps": steps,
                "prompt": prompt,
                "has_nsfw_concept": has_nsfw_concepts[i],
                "concept": concepts[i]
            })
            print(f"Saved result for model: {model}, output path: {output_path}")
        return results, predict_duration

    # @profile
    def _validate_params(self, data):
        default_params = {"width": 1024, "height": 1024, "steps": 4, "seed": None, "model": "turbo", "refine": False,"negative_prompt":"ugly, chaotic"}
        params = default_params.copy()
        for param in ['width', 'height', 'steps', 'seed']:
            try:
                if param in data:
                    params[param] = int(data[param])
            except:
                print(f"Warning: Failed to convert '{param}'. Using default value.")
        params["width"] -= params["width"] % 8
        params["height"] -= params["height"] % 8
        params["model"] = data.get("model", default_params["model"])
        print(f"Validated parameters: width: {params['width']}, height: {params['height']}, steps: {params['steps']}, seed: {params['seed']}, model: {params['model']}")
        return params
    
    # @profile
    def _log_performance_metrics(self, start_time, end_time):
        add_timestamp(start_time, end_time)
        average_duration = get_average_generation_duration()
        generation_speed = calculate_throughput(start_time, end_time)
        print(f"Average Generation Duration: {average_duration} seconds per image")
        print(f"Current Throughput: {generation_speed} images per second")
        print(f"Images Generated in Last 60 Seconds: {len(get_timestamps())}")

    # @profile
    def _save_result(self, result):
        print("Saving result image...")
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
# @profile
def predict_endpoint():
    global accumulated_predict_duration
    data = request.json
    validated_params = predictor._validate_params(data)
    data.update(validated_params)
    response, predict_duration = predictor.predict_batch(data)
    accumulated_predict_duration += predict_duration
    total_time = time.time() - total_start_time
    predict_percentage = (accumulated_predict_duration / total_time) * 100
    print(f"Predict time percentage: {predict_percentage}%")
    print("Returning response for one request.")
    return jsonify(response)

import clip
device = "cuda" if torch.cuda.is_available() else "cpu"
clip_model, _ = clip.load("ViT-L/14", device=device)
aesthetic_model = get_aesthetic_model()

def prompt_pimping(input_text):
    output = pimper_model.generate(tokenizer(input_text, return_tensors="pt").input_ids.to(device), max_length=30)
    result_text = tokenizer.decode(output[0])
    return result_text

import os
import time

#@profile
def test_predict(prompt_base, n=100, chunk_size=32):
    total_start_time = time.time()
    for i in range(0, n, chunk_size):
        prompts = [f"{prompt_base} {j}" for j in range(i, min(i + chunk_size, n))]
        print(f"Generating for prompts: {prompts}")
        start_time = time.time()
        batch = {"prompts": prompts, "model": "turbo", "width": 1024, "height": 1024, "seed": 42, "steps": 50, "negative_prompt":"", "refine":False}
        predictor.predict_batch(batch)
        print(f"Time for images {i} to {min(i + chunk_size, n)}: {time.time() - start_time} seconds")
    total_time = time.time() - total_start_time
    print(f"Total time for {n} images: {total_time} seconds")
    print(f"Average time per image: {total_time / n} seconds")


if __name__ == "__main__":
    print("Starting Flask app...")
    # test_predict("hello kitty", n=500)
    # profile.print_stats()
    app.run(debug=False, host="0.0.0.0", port=os.environ.get("PORT", 5555))
