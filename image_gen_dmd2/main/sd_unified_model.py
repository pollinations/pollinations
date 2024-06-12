# A single unified model that wraps both the generator and discriminator
from diffusers import UNet2DConditionModel, AutoencoderKL, AutoencoderTiny
from main.utils import get_x0_from_noise, NoOpContext
from main.sdxl.sdxl_text_encoder import SDXLTextEncoder
from main.sd_guidance import SDGuidance
from transformers import CLIPTextModel
from accelerate.utils import broadcast
from torch import nn
import torch 

class SDUniModel(nn.Module):
    def __init__(self, args, accelerator):
        super().__init__()

        self.args = args
        self.accelerator = accelerator
        self.guidance_model = SDGuidance(args, accelerator) 
        self.num_train_timesteps = self.guidance_model.num_train_timesteps
        self.num_visuals = args.grid_size * args.grid_size
        self.conditioning_timestep = args.conditioning_timestep 
        self.use_fp16 = args.use_fp16 
        self.gradient_checkpointing = args.gradient_checkpointing 
        self.backward_simulation = args.backward_simulation 

        self.cls_on_clean_image = args.cls_on_clean_image 
        self.denoising = args.denoising
        self.denoising_timestep = args.denoising_timestep 
        self.noise_scheduler = self.guidance_model.scheduler
        self.num_denoising_step = args.num_denoising_step 
        self.denoising_step_list = torch.tensor(
            list(range(self.denoising_timestep-1, 0, -(self.denoising_timestep//self.num_denoising_step))),
            dtype=torch.long,
            device=accelerator.device 
        )
        self.timestep_interval = self.denoising_timestep//self.num_denoising_step

        if args.initialie_generator:
            self.feedforward_model = UNet2DConditionModel.from_pretrained(
                args.model_id,
                subfolder="unet"
            ).float()

            self.feedforward_model.requires_grad_(True)

            if self.gradient_checkpointing:
                self.feedforward_model.enable_gradient_checkpointing()
        else:
            raise NotImplementedError()

        self.sdxl = args.sdxl 

        if self.sdxl:
            self.text_encoder = SDXLTextEncoder(args, accelerator).to(accelerator.device)
            self.text_encoder.requires_grad_(False)
            self.add_time_ids = self.build_condition_input(args.resolution, accelerator)
        else:
            self.text_encoder = CLIPTextModel.from_pretrained(
                args.model_id, subfolder="text_encoder"
            ).to(accelerator.device)
            self.text_encoder.requires_grad_(False)

        self.alphas_cumprod = self.guidance_model.alphas_cumprod.to(accelerator.device)
        
        self.not_sdxl_vae = not (self.sdxl and (not args.tiny_vae))

        if args.tiny_vae:
            if 'stable-diffusion-xl' in args.model_id:
                self.vae = AutoencoderTiny.from_pretrained(
                    "madebyollin/taesdxl", torch_dtype=torch.float32).float().to(accelerator.device)
            else:
                raise NotImplementedError()
        else:
            self.vae = AutoencoderKL.from_pretrained(
                args.model_id, 
                subfolder="vae"
            ).float().to(accelerator.device)
        self.vae.requires_grad_(False)

        if self.use_fp16 and self.not_sdxl_vae:
            # "SDXL's origianl VAE doesn't work with half precision"
            self.vae.to(torch.float16)

        self.network_context_manager = torch.autocast(device_type="cuda", dtype=torch.bfloat16) if self.use_fp16 else NoOpContext()

    def build_condition_input(self, resolution, accelerator):
        original_size = (resolution, resolution)
        target_size = (resolution, resolution)
        crop_top_left = (0, 0)

        add_time_ids = list(original_size + crop_top_left + target_size)
        add_time_ids = torch.tensor([add_time_ids], device=accelerator.device, dtype=torch.float32)
        return add_time_ids

    def decode_image(self, latents):
        latents = 1 / self.vae.config.scaling_factor * latents
        image = self.vae.decode(latents).sample.float()
        return image 

    @torch.no_grad()
    def sample_backward(self, noisy_image, real_text_embedding, real_pooled_text_embedding):
        batch_size =  noisy_image.shape[0]
        device = noisy_image.device
        add_time_ids = self.add_time_ids.repeat(batch_size, 1)
        unet_added_conditions = {
            "time_ids": add_time_ids,
            "text_embeds": real_pooled_text_embedding
        }

        # we choose a random step and share it across all gpu
        selected_step = torch.randint(low=0, high=self.num_denoising_step, size=(1,), device=device, dtype=torch.long)
        selected_step = broadcast(selected_step, from_process=0)

        # set a default value in case we don't enter the loop 
        # it will be overwriten in the pure_noise_mask check later 
        generated_image = noisy_image  

        for constant in self.denoising_step_list[:selected_step]:
            current_timesteps = torch.ones(batch_size, device=device, dtype=torch.long)  *constant

            generated_noise = self.feedforward_model(
                noisy_image, current_timesteps, real_text_embedding, added_cond_kwargs=unet_added_conditions
            ).sample

            generated_image = get_x0_from_noise(
                noisy_image, generated_noise.double(), self.alphas_cumprod.double(), current_timesteps
            ).float()

            next_timestep = current_timesteps - self.timestep_interval 
            noisy_image = self.noise_scheduler.add_noise(
                generated_image, torch.randn_like(generated_image), next_timestep
            ).to(noisy_image.dtype)  

        return_timesteps = self.denoising_step_list[selected_step] * torch.ones(batch_size, device=device, dtype=torch.long)
        return generated_image, return_timesteps

    @torch.no_grad()
    def prepare_denoising_data(self, denoising_dict, real_train_dict, noise):
        assert self.sdxl, "Denoising is only supported for SDXL"

        indices = torch.randint(
            0, self.num_denoising_step, (noise.shape[0],), device=noise.device, dtype=torch.long
        )
        timesteps = self.denoising_step_list.to(noise.device)[indices]

        text_embedding, pooled_text_embedding = self.text_encoder(denoising_dict)

        if real_train_dict is not None:
            real_text_embedding, real_pooled_text_embedding = self.text_encoder(real_train_dict)

            real_train_dict['text_embedding'] = real_text_embedding

            real_unet_added_conditions = {
                "time_ids": self.add_time_ids.repeat(len(real_text_embedding), 1),
                "text_embeds": real_pooled_text_embedding
            }
            real_train_dict['unet_added_conditions'] = real_unet_added_conditions

        if self.backward_simulation:
            # we overwrite the denoising timesteps 
            # note: we also use uncorrelated noise 
            clean_images, timesteps = self.sample_backward(torch.randn_like(noise), text_embedding, pooled_text_embedding) 
        else:
            clean_images = denoising_dict['images'].to(noise.device)

        noisy_image = self.noise_scheduler.add_noise(
            clean_images, noise, timesteps
        )

        # set last timestep to pure noise
        pure_noise_mask = (timesteps == (self.num_train_timesteps-1))
        noisy_image[pure_noise_mask] = noise[pure_noise_mask]

        return timesteps, text_embedding, pooled_text_embedding, real_train_dict, noisy_image

    @torch.no_grad()
    def prepare_pure_generation_data(self, text_embedding, real_train_dict, noise):

        # actually it is a tokenized prompt 
        text_embedding_output = self.text_encoder(text_embedding) 

        text_embedding = text_embedding_output[0].float()
        pooled_text_embedding = text_embedding_output[1].float()

        if real_train_dict is not None:
            if self.sdxl:
                real_text_embedding, real_pooled_text_embedding = self.text_encoder(real_train_dict)
                real_train_dict['text_embedding'] = real_text_embedding
                real_unet_added_conditions = {
                    "time_ids": self.add_time_ids.repeat(len(real_train_dict['text_embedding'] ), 1),
                    "text_embeds": real_pooled_text_embedding
                }
                real_train_dict['unet_added_conditions'] = real_unet_added_conditions
            else:
                real_text_embedding_output = self.text_encoder(real_train_dict["text_input_ids_one"].squeeze(1)) 
                real_train_dict["text_embedding"] = real_text_embedding_output[0].float()
                real_train_dict['unet_added_conditions'] = None 

        noisy_image = noise 
        return text_embedding, pooled_text_embedding, real_train_dict, noisy_image

    def forward(self, noise, text_embedding, uncond_embedding, 
        visual=False, denoising_dict=None,
        real_train_dict=None,
        compute_generator_gradient=True,
        generator_turn=False,
        guidance_turn=False,
        guidance_data_dict=None    
    ):
        assert (generator_turn and not guidance_turn) or (guidance_turn and not generator_turn) 

        if generator_turn:
            if self.denoising:
                # we ignore the text_embedding, uncond_embedding passed to the model 
                timesteps, text_embedding, pooled_text_embedding, real_train_dict, noisy_image = self.prepare_denoising_data(
                    denoising_dict, real_train_dict, noise
                )
            else:
                timesteps = torch.ones(noise.shape[0], device=noise.device, dtype=torch.long) * self.conditioning_timestep
                text_embedding, pooled_text_embedding, real_train_dict, noisy_image = self.prepare_pure_generation_data(
                    text_embedding, real_train_dict, noise
                )

            if self.sdxl:
                add_time_ids = self.add_time_ids.repeat(noise.shape[0], 1)
                unet_added_conditions = {
                    "time_ids": add_time_ids,
                    "text_embeds": pooled_text_embedding
                }

                uncond_unet_added_conditions = {
                    "time_ids": add_time_ids,
                    "text_embeds": torch.zeros_like(pooled_text_embedding)
                }
                uncond_embedding = torch.zeros_like(text_embedding)
            else:
                unet_added_conditions = None
                uncond_unet_added_conditions = None

            if compute_generator_gradient:
                with self.network_context_manager:
                    generated_noise = self.feedforward_model(
                        noisy_image, timesteps.long(), 
                        text_embedding, added_cond_kwargs=unet_added_conditions
                    ).sample
            else:
                if self.gradient_checkpointing:
                    self.accelerator.unwrap_model(self.feedforward_model).disable_gradient_checkpointing()

                with torch.no_grad():
                    generated_noise = self.feedforward_model(
                        noisy_image, timesteps.long(), 
                        text_embedding, added_cond_kwargs=unet_added_conditions
                    ).sample

                if self.gradient_checkpointing:
                    self.accelerator.unwrap_model(self.feedforward_model).enable_gradient_checkpointing()

            # this assume that all teacher models use epsilon prediction (which is true for SDv1.5 and SDXL)
            generated_image = get_x0_from_noise(
                noisy_image.double(), 
                generated_noise.double(), self.alphas_cumprod.double(), timesteps
            ).float()

            if compute_generator_gradient:
                generator_data_dict = {
                    "image": generated_image,
                    "text_embedding": text_embedding,
                    "pooled_text_embedding": pooled_text_embedding,
                    "uncond_embedding": uncond_embedding,
                    "real_train_dict": real_train_dict,
                    "unet_added_conditions": unet_added_conditions,
                    "uncond_unet_added_conditions": uncond_unet_added_conditions
                } 

                # avoid any side effects of gradient accumulation
                self.guidance_model.requires_grad_(False)
                loss_dict, log_dict = self.guidance_model(
                    generator_turn=True,
                    guidance_turn=False,
                    generator_data_dict=generator_data_dict
                )
                self.guidance_model.requires_grad_(True)
            else:
                loss_dict = {}
                log_dict = {} 

            if visual:
                decode_key = [
                    "dmtrain_pred_real_image", "dmtrain_pred_fake_image"
                ]

                with torch.no_grad():
                    if compute_generator_gradient and not self.args.gan_alone:
                        for key in decode_key:
                            if self.use_fp16 and self.not_sdxl_vae:
                                log_dict[key+"_decoded"] = self.decode_image(log_dict[key].detach()[:self.num_visuals].half())
                            else:
                                log_dict[key+"_decoded"] = self.decode_image(log_dict[key].detach()[:self.num_visuals]) 
                    
                    if self.use_fp16 and self.not_sdxl_vae:
                        log_dict["generated_image"] = self.decode_image(generated_image[:self.num_visuals].detach().half())
                    else:
                        log_dict["generated_image"] = self.decode_image(generated_image[:self.num_visuals].detach())

                    if self.denoising:
                        if self.use_fp16 and self.not_sdxl_vae:
                            log_dict["original_clean_image"] = self.decode_image(denoising_dict['images'].detach()[:self.num_visuals].half())
                        else:
                            log_dict["original_clean_image"] = self.decode_image(denoising_dict['images'].detach()[:self.num_visuals])

            log_dict["guidance_data_dict"] = {
                "image": generated_image.detach(),
                "text_embedding": text_embedding.detach(),
                "pooled_text_embedding": pooled_text_embedding.detach(),
                "uncond_embedding": uncond_embedding.detach(),
                "real_train_dict": real_train_dict,
                "unet_added_conditions": unet_added_conditions,
                "uncond_unet_added_conditions": uncond_unet_added_conditions
            }

            log_dict['denoising_timestep'] = timesteps

        elif guidance_turn:
            assert guidance_data_dict is not None 
            loss_dict, log_dict = self.guidance_model(
                generator_turn=False,
                guidance_turn=True,
                guidance_data_dict=guidance_data_dict
            )    
        return loss_dict, log_dict




