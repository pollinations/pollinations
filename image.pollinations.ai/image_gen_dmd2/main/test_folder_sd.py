from diffusers import UNet2DConditionModel, AutoencoderKL, StableDiffusionPipeline, DDPMScheduler
from main.coco_eval.coco_evaluator import evaluate_model, compute_clip_score
from transformers import CLIPTokenizer, CLIPTextModel
from accelerate.utils import ProjectConfiguration
from main.utils import create_image_grid
from accelerate.logging import get_logger
from main.utils import SDTextDataset
from accelerate.utils import set_seed
from accelerate import Accelerator
from tqdm import tqdm 
import numpy as np 
import argparse 
import logging 
import wandb 
import torch 
import glob 
import time 
import os 

logger = get_logger(__name__, log_level="INFO")

def create_generator(checkpoint_path, base_model=None):
    if base_model is None:
        generator = UNet2DConditionModel.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            subfolder="unet"
        ).float()
        generator.requires_grad_(False)
    else:
        generator = base_model

    # sometime the state_dict is not fully saved yet 
    counter = 0
    while True:
        try:
            state_dict = torch.load(checkpoint_path, map_location="cpu")
            break 
        except:
            print(f"fail to load checkpoint {checkpoint_path}")
            time.sleep(1)

            counter += 1 

            if counter > 100:
                return None

    # # unwrap the generator 
    # new_state_dict = {}
    # for k, v in state_dict.items():
    #     if k.startswith("feedforward_model."):
    #         new_state_dict[k[len("feedforward_model."):]] = v

    # print(generator.load_state_dict(new_state_dict, strict=True))
    print(generator.load_state_dict(state_dict, strict=True))
    return generator 

def get_x0_from_noise(sample, model_output, timestep):
    # alpha_prod_t = alphas_cumprod[timestep].reshape(-1, 1, 1, 1)
    # 0.0047 corresponds to the alphas_cumprod of the last timestep (999)
    alpha_prod_t = (torch.ones_like(timestep).float() * 0.0047).reshape(-1, 1, 1, 1) 
    beta_prod_t = 1 - alpha_prod_t

    pred_original_sample = (sample - beta_prod_t ** (0.5) * model_output) / alpha_prod_t ** (0.5)
    return pred_original_sample

@torch.no_grad()
def sample(accelerator, current_model, vae, text_encoder, dataloader, args, model_index, teacher_pipeline=None):
    current_model.eval()
    all_images = [] 
    all_captions = [] 
    counter = 0 

    set_seed(args.seed+accelerator.process_index)

    for index, batch_prompts in tqdm(enumerate(dataloader), disable=not accelerator.is_main_process, total=args.total_eval_samples // args.eval_batch_size // accelerator.num_processes):
        # prepare generator input 
        prompt_inputs = batch_prompts['text_input_ids_one'].to(accelerator.device).reshape(-1, batch_prompts['text_input_ids_one'].shape[-1])
        batch_text_caption_embedding = text_encoder(prompt_inputs)[0]

        timesteps = torch.ones(len(prompt_inputs), device=accelerator.device, dtype=torch.long)

        noise = torch.randn(len(prompt_inputs), 4, 
            args.latent_resolution, args.latent_resolution, 
            dtype=torch.float32,
            generator=torch.Generator().manual_seed(index)
        ).to(accelerator.device) 

        if args.sd_teacher:
            eval_images = teacher_pipeline(
                prompt_embeds=batch_text_caption_embedding,
                latents=noise,
                guidance_scale=args.guidance_scale,
                output_type="np",
                num_inference_steps=args.num_inference_steps
            ).images
            eval_images = (torch.tensor(eval_images, dtype=torch.float32) * 255.0).to(torch.uint8)
        else:
            # generate images and convert between noise and data prediction if needed
            eval_images = current_model(
                noise, timesteps.long() * (args.num_train_timesteps-1), batch_text_caption_embedding
            ).sample 

            if args.pred_eps:
                eval_images = get_x0_from_noise(
                    noise, eval_images, timesteps
                )

            # decode the latents and cast to uint8 RGB
            eval_images = vae.decode(eval_images * 1 / 0.18215).sample.float()
            eval_images = ((eval_images + 1.0) * 127.5).clamp(0, 255).to(torch.uint8).permute(0, 2, 3, 1)
            eval_images = eval_images.contiguous() 

        gathered_images = accelerator.gather(eval_images)

        all_images.append(gathered_images.cpu().numpy())

        all_captions.append(batch_prompts['key'])

        counter += len(gathered_images)

        if counter >= args.total_eval_samples:
            break

    all_images = np.concatenate(all_images, axis=0)[:args.total_eval_samples] 
    if accelerator.is_main_process:
        print("all_images len ", len(all_images))

    all_captions = [caption for sublist in all_captions for caption in sublist]
    data_dict = {"all_images": all_images, "all_captions": all_captions}

    if accelerator.is_main_process:        
        visualize_images = all_images[:args.test_visual_batch_size]
        visualize_captions = [caption.encode('utf-8') for caption in all_captions][:args.test_visual_batch_size]

        for start in range(0, len(visualize_images), args.per_image_object):
            end = min(start + args.per_image_object, len(visualize_images))
            if start >= end: 
                continue 
            
            eval_images_grid = create_image_grid(args, visualize_images[start:end], 
            visualize_captions[start:end] if accelerator.num_processes == 1 else None) # caption is only correct for single gpu
            wandb.log(
                {f"generated_image_grid_{start:04d}_{end:04d}": wandb.Image(eval_images_grid)},
                step=model_index
            )
        print("save images")

        image_brightness = (all_images[:5000] / 255.0).mean()
        image_std = (all_images[:5000] / 255.0).std()

        wandb.log(
            {
                "image_brightness": image_brightness,
                "image_std": image_std
            },
            step=model_index
        )

    accelerator.wait_for_everyone()
    return data_dict 

@torch.no_grad()
def evaluate():
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", type=str, required=True, help="pass to folder list")
    parser.add_argument("--wandb_entity", type=str)
    parser.add_argument("--wandb_project", type=str)
    parser.add_argument("--wandb_name", type=str)
    parser.add_argument("--eval_batch_size", type=int, default=10)
    parser.add_argument("--latent_resolution", type=int, default=64)
    parser.add_argument("--image_resolution", type=int, default=512)
    parser.add_argument("--num_train_timesteps", type=int, default=1000)
    parser.add_argument("--test_visual_batch_size", type=int, default=64)
    parser.add_argument("--per_image_object", type=int, default=64)
    parser.add_argument("--seed", type=int, default=10)
    parser.add_argument("--anno_path", type=str)
    parser.add_argument("--eval_res", type=int, default=256)
    parser.add_argument("--ref_dir", type=str)
    parser.add_argument("--total_eval_samples", type=int, default=30000)
    parser.add_argument("--model_id", type=str, default="runwayml/stable-diffusion-v1-5")
    parser.add_argument("--pred_eps", action="store_true")
    parser.add_argument("--skip_eval", action="store_true")
    parser.add_argument("--clip_score", action="store_true")
    parser.add_argument("--sd_teacher", action="store_true")
    parser.add_argument("--sde", action="store_true")
    parser.add_argument("--guidance_scale", type=float)
    parser.add_argument("--num_inference_steps", type=int)
    args = parser.parse_args()

    folder = args.folder
    evaluated_checkpoints = set() 
    overall_stats = {} 

    # initialize accelerator 
    accelerator_project_config = ProjectConfiguration(logging_dir=args.folder)
    accelerator = Accelerator(
        gradient_accumulation_steps=1,
        mixed_precision="no",
        log_with="wandb",
        project_config=accelerator_project_config
    )

    assert accelerator.num_processes == 1, "only support single gpu for now"

    logging.basicConfig(
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
        datefmt="%m/%d/%Y %H:%M:%S",
        level=logging.INFO,
    )
    logger.info(accelerator.state, main_process_only=False)

    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True 

    logger.info(f"folder to evaluate: {folder}", main_process_only=True)

    # initialize wandb 
    if accelerator.is_main_process:
        run = wandb.init(config=args, dir=args.folder, **{"mode": "online", "entity": args.wandb_entity, "project": args.wandb_project})
        wandb.run.name = args.wandb_name 
        logger.info(f"wandb run dir: {run.dir}", main_process_only=True)

    # initialize model (UNet Generator, Text Encoder and VAE Decoder)

    generator = None

    vae = AutoencoderKL.from_pretrained(
        args.model_id, 
        subfolder="vae"
    ).to(accelerator.device).float()

    text_encoder = CLIPTextModel.from_pretrained(
        args.model_id, subfolder="text_encoder"
    ).to(accelerator.device).float()
    
    if args.sd_teacher:
        teacher_pipeline = StableDiffusionPipeline.from_pretrained("runwayml/stable-diffusion-v1-5", torch_dtype=torch.float32)
        teacher_pipeline = teacher_pipeline.to(accelerator.device)

        if args.sde:
            teacher_pipeline.scheduler = DDPMScheduler.from_config(teacher_pipeline.scheduler.config)

        teacher_pipeline.set_progress_bar_config(disable=True)
        teacher_pipeline.safety_checker = None
    else:
        teacher_pipeline = None
    # initialize tokenizer and dataset

    tokenizer = CLIPTokenizer.from_pretrained(
        args.model_id, subfolder="tokenizer"
    )
    caption_dataset = SDTextDataset(args.anno_path, tokenizer, is_sdxl=False)

    caption_dataloader = torch.utils.data.DataLoader(
        caption_dataset, batch_size=args.eval_batch_size, 
        shuffle=False, drop_last=False, num_workers=8
    ) 
    caption_dataloader = accelerator.prepare(caption_dataloader)

    while True:
        new_checkpoints = sorted(glob.glob(os.path.join(folder, "*checkpoint_model_*")))
        new_checkpoints = set(new_checkpoints) - evaluated_checkpoints
        new_checkpoints = sorted(list(new_checkpoints))

        if len(new_checkpoints) == 0:
            continue 

        for checkpoint in new_checkpoints:
            logger.info(f"Evaluating {folder} {checkpoint}", main_process_only=True)
            model_index = int(checkpoint.replace("/", "").split("_")[-1]) 

            generator = create_generator(
                os.path.join(checkpoint, "pytorch_model.bin"), 
                base_model=generator
            )

            if generator is None:
                continue

            generator = generator.to(accelerator.device)

            # generate images 
            data_dict = sample(
                accelerator,
                generator,
                vae,
                text_encoder,
                caption_dataloader,
                args,
                model_index,
                teacher_pipeline=teacher_pipeline
            )
            torch.cuda.empty_cache()

            if accelerator.is_main_process:
                if not args.skip_eval:
                    print("start fid eval")
                    fid = evaluate_model(
                        args, accelerator.device, data_dict["all_images"]
                    )
                    stats = {
                        "fid": fid
                    }

                    if args.clip_score:
                        clip_score = compute_clip_score(
                            images=data_dict["all_images"],
                            captions=data_dict["all_captions"],
                            clip_model="ViT-G/14",
                            device=accelerator.device,
                            how_many=args.total_eval_samples
                        )
                        print(f"checkpoint {checkpoint} clip score {clip_score}")
                        stats['clip_score'] = float(clip_score)
                    
                    print(f"checkpoint {checkpoint} fid {fid}")
                    
                    overall_stats[checkpoint] = stats
                    wandb.log(
                        stats,
                        step=model_index
                    )
            accelerator.wait_for_everyone()
        evaluated_checkpoints.update(new_checkpoints)


if __name__ == "__main__":
    evaluate()    