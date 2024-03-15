import os
import sys
from typing import Literal, Dict, Optional

import fire


sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from utils.wrapper import StreamDiffusionWrapper

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))


def setup_model(
    model_id_or_path: str = "stablediffusionapi/realistic-vision-v51",
    lora_dict: Optional[Dict[str, float]] = None,
    width: int = 512,
    height: int = 512,
    acceleration: Literal["none", "xformers", "tensorrt"] = "xformers",
    use_denoising_batch: bool = False,
    seed: int = 2,
):
    stream = StreamDiffusionWrapper(
        model_id_or_path=model_id_or_path,
        lora_dict=lora_dict,
        t_index_list=[0, 16, 32, 45],
        frame_buffer_size=1,
        width=width,
        height=height,
        warmup=10,
        acceleration=acceleration,
        mode="txt2img",
        use_denoising_batch=use_denoising_batch,
        cfg_type="none",
        seed=seed,
    )
    return stream


def main(
    output_dir: str = os.path.join(CURRENT_DIR, "..", "..", "images", "outputs"),
    **kwargs
):
    """
    Infinite loop listening to prompts on stdin and generating images.
    """
    stream = setup_model(**kwargs)

    while True:
        prompt = input("Enter your prompt: ")
        if prompt.strip() == "":
            print("Empty prompt received. Exiting.")
            break

        output_file = os.path.join(output_dir, f"output.png")
        stream.prepare(
            prompt=prompt,
            num_inference_steps=50,
        )

        for _ in range(stream.batch_size - 1):
            stream()

        output_image = stream()
        output_image.save(output_file)
        print(f"Image saved to {output_file}")


if __name__ == "__main__":
    fire.Fire(main)

