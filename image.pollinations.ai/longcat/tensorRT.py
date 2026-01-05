import torch
from diffusers import LongCatImagePipeline

DEVICE = "cuda"
DTYPE = torch.float16

# Load pipeline
pipe = LongCatImagePipeline.from_pretrained(
    "meituan-longcat/LongCat-Image",
    torch_dtype=DTYPE,
    safety_checker=None,
    cache_dir="model_cache"
).to(DEVICE)

# Correct LongCat module
unet = pipe.image_unet
unet.eval()

# Text encoder properties
TEXT_SEQ = 77
TEXT_DIM = pipe.text_encoder.config.hidden_size

@torch.no_grad()
def export_unet(name, h, w):
    latent = torch.randn(
        1, 4, h, w,
        device=DEVICE,
        dtype=DTYPE
    )

    timestep = torch.tensor(
        [1],
        device=DEVICE,
        dtype=torch.int64
    )

    encoder_hidden_states = torch.randn(
        1, TEXT_SEQ, TEXT_DIM,
        device=DEVICE,
        dtype=DTYPE
    )

    torch.onnx.export(
        unet,
        (latent, timestep, encoder_hidden_states),
        f"longcat_unet_{name}.onnx",
        input_names=[
            "latent",
            "timestep",
            "encoder_hidden_states"
        ],
        output_names=["noise_pred"],
        opset_version=17,
        do_constant_folding=True
    )

# Latent shapes (image ÷ 8)
export_unet("square",     96,  96)
export_unet("landscape",  96, 168)
export_unet("portrait", 168,  96)
