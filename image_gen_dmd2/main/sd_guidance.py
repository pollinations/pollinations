from main.utils import get_x0_from_noise, DummyNetwork, NoOpContext
from diffusers import UNet2DConditionModel, DDIMScheduler
from main.sd_unet_forward import classify_forward
import torch.nn.functional as F
import torch.nn as nn
import torch
import types 

def predict_noise(unet, noisy_latents, text_embeddings, uncond_embedding, timesteps, 
    guidance_scale=1.0, unet_added_conditions=None, uncond_unet_added_conditions=None
):
    CFG_GUIDANCE = guidance_scale > 1

    if CFG_GUIDANCE:
        model_input = torch.cat([noisy_latents] * 2) 
        embeddings = torch.cat([uncond_embedding, text_embeddings]) 
        timesteps = torch.cat([timesteps] * 2) 

        if unet_added_conditions is not None:
            assert uncond_unet_added_conditions is not None 
            condition_input = {}
            for key in unet_added_conditions.keys():
                condition_input[key] = torch.cat(
                    [uncond_unet_added_conditions[key], unet_added_conditions[key]] # should be uncond, cond, check the order  
                )
        else:
            condition_input = None 

        noise_pred = unet(model_input, timesteps, embeddings, added_cond_kwargs=condition_input).sample
        noise_pred_uncond, noise_pred_text = noise_pred.chunk(2)
        noise_pred = noise_pred_uncond + guidance_scale * (noise_pred_text - noise_pred_uncond) 
    else:
        model_input = noisy_latents 
        embeddings = text_embeddings
        timesteps = timesteps    
        noise_pred = unet(model_input, timesteps, embeddings, added_cond_kwargs=unet_added_conditions).sample

    return noise_pred  

class SDGuidance(nn.Module):
    def __init__(self, args, accelerator):
        super().__init__()
        self.args = args 

        self.real_unet = UNet2DConditionModel.from_pretrained(
            args.model_id,
            subfolder="unet"
        ).float()

        self.real_unet.requires_grad_(False)
        self.gan_alone = args.gan_alone 

        self.fake_unet = UNet2DConditionModel.from_pretrained(
            args.model_id,
            subfolder="unet"
        ).float()

        self.fake_unet.requires_grad_(True)

        # somehow FSDP requires at least one network with dense parameters (models from diffuser are lazy initialized so their parameters are empty in fsdp mode)
        self.dummy_network = DummyNetwork() 
        self.dummy_network.requires_grad_(False)

        # we move real unet to half precision
        # as we don't backpropagate through it
        if args.use_fp16:
            self.real_unet = self.real_unet.to(torch.bfloat16)

        if self.gan_alone:
            del self.real_unet

        self.scheduler = DDIMScheduler.from_pretrained(
            args.model_id,
            subfolder="scheduler"
        )
        
        alphas_cumprod = self.scheduler.alphas_cumprod
        self.register_buffer(
            "alphas_cumprod",
            alphas_cumprod
        )

        self.num_train_timesteps = args.num_train_timesteps 
        self.min_step = int(args.min_step_percent * self.scheduler.num_train_timesteps)
        self.max_step = int(args.max_step_percent * self.scheduler.num_train_timesteps)
        
        self.real_guidance_scale = args.real_guidance_scale 
        self.fake_guidance_scale = args.fake_guidance_scale

        assert self.fake_guidance_scale == 1, "no guidance for fake"

        self.use_fp16 = args.use_fp16

        self.cls_on_clean_image = args.cls_on_clean_image 
        self.gen_cls_loss = args.gen_cls_loss 

        self.accelerator = accelerator

        if self.cls_on_clean_image:
            self.fake_unet.forward = types.MethodType(
                classify_forward, self.fake_unet
            )

            if accelerator.is_local_main_process:
                print("Note that we randomly initialized a bunch of parameters. FSDP mode 4 hybrid_shard will have non-synced parameters across nodes which would lead to training problems. The current solution is to save the checkpoint 0 and resume")

            if args.sdxl:
                self.cls_pred_branch = nn.Sequential(
                    nn.Conv2d(kernel_size=4, in_channels=1280, out_channels=1280, stride=2, padding=1), # 32x32 -> 16x16 
                    nn.GroupNorm(num_groups=32, num_channels=1280),
                    nn.SiLU(),
                    nn.Conv2d(kernel_size=4, in_channels=1280, out_channels=1280, stride=2, padding=1), # 16x16 -> 8x8 
                    nn.GroupNorm(num_groups=32, num_channels=1280),
                    nn.SiLU(),
                    nn.Conv2d(kernel_size=4, in_channels=1280, out_channels=1280, stride=2, padding=1), # 8x8 -> 4x4
                    nn.GroupNorm(num_groups=32, num_channels=1280),
                    nn.SiLU(),
                    nn.Conv2d(kernel_size=4, in_channels=1280, out_channels=1280, stride=4, padding=0), # 4x4 -> 1x1
                    nn.GroupNorm(num_groups=32, num_channels=1280),
                    nn.SiLU(),
                    nn.Conv2d(kernel_size=1, in_channels=1280, out_channels=1, stride=1, padding=0), # 1x1 -> 1x1
                )
            else:
                # SDv1.5 
                self.cls_pred_branch = nn.Sequential(
                    nn.Conv2d(kernel_size=4, in_channels=1280, out_channels=1280, stride=2, padding=1), # 8x8 -> 4x4 
                    nn.GroupNorm(num_groups=32, num_channels=1280),
                    nn.SiLU(),
                    nn.Conv2d(kernel_size=4, in_channels=1280, out_channels=1280, stride=4, padding=0), # 4x4 -> 1x1
                    nn.GroupNorm(num_groups=32, num_channels=1280),
                    nn.SiLU(),
                    nn.Conv2d(kernel_size=1, in_channels=1280, out_channels=1, stride=1, padding=0), # 1x1 -> 1x1
                )

            self.cls_pred_branch.requires_grad_(True)

        self.sdxl = args.sdxl 
        self.gradient_checkpointing = args.gradient_checkpointing 

        self.diffusion_gan = args.diffusion_gan 
        self.diffusion_gan_max_timestep = args.diffusion_gan_max_timestep

        self.network_context_manager = torch.autocast(device_type="cuda", dtype=torch.bfloat16) if self.use_fp16 else NoOpContext()

    def compute_cls_logits(self, image, text_embedding, unet_added_conditions):
        # we are operating on the VAE latent space, no further normalization needed for now 
        if self.diffusion_gan:
            timesteps = torch.randint(
                0, self.diffusion_gan_max_timestep, [image.shape[0]], device=image.device, dtype=torch.long
            )
            image = self.scheduler.add_noise(image, torch.randn_like(image), timesteps)
        else:
            timesteps = torch.zeros([image.shape[0]], dtype=torch.long, device=image.device)

        with self.network_context_manager:
            rep = self.fake_unet.forward(
                image, timesteps, text_embedding,
                added_cond_kwargs=unet_added_conditions,
                classify_mode=True
            )

        # we only use the bottleneck layer 
        rep = rep[-1].float()
        logits = self.cls_pred_branch(rep).squeeze(dim=[2, 3])
        return logits


    def compute_distribution_matching_loss(
        self, 
        latents,
        text_embedding,
        uncond_embedding,
        unet_added_conditions,
        uncond_unet_added_conditions
    ):
        original_latents = latents 
        batch_size = latents.shape[0]
        with torch.no_grad():
            timesteps = torch.randint(
                self.min_step, 
                min(self.max_step+1, self.num_train_timesteps),
                [batch_size], 
                device=latents.device,
                dtype=torch.long
            )

            noise = torch.randn_like(latents)

            noisy_latents = self.scheduler.add_noise(latents, noise, timesteps)

            # run at full precision as autocast and no_grad doesn't work well together 
            pred_fake_noise = predict_noise(
                self.fake_unet, noisy_latents, text_embedding, uncond_embedding, 
                timesteps, guidance_scale=self.fake_guidance_scale,
                unet_added_conditions=unet_added_conditions,
                uncond_unet_added_conditions=uncond_unet_added_conditions
            )  

            pred_fake_image = get_x0_from_noise(
                noisy_latents.double(), pred_fake_noise.double(), self.alphas_cumprod.double(), timesteps
            )

            if self.use_fp16:
                if self.sdxl:
                    bf16_unet_added_conditions = {} 
                    bf16_uncond_unet_added_conditions = {} 

                    for k,v in unet_added_conditions.items():
                        bf16_unet_added_conditions[k] = v.to(torch.bfloat16)
                    for k,v in uncond_unet_added_conditions.items():
                        bf16_uncond_unet_added_conditions[k] = v.to(torch.bfloat16)
                else:
                    bf16_unet_added_conditions = unet_added_conditions 
                    bf16_uncond_unet_added_conditions = uncond_unet_added_conditions

                pred_real_noise = predict_noise(
                    self.real_unet, noisy_latents.to(torch.bfloat16), text_embedding.to(torch.bfloat16), 
                    uncond_embedding.to(torch.bfloat16), 
                    timesteps, guidance_scale=self.real_guidance_scale,
                    unet_added_conditions=bf16_unet_added_conditions,
                    uncond_unet_added_conditions=bf16_uncond_unet_added_conditions
                ) 
            else:
                pred_real_noise = predict_noise(
                    self.real_unet, noisy_latents, text_embedding, uncond_embedding, 
                    timesteps, guidance_scale=self.real_guidance_scale,
                    unet_added_conditions=unet_added_conditions,
                    uncond_unet_added_conditions=uncond_unet_added_conditions
                )

            pred_real_image = get_x0_from_noise(
                noisy_latents.double(), pred_real_noise.double(), self.alphas_cumprod.double(), timesteps
            )     

            p_real = (latents - pred_real_image)
            p_fake = (latents - pred_fake_image)

            grad = (p_real - p_fake) / torch.abs(p_real).mean(dim=[1, 2, 3], keepdim=True) 
            grad = torch.nan_to_num(grad)

        loss = 0.5 * F.mse_loss(original_latents.float(), (original_latents-grad).detach().float(), reduction="mean")         

        loss_dict = {
            "loss_dm": loss 
        }

        dm_log_dict = {
            "dmtrain_noisy_latents": noisy_latents.detach().float(),
            "dmtrain_pred_real_image": pred_real_image.detach().float(),
            "dmtrain_pred_fake_image": pred_fake_image.detach().float(),
            "dmtrain_grad": grad.detach().float(),
            "dmtrain_gradient_norm": torch.norm(grad).item()
        }

        return loss_dict, dm_log_dict

    def compute_loss_fake(
        self,
        latents,
        text_embedding,
        uncond_embedding,
        unet_added_conditions=None,
        uncond_unet_added_conditions=None
    ):
        if self.gradient_checkpointing:
            self.fake_unet.enable_gradient_checkpointing()
        latents = latents.detach()
        batch_size = latents.shape[0]
        noise = torch.randn_like(latents)

        timesteps = torch.randint(
            0,
            self.num_train_timesteps,
            [batch_size], 
            device=latents.device,
            dtype=torch.long
        )
        noisy_latents = self.scheduler.add_noise(latents, noise, timesteps)

        with self.network_context_manager:
            fake_noise_pred = predict_noise(
                self.fake_unet, noisy_latents, text_embedding, uncond_embedding,
                timesteps, guidance_scale=1, # no guidance for training dfake 
                unet_added_conditions=unet_added_conditions,
                uncond_unet_added_conditions=uncond_unet_added_conditions
            )

        fake_noise_pred = fake_noise_pred.float()

        fake_x0_pred = get_x0_from_noise(
            noisy_latents.double(), fake_noise_pred.double(), self.alphas_cumprod.double(), timesteps
        )

        # epsilon prediction loss 
        loss_fake = torch.mean(
            (fake_noise_pred.float() - noise.float())**2
        )

        loss_dict = {
            "loss_fake_mean": loss_fake,
        }

        fake_log_dict = {
            "faketrain_latents": latents.detach().float(),
            "faketrain_noisy_latents": noisy_latents.detach().float(),
            "faketrain_x0_pred": fake_x0_pred.detach().float()
        }
        if self.gradient_checkpointing:
            self.fake_unet.disable_gradient_checkpointing()
        return loss_dict, fake_log_dict

    def compute_generator_clean_cls_loss(self, 
        fake_image, text_embedding, 
        unet_added_conditions=None
    ):
        loss_dict = {} 

        pred_realism_on_fake_with_grad = self.compute_cls_logits(
            fake_image, 
            text_embedding=text_embedding, 
            unet_added_conditions=unet_added_conditions
        )
        loss_dict["gen_cls_loss"] = F.softplus(-pred_realism_on_fake_with_grad).mean()
        return loss_dict 

    def generator_forward(
        self,
        image,
        text_embedding,
        uncond_embedding,
        unet_added_conditions=None,
        uncond_unet_added_conditions=None
    ):
        loss_dict = {}
        log_dict = {}

        # image.requires_grad_(True)
        if not self.gan_alone:
            dm_dict, dm_log_dict = self.compute_distribution_matching_loss(
                image, text_embedding, uncond_embedding, 
                unet_added_conditions, uncond_unet_added_conditions
            )

            loss_dict.update(dm_dict)
            log_dict.update(dm_log_dict)

        if self.cls_on_clean_image:
            clean_cls_loss_dict = self.compute_generator_clean_cls_loss(
                image, text_embedding, unet_added_conditions
            )
            loss_dict.update(clean_cls_loss_dict)

        # cls_loss_grad = torch.autograd.grad(
        #     loss_dict["gen_cls_loss"], image, retain_graph=True
        # )[0]

        # dm_loss_grad = torch.autograd.grad(
        #     loss_dict["loss_dm"], image, retain_graph=True
        # )[0]

        # if self.accelerator.is_main_process:
        #     print("cls_loss_grad", cls_loss_grad.abs().mean().item())
        #     print("dm_loss_grad", dm_loss_grad.abs().mean().item())

        # import pdb; pdb.set_trace()

        return loss_dict, log_dict 

    def compute_guidance_clean_cls_loss(
            self, real_image, fake_image, 
            real_text_embedding, fake_text_embedding,
            real_unet_added_conditions=None, 
            fake_unet_added_conditions=None
        ):
        pred_realism_on_real = self.compute_cls_logits(
            real_image.detach(), 
            text_embedding=real_text_embedding,
            unet_added_conditions=real_unet_added_conditions
        )
        pred_realism_on_fake = self.compute_cls_logits(
            fake_image.detach(), 
            text_embedding=fake_text_embedding,
            unet_added_conditions=fake_unet_added_conditions
        )

        log_dict = {
            "pred_realism_on_real": torch.sigmoid(pred_realism_on_real).squeeze(dim=1).detach(),
            "pred_realism_on_fake": torch.sigmoid(pred_realism_on_fake).squeeze(dim=1).detach()
        }

        classification_loss = F.softplus(pred_realism_on_fake).mean() + F.softplus(-pred_realism_on_real).mean()
        loss_dict = {
            "guidance_cls_loss": classification_loss
        }
        return loss_dict, log_dict 

    def guidance_forward(
        self,
        image,
        text_embedding,
        uncond_embedding,
        real_train_dict=None,
        unet_added_conditions=None,
        uncond_unet_added_conditions=None
    ):
        fake_dict, fake_log_dict = self.compute_loss_fake(
            image, text_embedding, uncond_embedding,
            unet_added_conditions=unet_added_conditions,
            uncond_unet_added_conditions=uncond_unet_added_conditions
        )

        loss_dict = fake_dict 
        log_dict = fake_log_dict

        if self.cls_on_clean_image:
            clean_cls_loss_dict, clean_cls_log_dict = self.compute_guidance_clean_cls_loss(
                real_image=real_train_dict['images'], 
                fake_image=image,
                real_text_embedding=real_train_dict['text_embedding'],
                fake_text_embedding=text_embedding, 
                real_unet_added_conditions=real_train_dict['unet_added_conditions'],
                fake_unet_added_conditions=unet_added_conditions
            )
            loss_dict.update(clean_cls_loss_dict)
            log_dict.update(clean_cls_log_dict)

        return loss_dict, log_dict 

    def forward(
        self,
        generator_turn=False,
        guidance_turn=False,
        generator_data_dict=None, 
        guidance_data_dict=None
    ):    
        if generator_turn:
            loss_dict, log_dict = self.generator_forward(
                image=generator_data_dict["image"],
                text_embedding=generator_data_dict["text_embedding"],
                uncond_embedding=generator_data_dict["uncond_embedding"],
                unet_added_conditions=generator_data_dict["unet_added_conditions"],
                uncond_unet_added_conditions=generator_data_dict["uncond_unet_added_conditions"]
            )   
        elif guidance_turn:
            loss_dict, log_dict = self.guidance_forward(
                image=guidance_data_dict["image"],
                text_embedding=guidance_data_dict["text_embedding"],
                uncond_embedding=guidance_data_dict["uncond_embedding"],
                real_train_dict=guidance_data_dict["real_train_dict"],
                unet_added_conditions=guidance_data_dict["unet_added_conditions"],
                uncond_unet_added_conditions=guidance_data_dict["uncond_unet_added_conditions"]
            ) 
        else:
            raise NotImplementedError

        return loss_dict, log_dict 