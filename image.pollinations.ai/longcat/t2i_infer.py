import torch
from diffusers import LongCatImagePipeline

if __name__ == '__main__':
    device = torch.device('cuda')

    pipe = LongCatImagePipeline.from_pretrained("meituan-longcat/LongCat-Image", torch_dtype= torch.bfloat16 )
    pipe.to(device, torch.bfloat16)  

    prompt = 'a cute beautiful girl'
    
    image = pipe(
        prompt,
        height=768,
        width=1344,
        guidance_scale=4.0,
        num_inference_steps=25,
        num_images_per_prompt=1,
        generator=torch.Generator("cpu").manual_seed(43),
        enable_cfg_renorm=True,
        enable_prompt_rewrite=True
    ).images[0]
    image.save('./t2i_example.png')