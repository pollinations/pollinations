import time
import torch
import torch.nn as nn
import bitsandbytes as bnb

from diffusers import (
    LongCatImagePipeline,
    DPMSolverMultistepScheduler,
)
from diffusers import DPMSolverSinglestepScheduler

torch.backends.cuda.matmul.allow_tf32 = False
torch.backends.cudnn.allow_tf32 = False
torch.backends.cudnn.benchmark = True


class LatentOnlyVAE(nn.Module):
    def __init__(self, vae):
        super().__init__()
        self.original_vae = vae
        self.config = vae.config

    def forward(self, latents):
        class Dummy:
            def __init__(self, sample):
                self.sample = sample
        return Dummy(latents)

    def encode(self, x):
        return self.original_vae.encode(x)

    def decode(self, z):
        return self.original_vae.decode(z)


def quantize_transformer_int8(module: nn.Module) -> nn.Module:
    for name, child in list(module.named_children()):
        if isinstance(child, nn.Linear):
            int8_layer = bnb.nn.Linear8bitLt(
                child.in_features,
                child.out_features,
                bias=child.bias is not None,
                has_fp16_weights=True,
            )
            int8_layer.weight.data.copy_(child.weight.data)
            if child.bias is not None:
                int8_layer.bias.data.copy_(child.bias.data)
            setattr(module, name, int8_layer)
        else:
            quantize_transformer_int8(child)
    return module


def main():
    gpu_diffusion = torch.device("cuda:0")
    gpu_vae = torch.device("cuda:1")

    t0 = time.time()
    pipe = LongCatImagePipeline.from_pretrained(
        "meituan-longcat/LongCat-Image",
        torch_dtype=torch.float16,
    )
    print(f"Model load: {time.time() - t0:.2f}s")

    pipe.text_encoder.to(gpu_diffusion, torch.float16)
    pipe.transformer.to(gpu_diffusion, torch.float16)

    vae_original = pipe.vae
    pipe.vae = LatentOnlyVAE(pipe.vae)

    pipe.enable_xformers_memory_efficient_attention()
    pipe.enable_attention_slicing("max")
    pipe.set_progress_bar_config(disable=True)

    torch.cuda.synchronize()
    t0 = time.time()

    with torch.inference_mode():
        out = pipe(
            prompt="two cats sitting on a bench in a park",
            height=512,
            width=512,
            num_inference_steps=40,
            guidance_scale=4.0,
            enable_cfg_renorm=False,
            output_type="latent",
        )
        latents = out.images

    torch.cuda.synchronize()
    print(f"Diffusion: {time.time() - t0:.2f}s")

    latents = latents.to(gpu_vae)
    vae_decoder = vae_original.to(gpu_vae, torch.float16)

    with torch.inference_mode():
        b, n, c = latents.shape
        ch = c // 4
        s = int(n ** 0.5)

        latents = latents.view(b, s, s, ch, 2, 2)
        latents = latents.permute(0, 3, 1, 4, 2, 5)
        latents = latents.reshape(b, ch, s * 2, s * 2)

        latents = (
            latents / vae_decoder.config.scaling_factor
            + vae_decoder.config.shift_factor
        )
        image_tensor = vae_decoder.decode(
            latents, return_dict=False
        )[0]

    image = pipe.image_processor.postprocess(
        image_tensor, output_type="pil"
    )[0]
    image.save("t2i_v100_fast.png")

    print("Saved: t2i_v100_fast.png")


if __name__ == "__main__":
    main()
