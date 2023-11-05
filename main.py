import os
import sys
import torch
import time
from diffusers import DiffusionPipeline

class Predictor:
    def __init__(self):
        self.pipe = self._load_model()

    def _load_model(self):
        model = DiffusionPipeline.from_pretrained(
            "SimianLuo/LCM_Dreamshaper_v7",
            custom_pipeline="latent_consistency_txt2img",
            custom_revision="main",
            torch_dtype=torch.float16
        )
        model.to("cuda")
        return model

    def predict(self, prompt: str, width: int, height: int, steps: int, seed: int = None) -> str:
        seed = seed or int.from_bytes(os.urandom(2), "big")
        torch.manual_seed(seed)

        result = self.pipe(
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
        output_path = os.path.join(output_dir, f"out-{timestamp}.png")
        result.save(output_path)
        return output_path

def main():
    predictor = Predictor()
    width = 768
    height = 768
    steps = 4
    seed = None

    for line in sys.stdin:
        prompt = line.strip()
        output_path = predictor.predict(prompt, width, height, steps, seed)
        print(output_path)

if __name__ == "__main__":
    main()
