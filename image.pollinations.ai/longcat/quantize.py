import torch
from diffusers import LongCatImagePipeline, BitsAndBytesConfig  # CRITICAL CHANGE: Import config from diffusers

# 1. Configure 4-bit quantization
# This config is specifically designed for Diffusers pipelines
quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16
)

# 2. Load the model
# The text encoder (Qwen2.5-VL) is large (7B), so we use cpu_offload to fit it on a V100
model_id = "meituan-longcat/LongCat-Image"

pipe = LongCatImagePipeline.from_pretrained(
    model_id,
    quantization_config=quantization_config,
    torch_dtype=torch.float16,
    device_map="balanced"  # balanced is often safer than 'auto' for complex pipelines
)

# 3. Enable CPU Offloading (Highly Recommended for V100 16GB)
# LongCat has a huge text encoder (7B params). Even with the transformer quantized,
# the text encoder can cause OOM on a 16GB card. This offloads it when unused.
pipe.enable_model_cpu_offload()

# 4. Generation
prompt = "A high-quality cinematic portrait of a long cat in a futuristic city"
image = pipe(prompt, height=1024, width=1024).images[0]

image.save("longcat_v100_output.png")
print("Image generated successfully!")
