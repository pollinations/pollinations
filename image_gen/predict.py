import os
import time
import torch
from transformers import T5Tokenizer, T5ForConditionalGeneration
from flask import Flask, request, jsonify
from diffusers import (
    DiffusionPipeline,
    AutoencoderTiny,
    DDIMScheduler,
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    StableDiffusionXLPipeline,
    TCDScheduler,
    DPMSolverSDEScheduler
)
from safetensors.torch import load_file

from huggingface_hub import hf_hub_download
import sys
from typing import Literal, Dict, Optional
from hidiffusion import apply_hidiffusion, remove_hidiffusion

# from sfast.compilers.diffusion_pipeline_compiler import (compile,
#                                                          CompilationConfig)
sys.path.append(os.path.join(os.path.dirname(__file__), "StreamDiffusion"))



from collections import defaultdict
from performance_metrics import add_timestamp, get_average_generation_duration, calculate_throughput, get_timestamps
import uuid
import threading
from transformers import T5EncoderModel
import re
from safety_checker.censor import check_safety

import torch.nn as nn
from os.path import expanduser  # pylint: disable=import-outside-toplevel
from urllib.request import urlretrieve  # pylint: disable=import-outside-toplevel

tinyAutoencoder = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16)

tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-small")
pimper_model = T5ForConditionalGeneration.from_pretrained("roborovski/superprompt-v1", device_map="auto")

# Flask App Initialization
app = Flask(__name__)

# create lock
lock = threading.Lock()

def get_boltning_pipe() -> DiffusionPipeline:
    pipe = DiffusionPipeline.from_pretrained(
        "./boltning_diffusers", 
        torch_dtype=torch.float16, 
        variant="fp16"
    ).to("cuda")
    pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesdxl").to(
        device=pipe.device, dtype=pipe.dtype
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    return pipe

def get_lightning_pipe(steps:int = 4) -> DiffusionPipeline:
    base_model_id = "./zavychromaxl7"
    # base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"

    # repo_name = "ByteDance/Hyper-SD"
    # ckpt_name = f"Hyper-SDXL-{steps}steps-lora.safetensors"
    
    ckpt_name = f"sdxl_lightning_{steps}step_lora.safetensors" # Use the correct ckpt for your step setting!
    repo_name = "ByteDance/SDXL-Lightning"
    pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to("cuda")
    pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
    pipe.fuse_lora()
    # pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # try DPMSolverSDEScheduler
    pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config)
    # pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")

    # # Load resadapter for baseline
    # resadapter_model_name = "resadapter_v2_sdxl"
    # pipe.load_lora_weights(
    #     hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="pytorch_lora_weights.safetensors"), 
    #     adapter_name="res_adapter",
    #     ) # load lora weights
    # pipe.set_adapters(["res_adapter"], adapter_weights=[1.0])
    # pipe.unet.load_state_dict(
    #     load_file(hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="diffusion_pytorch_model.safetensors")),
    #     strict=False,
    #     ) # load norm weights

    return pipe

def get_hyper_pipe(steps:int = 4) -> DiffusionPipeline:
    # base_model_id = "./zavychromaxl7"
    base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"

    repo_name = "ByteDance/Hyper-SD"
    ckpt_name = f"Hyper-SDXL-{steps}steps-lora.safetensors"
    
    # ckpt_name = f"sdxl_lightning_{steps}step_lora.safetensors" # Use the correct ckpt for your step setting!
    # repo_name = "ByteDance/SDXL-Lightning"
    pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to("cuda")
    pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
    pipe.fuse_lora()
    # pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # try DPMSolverSDEScheduler
    # pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config)
    pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")

    # # Load resadapter for baseline
    # resadapter_model_name = "resadapter_v2_sdxl"
    # pipe.load_lora_weights(
    #     hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="pytorch_lora_weights.safetensors"), 
    #     adapter_name="res_adapter",
    #     ) # load lora weights
    # pipe.set_adapters(["res_adapter"], adapter_weights=[1.0])
    # pipe.unet.load_state_dict(
    #     load_file(hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="diffusion_pytorch_model.safetensors")),
    #     strict=False,
    #     ) # load norm weights

    return pipe


def get_tcd_pipe(steps: int = 4) -> DiffusionPipeline:
    device = "cuda"
    base_model_id = "./zavychromaxl7"
    tcd_lora_id = "h1t/TCD-SDXL-LoRA"
    
    pipe = StableDiffusionXLPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to(device)
    pipe.scheduler = TCDScheduler.from_config(pipe.scheduler.config)
    
    pipe.load_lora_weights(tcd_lora_id)
    pipe.fuse_lora()
    
    return pipe

# override_steps = 2

# Initialize the default pipe
pipe_hyper = get_hyper_pipe(2)

pipe_lightning = get_lightning_pipe(4)
# apply_hidiffusion(pipe)
# pipe = get_boltning_pipe()

def apply_deepcache(pipe):
    from DeepCache import DeepCacheSDHelper
    helper = DeepCacheSDHelper(pipe=pipe)
    helper.set_params(
        cache_interval=3,
        cache_branch_id=0,
    )
    helper.enable()

# apply_deepcache(pipe)


class Predictor:
    def __init__(self):
        print("CUDA version:", torch.version.cuda)
        print("PyTorch version:", torch.__version__)

    def predict_batch(self, batch_data):
        results = []
        print("batch_data:", batch_data)
        # Process each batch
        data = batch_data

        model = data["model"]
        width = data["width"]
        height = data["height"]
        if width < 32:
            width = 32
        if height < 32:
            height = 32
        steps = data["steps"]
        prompts = data["prompts"]
        refine = data["refine"]
        negative_prompt = data["negative_prompt"]

        # if negative_prompt is not set then set it to "worst quality, low quality, blurry"
        if not negative_prompt:
            negative_prompt = "worst quality, low quality, blurry"

        print(f"Running batch with model: {model}, width: {width}, height: {height}, number of prompts: {len(prompts)}, steps: {steps}")

        max_batch_size = 1

        model = "turbo"

        print("params:", model, width, height, steps, prompts, refine, negative_prompt)
        predict_duration = 0
        for i in range(0, len(prompts), max_batch_size):
            chunked_prompts = prompts[i:i + max_batch_size]
            original_prompt = chunked_prompts[0]
            chunked_prompts[0] = original_prompt
            print("running on prompts", chunked_prompts, "original", original_prompt)
            with lock:
                predict_start_time = time.time()
                try:
                    batch_results = []
                    for prompt in chunked_prompts:
                        # steps = override_steps
                        if steps < 4:
                            steps = 2
                        else:
                            steps = 4
                        pipe = pipe_hyper if steps == 2 else pipe_lightning
                        image = pipe(prompt, num_inference_steps=steps, guidance_scale=0.0, width=width, height=height, eta=0.3).images[0]
                        batch_results.append(image)

                except Exception as e:
                    print("Exception occurred:", e)
                    import traceback
                    traceback.print_exc()
                    os._exit(1)

                concepts, has_nsfw_concepts = check_safety(batch_results, 0.0)
                predict_end_time = time.time()

                predict_duration += predict_end_time - predict_start_time

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

    def _validate_params(self, data):
        default_params = {"width": 1024, "height": 1024, "steps": 4, "seed": None, "model": "turbo", "refine": False, "negative_prompt": "ugly, chaotic"}
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

    def _log_performance_metrics(self, start_time, end_time):
        add_timestamp(start_time, end_time)
        average_duration = get_average_generation_duration()
        generation_speed = calculate_throughput(start_time, end_time)

        print(f"Average Generation Duration: {average_duration} seconds per image")
        print(f"Current Throughput: {generation_speed} images per second")
        print(f"Images Generated in Last 60 Seconds: {len(get_timestamps())}")

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

@app.route('/embeddings', methods=['POST'])
def embeddings_endpoint():
    data = request.json

    prompts = data["prompts"]

    embeddings = []
    start_time = time.time()

    aesthetics_scores = []
    token = clip.tokenize(prompts, truncate=True).to(device)
    with torch.no_grad():
        embeddings = clip_model.encode_text(token)
        aesthetics_scores = aesthetic_model(embeddings)
        aesthetics_scores = aesthetics_scores.squeeze(-1)
        print("aesthetics_score:", aesthetics_scores)
    end_time = time.time()
    print(f"Time to calculate embeddings: {(end_time - start_time) * 1000} milliseconds")
    print("Returning embeddings for one request.", len(embeddings))

    return jsonify({
        "embeddings": embeddings.cpu().numpy().tolist(),
        "aesthetics_scores": aesthetics_scores.cpu().numpy().tolist()
    })

def prompt_pimping(input_text):
    output = pimper_model.generate(tokenizer(input_text, return_tensors="pt").input_ids.to("cuda"), max_length=30)
    result_text = tokenizer.decode(output[0])
    return result_text

import os
if __name__ == "__main__":
    print("Starting Flask app...")
    app.run(debug=False, host="0.0.0.0", port=os.environ.get("PORT", 5555))
