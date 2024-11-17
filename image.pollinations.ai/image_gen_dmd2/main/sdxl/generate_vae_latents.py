from diffusers import AutoencoderKL
from PIL import Image 
from tqdm import tqdm 
import numpy as np 
import accelerate 
import argparse 
import torch 
import time 
import glob 
import os 

torch.set_grad_enabled(False)

class TempDataset(torch.utils.data.Dataset):
    def __init__(self, image_array, prompt_array, image_size, resize=False):
        self.image_array = image_array
        self.prompt_array = prompt_array 
        self.image_size = image_size
        self.resize = resize 

    def __len__(self):
        return len(self.image_array)

    def __getitem__(self, idx):
        prompt = self.prompt_array[idx]
        image =  self.image_array[idx % len(self.image_array)].permute(1, 2, 0)
        image = image.numpy()
        if self.resize:
            image = Image.fromarray(image).resize((self.image_size, self.image_size), Image.LANCZOS)
        return {
            "images": torch.tensor(np.array(image), dtype=torch.float32).permute(2, 0, 1),
            "prompts": prompt
        } 


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", type=str, required=True, help="path to folder")
    parser.add_argument("--output_folder", type=str)
    parser.add_argument("--model_name", type=str, choices=['sdxl', 'sd'], default='sdxl')
    parser.add_argument("--image_size", type=int, default=0)
    parser.add_argument("--resize", action="store_true")

    args = parser.parse_args()
    
    os.makedirs(args.output_folder, exist_ok=True)

    IS_SDXL = args.model_name == 'sdxl'
    SDXL_MODEL_NAME = "stabilityai/stable-diffusion-xl-base-1.0"
    SD_MODEL_NAME = "runwayml/stable-diffusion-v1-5"

    accelerator = accelerate.Accelerator()
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True 

    vae = AutoencoderKL.from_pretrained(
        SDXL_MODEL_NAME if IS_SDXL else SD_MODEL_NAME, 
        subfolder="vae"
    ).to(accelerator.device).float()

    image_file = sorted(glob.glob(os.path.join(args.folder, "*.pt"))) 
    
    print(f"process {accelerator.process_index}, file {image_file}")

    if accelerator.process_index >= len(image_file):
        time.sleep(100000)

    image_file = image_file[accelerator.process_index]

    print(f"process {accelerator.process_index} start loading data...")
    data = torch.load(image_file)

    print( f"process {accelerator.process_index}done loading data...")

    image_dataset = TempDataset(data['images'], data["prompts"], args.image_size, resize=args.resize)
    image_dataloader = torch.utils.data.DataLoader(image_dataset, batch_size=16, num_workers=8)

    latent_list = [] 
    prompt_list = [] 

    for i, data in tqdm(enumerate(image_dataloader), disable=accelerator.local_process_index != 0):
        batch_images = ((data["images"] / 255.0) * 2.0 - 1.0).to(accelerator.device)
        batch_prompts = data["prompts"]

        with torch.no_grad():
            latents = vae.encode(batch_images).latent_dist.sample() * vae.config.scaling_factor

        latent_list.append(latents.half().cpu().numpy())
        prompt_list.extend(batch_prompts)

    data_dict = {
        "latents": np.concatenate(latent_list, axis=0),
        "prompts": np.array(prompt_list)
    }
    output_path = os.path.join(args.output_folder, f"vae_latents_{accelerator.process_index:03d}.pt")
    torch.save(
        data_dict, output_path, pickle_protocol=5 
    )

    print(f"process {accelerator.process_index} done!")
    accelerator.wait_for_everyone()


if __name__ == "__main__":
    main()