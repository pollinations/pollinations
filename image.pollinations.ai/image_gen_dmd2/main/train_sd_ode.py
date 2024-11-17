import matplotlib
matplotlib.use('Agg')
from main.utils import get_x0_from_noise, NoOpContext, cycle 
from diffusers import UNet2DConditionModel, DDIMScheduler
from main.sdxl.sdxl_ode_dataset import SDXLODEDatasetLMDB
from diffusers import AutoencoderKL, AutoencoderTiny
from accelerate.utils import ProjectConfiguration
from main.utils import prepare_images_for_saving
from diffusers.optimization import get_scheduler
from accelerate.logging import get_logger
from transformers import CLIPTextModel
from accelerate.utils import set_seed
from accelerate import Accelerator
from piq import LPIPS
import argparse 
import logging 
import shutil 
import wandb 
import torch 
import time 
import os

logger = get_logger(__name__, log_level="INFO")

class Trainer:
    def __init__(self, args):
        self.args = args

        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True 

        accelerator_project_config = ProjectConfiguration(logging_dir=args.log_path)
        accelerator = Accelerator(
            gradient_accumulation_steps=args.gradient_accumulation_steps,
            mixed_precision="no",
            log_with="wandb",
            project_config=accelerator_project_config,
            kwargs_handlers=None
        )
        set_seed(args.seed + accelerator.process_index)

        logging.basicConfig(
            format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
            datefmt="%m/%d/%Y %H:%M:%S",
            level=logging.INFO,
        )
        logger.info(accelerator.state, main_process_only=False)

        if accelerator.is_main_process:
            output_path = os.path.join(args.output_path, f"time_{int(time.time())}_seed{args.seed}")
            os.makedirs(output_path, exist_ok=False)
            self.output_path = output_path

            os.makedirs(args.log_path, exist_ok=True)

        self.feedforward_model = UNet2DConditionModel.from_pretrained(
            args.model_id,
            subfolder="unet"
        ).float()
        self.feedforward_model.requires_grad_(True)
        self.feedforward_model.enable_gradient_checkpointing()

        self.max_grad_norm = args.max_grad_norm

        if args.ckpt_only_path is not None:
            if accelerator.is_main_process:
                print(f"loading ckpt only from {args.ckpt_only_path}")
            generator_path = os.path.join(args.ckpt_only_path, "pytorch_model.bin")
            print(self.feedforward_model.load_state_dict(torch.load(generator_path, map_location="cpu"), strict=True))

        self.sdxl = args.sdxl 
        
        # for SDv1.5, we need to compute text embedding online 
        if not self.sdxl:
            self.text_encoder = CLIPTextModel.from_pretrained(
                args.model_id, subfolder="text_encoder"
            ).to(accelerator.device)
            self.text_encoder.requires_grad_(False)

        self.optimizer_generator = torch.optim.AdamW(
            [param for param in self.feedforward_model.parameters() if param.requires_grad], 
            lr=args.generator_lr, 
            betas=(0.9, 0.999),  # pytorch's default 
            weight_decay=0.01  # pytorch's default 
        )

        self.scheduler_generator = get_scheduler(
            "constant_with_warmup",
            optimizer=self.optimizer_generator,
            num_warmup_steps=args.warmup_step,
            num_training_steps=args.train_iters 
        )

        (
            self.feedforward_model, self.optimizer_generator, self.scheduler_generator
        ) = accelerator.prepare(
            self.feedforward_model, self.optimizer_generator, self.scheduler_generator
        ) 

        self.accelerator = accelerator
        self.step = 0 
        self.train_iters = args.train_iters
        self.resolution = args.resolution 
        self.log_iters = args.log_iters
        self.wandb_iters = args.wandb_iters
        self.grid_size = args.grid_size
        self.no_save = args.no_save
        self.max_checkpoint = args.max_checkpoint
        self.conditioning_timestep = args.conditioning_timestep

        if args.checkpoint_path is not None:
            self.load(args.checkpoint_path)

        if self.accelerator.is_main_process:
            run = wandb.init(config=args, dir=args.log_path, **{"mode": "online", "entity": args.wandb_entity, "project": args.wandb_project})
            wandb.run.log_code(".")
            wandb.run.name = args.wandb_name
            print(f"run dir: {run.dir}")
            self.wandb_folder = run.dir
            os.makedirs(self.wandb_folder, exist_ok=True)

        if self.sdxl:
            ode_dataset = SDXLODEDatasetLMDB(
                args.ode_pair_path, num_ode_pairs=args.num_ode_pairs,
                return_first=True 
            )
        else:
            raise NotImplementedError()
            # ode_dataset = SDODEDatasetLMDB(
            #     args.ode_pair_path, num_ode_pairs=args.num_ode_pairs
            # )

        ode_dataloader = torch.utils.data.DataLoader(
            ode_dataset, num_workers=args.num_workers, 
            batch_size=args.ode_batch_size, shuffle=True, 
            drop_last=True
        )
        ode_dataloader = accelerator.prepare(ode_dataloader)
        self.ode_dataloader = cycle(ode_dataloader)

        self.scheduler = DDIMScheduler.from_pretrained(
            args.model_id,
            subfolder="scheduler"
        )
        self.alphas_cumprod = self.scheduler.alphas_cumprod.to(accelerator.device)

        self.denoising = args.denoising 
        self.num_denoising_step = args.num_denoising_step
        self.num_train_timesteps = args.num_train_timesteps
        self.denoising_step_list = torch.tensor(
            list(range(self.num_train_timesteps-1, 0, -(self.num_train_timesteps//self.num_denoising_step))),
            dtype=torch.long 
        )

        self.add_time_ids = self.build_condition_input(args.resolution, accelerator)
        self.num_train_timesteps = args.num_train_timesteps  

        if accelerator.is_local_main_process:
            self.lpips_loss_func = LPIPS(replace_pooling=True, reduction="none")
        accelerator.wait_for_everyone()
        self.lpips_loss_func = LPIPS(replace_pooling=True, reduction="none").to(accelerator.device)

        if args.tiny_vae:
            if self.sdxl:
                self.vae = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float32).float().to(accelerator.device)
            else:
                self.vae = AutoencoderTiny.from_pretrained("madebyollin/taesd", torch_dtype=torch.float32).float().to(accelerator.device)
        else:
            raise NotImplementedError() # too slow 
            # self.vae = AutoencoderKL.from_pretrained(
            #     args.model_id, 
            #     subfolder="vae"
            # ).float().to(accelerator.device)

        self.vae.requires_grad_(False)

        self.network_context_manager = torch.autocast(device_type="cuda", dtype=torch.bfloat16) if args.use_fp16 else NoOpContext()

    def decode_image(self, latents):
        latents = 1 / self.vae.config.scaling_factor * latents
        image = self.vae.decode(latents).sample.float()
        return image 

    def build_condition_input(self, resolution, accelerator):
        original_size = (resolution, resolution)
        target_size = (resolution, resolution)
        crop_top_left = (0, 0)

        add_time_ids = list(original_size + crop_top_left + target_size)
        add_time_ids = torch.tensor([add_time_ids], device=accelerator.device, dtype=torch.float32)
        return add_time_ids

    def load(self, checkpoint_path):
        self.step = int(checkpoint_path.replace("/", "").split("_")[-1])
        print(self.accelerator.load_state(checkpoint_path, strict=False))
        self.accelerator.print(f"Loaded checkpoint from {checkpoint_path}")

    def save(self):
        # NOTE: we save the checkpoints to two places 
        # 1. output_path: for the latest one, this is assumed to be a permanent storage
        # 2. cache_dir: for all checkpoints, this is assumed to be a temporary storage
        # training states 
        output_path = os.path.join(self.output_path, f"checkpoint_model_{self.step:06d}")
        self.accelerator.save_state(output_path) 

        # remove previous checkpoints 
        for folder in os.listdir(self.output_path):
            if folder.startswith("checkpoint_model") and folder != f"checkpoint_model_{self.step:06d}":
                shutil.rmtree(os.path.join(self.output_path, folder))

        # copy checkpoints to cache 
        # overwrite the cache
        if os.path.exists(os.path.join(self.args.cache_dir, f"checkpoint_model_{self.step:06d}")):
            shutil.rmtree(os.path.join(self.args.cache_dir, f"checkpoint_model_{self.step:06d}"))
        
        self.accelerator.save_state(os.path.join(self.args.cache_dir, f"checkpoint_model_{self.step:06d}")) 

        # delete cache if the number of checkpoints exceed a certain amount 
        checkpoints = sorted(
            [folder for folder in os.listdir(self.args.cache_dir) if folder.startswith("checkpoint_model")]
        )

        if len(checkpoints) > self.max_checkpoint:
            for folder in checkpoints[:-self.max_checkpoint]:
                shutil.rmtree(os.path.join(self.args.cache_dir, folder))


    def train_one_step(self):
        self.feedforward_model.train()

        accelerator = self.accelerator

        ode_dict = next(self.ode_dataloader)

        ode_noises = ode_dict['latents']
        ode_images = ode_dict['images']

        if self.denoising:
            assert ode_noises.dim() == 5 
            indices = torch.randint(
                0, self.num_denoising_step, (ode_images.shape[0],), device=accelerator.device, dtype=torch.long
            )
            ode_timesteps = self.denoising_step_list.to(accelerator.device)[indices]
            ode_noises = ode_noises[torch.arange(len(ode_noises)).to(accelerator.device), indices] # select one from the trajectory 
        else:
            ode_timesteps = torch.ones(ode_noises.shape[0], device=accelerator.device, dtype=torch.long) * self.conditioning_timestep

        if self.sdxl:
            ode_embedding = ode_dict['embed_dict']
            ode_add_time_ads = self.add_time_ids.repeat(ode_images.shape[0], 1)
            ode_pooled_prompt_embed = ode_embedding["pooled_prompt_embed"]
            ode_text_embedding = ode_embedding["prompt_embed"]

            ode_unet_added_conditions = {
                "time_ids": ode_add_time_ads,
                "text_embeds": ode_pooled_prompt_embed
            }
        else:
            ode_text_embedding = self.text_encoder(ode_dict['text_embedding'])[0]
            ode_unet_added_conditions = None 

        with self.network_context_manager:
            student_output = self.feedforward_model(
                ode_noises, ode_timesteps.long(), ode_text_embedding, added_cond_kwargs=ode_unet_added_conditions
            ).sample

        # assume epsilon prediction 
        student_x0_pred = get_x0_from_noise(
            ode_noises.double(), student_output.double(), self.alphas_cumprod.double(), ode_timesteps
        ).float()

        with torch.no_grad():
            ode_gt_image = self.decode_image(ode_images).detach()

        ode_pred_image = self.decode_image(student_x0_pred.float())

        with self.network_context_manager:
            loss = torch.mean(
                self.lpips_loss_func(
                    ode_pred_image * 0.5 + 0.5,
                    ode_gt_image * 0.5 + 0.5
                ).float()
            )

        self.optimizer_generator.zero_grad()
        self.accelerator.backward(loss)
        self.optimizer_generator.step()
        self.scheduler_generator.step()

        if accelerator.is_main_process:
            wandb.log(
                {
                    "loss": loss.item()
                },
                step=self.step
            )

            if self.step % self.wandb_iters == 0:
                ode_output_grid = prepare_images_for_saving(ode_pred_image, resolution=self.resolution, grid_size=self.grid_size)
                ode_gt_grid = prepare_images_for_saving(ode_gt_image, resolution=self.resolution, grid_size=self.grid_size)
                wandb.log(
                    {
                        "ode_gt_image": wandb.Image(ode_gt_grid),
                        "ode_pred_image": wandb.Image(ode_output_grid)
                    },
                    step=self.step
                )

        self.accelerator.wait_for_everyone()

    def train(self):
        for index in range(self.step, self.train_iters):                
            self.train_one_step()
            if (not self.no_save)  and self.step % self.log_iters == 0:
                if self.accelerator.is_main_process:
                    self.save()

            self.accelerator.wait_for_everyone()
            self.step += 1

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_id", type=str, default="runwayml/stable-diffusion-v1-5")
    parser.add_argument("--output_path", type=str, default="/mnt/localssd/test_stable_diffusion_coco")
    parser.add_argument("--log_path", type=str, default="/mnt/localssd/log_stable_diffusion_coco")
    parser.add_argument("--train_iters", type=int, default=1000000)
    parser.add_argument("--log_iters", type=int, default=100)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--resolution", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--checkpoint_path", type=str, default=None)
    parser.add_argument("--local_rank", type=int, default=-1, help="For distributed training: local_rank")
    parser.add_argument("--wandb_entity", type=str, default="score-matching-gan")
    parser.add_argument("--wandb_project", type=str, default="score-matching-gan")
    parser.add_argument("--wandb_iters", type=int, default=100)
    parser.add_argument("--wandb_name", type=str, required=True)
    parser.add_argument("--max_grad_norm", type=float, default=10.0, help="max grad norm for network")
    parser.add_argument("--warmup_step", type=int, default=500, help="warmup step for network")
    parser.add_argument("--gradient_accumulation_steps", type=int, default=1)
    parser.add_argument("--use_fp16", action="store_true")
    parser.add_argument("--num_train_timesteps", type=int, default=1000)
    parser.add_argument("--ode_pair_path", type=str)
    parser.add_argument("--ckpt_only_path", type=str, default=None, help="checkpoint (no optimizer state) only path")
    parser.add_argument("--grid_size", type=int, default=4)
    parser.add_argument("--ode_batch_size", type=int, default=8)
    parser.add_argument("--num_ode_pairs", type=int, default=0)
    parser.add_argument("--no_save", action="store_true", help="don't save ckpt for debugging only")
    parser.add_argument("--cache_dir", type=str, default="/mnt/localssd/cache")
    parser.add_argument("--num_workers", type=int, default=12)
    parser.add_argument("--max_checkpoint", type=int, default=150)
    parser.add_argument("--generator_lr", type=float)
    parser.add_argument("--sdxl", action="store_true")
    parser.add_argument("--conditioning_timestep", type=int, default=999)
    parser.add_argument("--tiny_vae", action="store_true")
    parser.add_argument("--denoising", action="store_true")
    parser.add_argument("--num_denoising_step", type=int, default=1)

    args = parser.parse_args()
    env_local_rank = int(os.environ.get("LOCAL_RANK", -1))
    if env_local_rank != -1 and env_local_rank != args.local_rank:
        args.local_rank = env_local_rank

    assert args.gradient_accumulation_steps == 1, "grad accumulation not supported yet"

    return args 

if __name__ == "__main__":
    args = parse_args()

    trainer = Trainer(args)

    trainer.train()