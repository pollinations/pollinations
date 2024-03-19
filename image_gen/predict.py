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




class Predictor:
    def __init__(self):
        # self.instaflow_pipe = self._load_instaflow_model()
        # self.turbo_pipe = self._load_turbo_model()
        # self.realisticvisions_pipe = self._load_realvisions_model()
        # self.cutycat_pipe = self.load_cutycat_model()
    
        self.streamdiffusion = self._load_streamdiffusion_model()#model_id_or_path="./models/haveall.safetensors")
        # self.streamdeliberate = self._load_streamdiffusion_model(model_id_or_path="./models/deliberate_v5_sfw.safetensors")
        # self.dreamshaper_pipe = self._load_dreamshaper_model()
        # self.juggernaut_pipe = self._load_streamdiffusion_model(model_id_or_path="./models/juggernautreborn.safetensors")
        # # self.pixart_pipe = self._load_pixart()
        # dreamshaper_pipes = self._load_dreamshaper_model()
        # self.dreamshaper_pipe = dreamshaper_pipes[0]
        # self.formulaxl_pipe = self.load_formulaxl_model()
        # self.playground_pipe = self._load_playground_model()
        # self.dpo_pipe = self.load_dpo_model()
        # self.dalle3xl_pipe = self.load_dalle3xl_model()
        # # self.dreamshaper_img2img_pipe = dreamshaper_pipes[1]
        print("CUDA version:", torch.version.cuda)
        print("PyTorch version:", torch.__version__)


    def load_dalle3xl_model(self):
        pipeline = DiffusionPipeline.from_pretrained("stablediffusionapi/juggernaut-xl-v5")
        pipeline.load_lora_weights("openskyml/dalle-3-xl")
        pipeline.enable_model_cpu_offload()

        pipeline.vae = tinyAutoencoder
        return pipeline

    def load_cutycat_model(self):
        pipeline = DiffusionPipeline.from_single_file("models/cutycat.pth")
        pipeline.enable_model_cpu_offload()

        pipeline.vae = tinyAutoencoder
        return pipeline

    def _load_streamdiffusion_model(
        self,
        model_id_or_path: str = "lykon/dreamshaper-xl-lightning",
        lora_dict: Optional[Dict[str, float]] = None,
        width: int = 768,
        height: int = 768,
        acceleration: Literal["none", "xformers", "tensorrt"] = "xformers",
        use_denoising_batch: bool = False,
        seed: int = 2,
    ):
        # lora_dict = {
        #     "/home/ubuntu/pollinations/image_gen/models/hd20horizon20v10.safetensors": 1.0
        # }
        # textual_inversions_dict = {
        #     "badprompt": "/home/ubuntu/pollinations/image_gen/models/bad_prompt_version2-neg.pt"
        # }
        # textual_inversions_dict = None

        stream = StreamDiffusionWrapper(
            model_id_or_path=model_id_or_path,
            # lora_dict=lora_dict,
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
            # textual_inversions_dict=textual_inversions_dict,
        )


        return stream
    
    #realvisxlV30Turbo.oNAT.safetensors
    def _load_realvisions_model(self):
        print("Loading RealVisions model...")
        pipe = StableDiffusionXLPipeline.from_single_file(
            "models/realvisxlV30Turbo.oNAT.safetensors", 
            torch_dtype=torch.float16, 
            safety_checker=None
        ) 
        pipe.safety_checker = None
        print("RealVisions model loaded.")


        # pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        #/home/ubuntu/anaconda3/envs/streamdiffusion/lib/python3.10/site-pa
        # ckages/diffusers/configuration_utils.py:139: FutureWarning: Access
        # ing config attribute `use_karras_sigmas` directly via 'DPMSolverSD
        # EScheduler' object attribute is deprecated. Please access 'use_kar
        # ras_sigmas' over 'DPMSolverSDEScheduler's config object instead, e
        # .g. 'scheduler.config.use_karras_sigmas'.
        
        pipe.scheduler.config.use_karras_sigmas = 'true'
        pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config)
        # pipe.enable_model_cpu_offload()
        pipe.vae = tinyAutoencoder

        pipe.enable_attention_slicing()
        # pipe.enable_xformers_memory_efficient_attention() 
        # pipe.enable_vae_tiling()
        # pipe.enable_model_cpu_offload()
        # pipe = pipe.to("cuda")
        # adapter_id = "latent-consistency/lcm-lora-sdxl"
        # pipe.load_lora_weights(adapter_id)
        # pipe.fuse_lora()
        return pipe.to("cuda")
    
    def predict_batch(self, batch_data):

        results = []
        print("batch_data:", batch_data)
        # Process each batch
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

        # if negative_prompt is not set then set it to "worst quality, low quality, blurry"
        if not negative_prompt:
            negative_prompt = "worst quality, low quality, blurry"

        print(f"Running batch with model: {model}, width: {width}, height: {height}, number of prompts: {len(prompts)}, steps: {steps}")


        # make all prompts maximum 250 characters
        prompts = [prompt[:250] for prompt in prompts]
        max_batch_size = 1
        if model == "pixart":
            model = "realvis"
            # replace all non alpha numeric characters from prompts with spaces
            # prompts = [re.sub(r'([^\s\w]|_)+', ' ', prompt) for prompt in prompts]
        # if model != "deliberate" and model != "dreamshaper" and model != "juggernaut":
        model = "turbo"

        # if model == "formulaxl":
        #     max_batch_size =  3
        # if model == "playground":
        #     max_batch_size =  3
        # if model == "dpo":
        #     max_batch_size =  3
        # if model == "dalle3xl":
        #     max_batch_size =  3
        # if model == "realvis":
        #     max_batch_size =  1

        # if model != "dreamshaper" and model != "juggernaut" and model != "deliberate":
        #     model="turbo"
        
        # Process in chunks of 8

        print("params:", model, width, height, steps, prompts, refine, negative_prompt)
        predict_duration = 0
        for i in range(0, len(prompts),max_batch_size):
            chunked_prompts = prompts[i:i+max_batch_size]
            original_prompt = chunked_prompts[0]
            # chunked_prompts[0] = prompt_pimping(original_prompt)
            print("running on prompts", chunked_prompts, "original", original_prompt)
            with lock:
                predict_start_time = time.time()
                try:

                    # print("running streamdiffusion with steps:", steps)
                    self.streamdiffusion.prepare(
                            prompt=chunked_prompts[0],
                            num_inference_steps=n_steps,
                            # negative_prompt="",
                            # guidance_scale=5.5,
                            width=width,
                            height=height,
                            negative_prompt=negative_prompt
                        )
                    for _ in range(self.streamdiffusion.batch_size - 1):
                        self.streamdiffusion()

                    batch_results = [self.streamdiffusion()]

                except Exception as e:
                    print("Exception occurred:", e)
                    # print stack
                    import traceback
                    traceback.print_exc()
                    # quit the process
                    os._exit(1)

                concepts, has_nsfw_concepts = check_safety(batch_results, 0.0)
                predict_end_time = time.time()

                # Calculate the time spent in predict_batch
                predict_duration += predict_end_time - predict_start_time

            # Save results and add to output
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
        default_params = {"width": 1024, "height": 1024, "steps": 4, "seed": None, "model": "turbo", "refine": False,"negative_prompt":"ugly, chaotic"}
        params = default_params.copy()

        # Try to convert and update each parameter individually
        for param in ['width', 'height', 'steps', 'seed']:
            try:
                if param in data:
                    params[param] = int(data[param])
            except:
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

    response, predict_duration = predictor.predict_batch(data)

    accumulated_predict_duration += predict_duration

    # Calculate the total time the app has been running
    total_time = time.time() - total_start_time

    # Calculate and print the percentage of time spent in predict_batch
    predict_percentage = (accumulated_predict_duration / total_time) * 100
    print(f"Predict time percentage: {predict_percentage}%")


    print("Returning response for one request.")
    return jsonify(response)

import clip
device = "cuda" if torch.cuda.is_available() else "cpu"
clip_model, _ = clip.load("ViT-L/14", device=device)
aesthetic_model = get_aesthetic_model()

@app.route('/embeddings', methods=['POST'])
def embeddings_endpoint():
    data = request.json

    prompts = data["prompts"]

    embeddings = []
    start_time = time.time()

    aesthetics_scores = []
    # for prompt in prompts:
    token = clip.tokenize(prompts, truncate=True).to(device)
    with torch.no_grad():
        embeddings = clip_model.encode_text(token)
        aesthetics_scores = aesthetic_model(embeddings)
        # squash last dimeinsion of aesthetics_scores
        aesthetics_scores = aesthetics_scores.squeeze(-1)
        print("aesthetics_score:", aesthetics_scores)
    end_time = time.time()
    print(f"Time to calculate embeddings: {(end_time - start_time)*1000} milliseconds")
    print("Returning embeddings for one request.", len(embeddings))


    return jsonify({
        "embeddings": embeddings.cpu().numpy().tolist(),
        "aesthetics_scores": aesthetics_scores.cpu().numpy().tolist()
    })

# import uform

# model = uform.get_model('unum-cloud/uform-vl-english') # Just English

# @app.route('/embeddings', methods=['POST'])
# def embeddings_endpoint():
#     data = request.json

#     prompts = data["prompts"]


#     embeddings = []
#     start_time = time.time()
#     print("got prompts", prompts)
#     with torch.no_grad():
#         for prompt in prompts:
#             text_data = model.preprocess_text(prompt)
#             text_embedding = model.encode_text(text_data)
#             # remove first dimension
#             text_embedding = text_embedding[0]
#             # print("text_embedding:", text_embedding.shape)
#             embeddings.append(text_embedding.cpu().numpy().tolist())
#     end_time = time.time()
#     # print("embeddings:", embeddings)
#     # embeddings = embeddings.cpu().numpy().tolist()
#     print(f"Time to calculate embeddings: {(end_time - start_time)*1000} milliseconds")
#     print("Returning embeddings for one request.", len(embeddings))
#     return jsonify(embeddings)


def prompt_pimping(input_text):
    output = pimper_model.generate(tokenizer(input_text, return_tensors="pt").input_ids.to("cuda"), max_length=77)
    result_text = tokenizer.decode(output[0])
    if len(result_text) < len(input_text):
        print("ERRROR for some reason pimped prompt is shorter than original. returning original")
        return input_text
    return result_text
import os
if __name__ == "__main__":
    print("Starting Flask app...")
    # from env PORT or 5555
    app.run(debug=False, host="0.0.0.0", port=os.environ.get("PORT", 5555))

