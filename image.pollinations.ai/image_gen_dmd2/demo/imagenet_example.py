from third_party.edm.training.networks import EDMPrecond
from main.edm.edm_network import get_imagenet_edm_config
from accelerate.utils import set_seed
from PIL import Image 
from tqdm import tqdm 
import numpy as np 
import argparse 
import wandb 
import torch 
import scipy 
import time 

def get_imagenet_config():
    base_config = {
        "img_resolution": 64,
        "img_channels": 3,
        "label_dim": 1000,
        "use_fp16": False,
        "sigma_min": 0,
        "sigma_max": float("inf"),
        "sigma_data": 0.5,
        "model_type": "DhariwalUNet"
    }   
    base_config.update(get_imagenet_edm_config())
    return base_config


def create_generator(checkpoint_path, base_model=None):
    if base_model is None:
        base_config = get_imagenet_config()
        generator = EDMPrecond(**base_config)
        del generator.model.map_augment
        generator.model.map_augment = None
    else:
        generator = base_model

    while True:
        try:
            state_dict = torch.load(checkpoint_path, map_location="cpu")
            break 
        except:
            print(f"fail to load checkpoint {checkpoint_path}")
            time.sleep(1)

    print(generator.load_state_dict(state_dict, strict=True))

    return generator 


@torch.no_grad()
def sample(accelerator, current_model, args, model_index):
    timesteps = torch.ones(args.eval_batch_size, device=accelerator.device, dtype=torch.long)
    current_model.eval()
    all_images = [] 
    all_images_tensor = []

    current_index = 0 

    all_labels = torch.arange(0, args.total_eval_samples*2, 
        device=accelerator.device, dtype=torch.long) % args.label_dim

    set_seed(args.seed+accelerator.process_index)

    while len(all_images_tensor) * args.eval_batch_size * accelerator.num_processes < args.total_eval_samples:
        noise = torch.randn(args.eval_batch_size, 3, 
            args.resolution, args.resolution, device=accelerator.device
        ) 

        random_labels = all_labels[current_index:current_index+args.eval_batch_size]
        one_hot_labels = torch.eye(args.label_dim, device=accelerator.device)[
            random_labels
        ]

        current_index += args.eval_batch_size

        eval_images = current_model(noise * args.conditioning_sigma, timesteps * args.conditioning_sigma, one_hot_labels) 
        eval_images = ((eval_images + 1.0) * 127.5).clamp(0, 255).to(torch.uint8).permute(0, 2, 3, 1)
        eval_images = eval_images.contiguous() 

        gathered_images = accelerator.gather(eval_images)

        all_images.append(gathered_images.cpu().numpy())
        all_images_tensor.append(gathered_images.cpu())

    if accelerator.is_main_process:
        print("all_images len ", len(torch.cat(all_images_tensor, dim=0)))

    all_images = np.concatenate(all_images, axis=0)[:args.total_eval_samples]
    all_images_tensor = torch.cat(all_images_tensor, dim=0)[:args.total_eval_samples]

    if accelerator.is_main_process:
        # Uncomment if you need to save the images 
        # np.savez(os.path.join(args.folder, f"eval_image_model_{model_index:06d}.npz"), all_images)
        # raise 
        grid_size = int(args.test_visual_batch_size**(1/2))
        eval_images_grid = all_images[:grid_size*grid_size].reshape(grid_size, grid_size, args.resolution, args.resolution, 3)
        eval_images_grid = np.swapaxes(eval_images_grid, 1, 2).reshape(grid_size*args.resolution, grid_size*args.resolution, 3)

        data_dict = {
            "generated_image_grid": wandb.Image(eval_images_grid)
        }

        data_dict['image_mean'] = all_images_tensor.float().mean().item()
        data_dict['image_std'] = all_images_tensor.float().std().item()

        wandb.log(
            data_dict,
            step=model_index
        )

    accelerator.wait_for_everyone()
    return all_images_tensor 

@torch.no_grad()
def calculate_inception_stats(all_images_tensor, evaluator, accelerator, evaluator_kwargs, feature_dim, max_batch_size):
    mu = torch.zeros([feature_dim], dtype=torch.float64, device=accelerator.device)
    sigma = torch.ones([feature_dim, feature_dim], dtype=torch.float64, device=accelerator.device)
    num_batches = ((len(all_images_tensor) - 1) // (max_batch_size * accelerator.num_processes ) + 1) * accelerator.num_processes 
    all_batches = torch.arange(len(all_images_tensor)).tensor_split(num_batches)
    rank_batches = all_batches[accelerator.process_index :: accelerator.num_processes]

    for i in tqdm(range(num_batches//accelerator.num_processes), unit='batch', disable=not accelerator.is_main_process):
        images = all_images_tensor[rank_batches[i]]
        features = evaluator(images.permute(0, 3, 1, 2).to(accelerator.device), **evaluator_kwargs).to(torch.float64)
        mu += features.sum(0)
        sigma += features.T @ features

    # Calculate grand totals.
    mu = accelerator.reduce(mu) 
    sigma = accelerator.reduce(sigma)
    mu /= len(all_images_tensor)
    sigma -= mu.ger(mu) * len(all_images_tensor)
    sigma /= len(all_images_tensor) - 1
    return mu.cpu().numpy(), sigma.cpu().numpy()

def calculate_fid_from_inception_stats(mu, sigma, mu_ref, sigma_ref):
    m = np.square(mu - mu_ref).sum()
    s, _ = scipy.linalg.sqrtm(np.dot(sigma, sigma_ref), disp=False)
    fid = m + np.trace(sigma + sigma_ref - s * 2)
    return float(np.real(fid))

@torch.no_grad()
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint_path", type=str, required=True)
    parser.add_argument("--eval_batch_size", type=int, default=64)
    parser.add_argument("--resolution", type=int, default=64)
    parser.add_argument("--label_dim", type=int, default=1000)
    parser.add_argument("--sigma_max", type=float, default=80.0)
    parser.add_argument("--sigma_min", type=float, default=0.002)
    parser.add_argument("--seed", type=int, default=10)
    parser.add_argument("--dataset_name", type=str, default="imagenet")
    parser.add_argument("--conditioning_sigma", type=float, default=80.0)
    
    args = parser.parse_args()

    device = torch.device('cuda')

    set_seed(args.seed)

    print(f"Loading models from {args.checkpoint_path}")

    generator = create_generator(
        args.checkpoint_path
    ).to(device)

    print(f"Generating {args.eval_batch_size} images")

    random_labels = torch.randint(0, args.label_dim, (args.eval_batch_size, ), device=device)
    one_hot_labels = torch.eye(args.label_dim, device=device)[
        random_labels
    ]

    noise = torch.randn(args.eval_batch_size, 3, 
        args.resolution, args.resolution, device=device
    ) 

    eval_images = generator(noise * args.conditioning_sigma, torch.ones(args.eval_batch_size, device=device) * args.conditioning_sigma, one_hot_labels)
    eval_images = ((eval_images + 1.0) * 127.5).clamp(0, 255).to(torch.uint8).permute(0, 2, 3, 1)

    print("Saving images")
    eval_images = eval_images.cpu().numpy()

    grid_size = int(args.eval_batch_size**(1/2))
    eval_images_grid = eval_images[:grid_size*grid_size].reshape(grid_size, grid_size, args.resolution, args.resolution, 3)
    eval_images_grid = np.swapaxes(eval_images_grid, 1, 2).reshape(grid_size*args.resolution, grid_size*args.resolution, 3)

    Image.fromarray(eval_images_grid).save("imagenet_grid.jpg")

if __name__ == "__main__":
    main()    