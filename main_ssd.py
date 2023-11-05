import os
import torch
import time
from flask import Flask, request, jsonify
from diffusers import DiffusionPipeline, StableDiffusionXLPipeline, UniPCMultistepScheduler
import threading
from free_lunch_utils import register_free_upblock2d, register_free_crossattn_upblock2d

app = Flask(__name__)
lock = threading.Lock()

class Predictor:
    def __init__(self):
        self.ssd_pipe = self._load_ssd_model()
        self.lcm_pipe = self._load_lcm_model()

    def _load_ssd_model(self):
        pipe = StableDiffusionXLPipeline.from_pretrained("segmind/SSD-1B", 
            torch_dtype=torch.float16, 
            use_safetensors=True, 
            variant="fp16", 
            safety_checker=None)
        pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)
        pipe.to("cuda")
        #  # -------- freeu block registration
        # register_free_upblock2d(pipe, b1=1.2, b2=1.4, s1=0.9, s2=0.2)
        # register_free_crossattn_upblock2d(pipe, b1=1.2, b2=1.4, s1=0.9, s2=0.2)
        # # -------- freeu block registration
        return pipe

    def _load_lcm_model(self):
        pipe = DiffusionPipeline.from_pretrained(
            "SimianLuo/LCM_Dreamshaper_v7",
            custom_pipeline="latent_consistency_txt2img",
            custom_revision="main",
            torch_dtype=torch.float16,
            safety_checker=None,
        )
        # # -------- freeu block registration
        # register_free_upblock2d(pipe, b1=1.2, b2=1.4, s1=0.9, s2=0.2)
        # register_free_crossattn_upblock2d(pipe, b1=1.2, b2=1.4, s1=0.9, s2=0.2)
        # # -------- freeu block registration
        pipe.to("cuda")
        return pipe

    def predict(self, prompt: str, width: int, height: int, steps: int, seed: int = None) -> str:
        seed = seed or int.from_bytes(os.urandom(2), "big")
        torch.manual_seed(seed)

        if steps > 5:
            steps = steps * 2  # double the steps for SSD model
            pipe_to_use = self.ssd_pipe
            print("Using the SSD model for inference.")
            result = pipe_to_use(
                prompt=prompt, width=width, height=height,
                guidance_scale=8.0, num_inference_steps=steps,
                num_images_per_prompt=1, 
                output_type="pil"
            ).images[0]
        else:
            pipe_to_use = self.lcm_pipe
            print("Using the LCM model for inference.")
            result = pipe_to_use(
                prompt=prompt, width=width, height=height,
                guidance_scale=8.0, num_inference_steps=steps,
                num_images_per_prompt=1, lcm_origin_steps=50,
                output_type="pil"
            ).images[0]

        return self._save_result(result)

    def _save_result(self, result) -> str:
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        output_dir = "/tmp/imagecache"
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        output_path = os.path.join(output_dir, f"out-{timestamp}.jpg")
        result.save(output_path)
        return output_path

predictor = Predictor()

@app.route('/predict', methods=['POST'])
def predict_endpoint():
    with lock:
        data = request.json
        prompt = data["prompt"]
        width = 768
        height = 768
        steps = 4
        seed = int.from_bytes(os.urandom(2), "big")
        try:
            width = int(data["width"])
            height = int(data["height"])
            steps = int(data["steps"])
            seed = int(data.get("seed"))
        except:
            print("error parsing width, height, steps, or seed. using defaults")
            pass

        # Ensure width and height are divisible by 8
        width = width - (width % 8)
        height = height - (height % 8)

        output_path = predictor.predict(prompt, width, height, steps, seed)
        return jsonify({"output_path": output_path})

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5555)
