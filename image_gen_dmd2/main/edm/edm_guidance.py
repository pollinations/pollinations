from main.edm.edm_network import get_edm_network
import torch.nn.functional as F
import torch.nn as nn
import dnnlib 
import pickle 
import torch
import copy 

def get_sigmas_karras(n, sigma_min, sigma_max, rho=7.0):
    # from https://github.com/crowsonkb/k-diffusion
    ramp = torch.linspace(0, 1, n)
    min_inv_rho = sigma_min ** (1 / rho)
    max_inv_rho = sigma_max ** (1 / rho)
    sigmas = (max_inv_rho + ramp * (min_inv_rho - max_inv_rho)) ** rho
    return sigmas

class EDMGuidance(nn.Module):
    def __init__(self, args, accelerator):
        super().__init__()
        self.args = args 
        self.accelerator = accelerator 

        with dnnlib.util.open_url(args.model_id) as f:
            temp_edm = pickle.load(f)['ema']

        # initialize the real unet 
        self.real_unet = get_edm_network(args)        
        self.real_unet.load_state_dict(temp_edm.state_dict(), strict=True)
        self.real_unet.requires_grad_(False)
        del self.real_unet.model.map_augment
        self.real_unet.model.map_augment = None

        # initialize the fake unet 
        self.fake_unet = copy.deepcopy(self.real_unet)            
        self.fake_unet.requires_grad_(True)

        # some training hyper-parameters 
        self.sigma_data = args.sigma_data
        self.sigma_max = args.sigma_max
        self.sigma_min = args.sigma_min
        self.rho = args.rho

        self.gan_classifier = args.gan_classifier
        self.diffusion_gan = args.diffusion_gan 
        self.diffusion_gan_max_timestep = args.diffusion_gan_max_timestep

        if self.gan_classifier:
            self.cls_pred_branch = nn.Sequential(
                nn.Conv2d(kernel_size=4, in_channels=768, out_channels=768, stride=2, padding=1), # 8x8 -> 4x4 
                nn.GroupNorm(num_groups=32, num_channels=768),
                nn.SiLU(),
                nn.Conv2d(kernel_size=4, in_channels=768, out_channels=768, stride=4, padding=0), # 4x4 -> 1x1
                nn.GroupNorm(num_groups=32, num_channels=768),
                nn.SiLU(),
                nn.Conv2d(kernel_size=1, in_channels=768, out_channels=1, stride=1, padding=0), # 1x1 -> 1x1
            ) 
            self.cls_pred_branch.requires_grad_(True)       

        self.num_train_timesteps = args.num_train_timesteps  
        # small sigma first, large sigma later
        karras_sigmas = torch.flip(
            get_sigmas_karras(self.num_train_timesteps, sigma_max=self.sigma_max, sigma_min=self.sigma_min, 
                rho=self.rho
            ),
            dims=[0]
        )    
        self.register_buffer("karras_sigmas", karras_sigmas)

        self.min_step = int(args.min_step_percent * self.num_train_timesteps)
        self.max_step = int(args.max_step_percent * self.num_train_timesteps)
        del temp_edm

    def compute_distribution_matching_loss(
        self, 
        latents,
        labels
    ):
        original_latents = latents 
        batch_size = latents.shape[0]

        with torch.no_grad():
            timesteps = torch.randint(
                self.min_step, 
                min(self.max_step+1, self.num_train_timesteps),
                [batch_size, 1, 1, 1], 
                device=latents.device,
                dtype=torch.long
            )

            noise = torch.randn_like(latents)

            timestep_sigma = self.karras_sigmas[timesteps]
            
            noisy_latents = latents + timestep_sigma.reshape(-1, 1, 1, 1) * noise

            pred_real_image = self.real_unet(noisy_latents, timestep_sigma, labels)

            pred_fake_image = self.fake_unet(
                noisy_latents, timestep_sigma, labels
            )

            p_real = (latents - pred_real_image) 
            p_fake = (latents - pred_fake_image) 

            weight_factor = torch.abs(p_real).mean(dim=[1, 2, 3], keepdim=True)    
            grad = (p_real - p_fake) / weight_factor
                
            grad = torch.nan_to_num(grad) 

        # this loss gives the grad as gradient through autodiff, following https://github.com/ashawkey/stable-dreamfusion 
        loss = 0.5 * F.mse_loss(original_latents, (original_latents-grad).detach(), reduction="mean")         

        loss_dict = {
            "loss_dm": loss 
        }

        dm_log_dict = {
            "dmtrain_noisy_latents": noisy_latents.detach(),
            "dmtrain_pred_real_image": pred_real_image.detach(),
            "dmtrain_pred_fake_image": pred_fake_image.detach(),
            "dmtrain_grad": grad.detach(),
            "dmtrain_gradient_norm": torch.norm(grad).item(),
            "dmtrain_timesteps": timesteps.detach(),
        }
        return loss_dict, dm_log_dict

    def compute_loss_fake(
        self,
        latents,
        labels,
    ):
        batch_size = latents.shape[0]

        latents = latents.detach() # no gradient to generator 
    
        noise = torch.randn_like(latents)

        timesteps = torch.randint(
            0,
            self.num_train_timesteps,
            [batch_size, 1, 1, 1], 
            device=latents.device,
            dtype=torch.long
        )
        timestep_sigma = self.karras_sigmas[timesteps]
        noisy_latents = latents + timestep_sigma.reshape(-1, 1, 1, 1) * noise

        fake_x0_pred = self.fake_unet(
            noisy_latents, timestep_sigma, labels
        )

        snrs = timestep_sigma**-2

        # weight_schedule karras 
        weights = snrs + 1.0 / self.sigma_data**2

        target = latents 

        loss_fake = torch.mean(
            weights * (fake_x0_pred - target)**2
        )

        loss_dict = {
            "loss_fake_mean": loss_fake
        }

        fake_log_dict = {
            "faketrain_latents": latents.detach(),
            "faketrain_noisy_latents": noisy_latents.detach(),
            "faketrain_x0_pred": fake_x0_pred.detach()
        }
        return loss_dict, fake_log_dict

    def compute_cls_logits(self, image, label):
        if self.diffusion_gan:
            timesteps = torch.randint(
                0, self.diffusion_gan_max_timestep, [image.shape[0]], device=image.device, dtype=torch.long
            )
            timestep_sigma = self.karras_sigmas[timesteps]
            image = image + timestep_sigma.reshape(-1, 1, 1, 1) * torch.randn_like(image)
        else:
            timesteps = torch.zeros([image.shape[0]], dtype=torch.long, device=image.device)
            timestep_sigma = self.karras_sigmas[timesteps]

        rep = self.fake_unet(
            image, timestep_sigma, label, return_bottleneck=True
        ).float() 

        logits = self.cls_pred_branch(rep).squeeze(dim=[2, 3])
        return logits

    def compute_generator_clean_cls_loss(self, fake_image, fake_labels):
        loss_dict = {} 

        pred_realism_on_fake_with_grad = self.compute_cls_logits(
            image=fake_image, 
            label=fake_labels
        )
        loss_dict["gen_cls_loss"] = F.softplus(-pred_realism_on_fake_with_grad).mean()
        return loss_dict 

    def compute_guidance_clean_cls_loss(self, real_image, fake_image, real_label, fake_label):
        pred_realism_on_real = self.compute_cls_logits(
            real_image.detach(), real_label, 
        )
        pred_realism_on_fake = self.compute_cls_logits(
            fake_image.detach(), fake_label, 
        )
        classification_loss = F.softplus(pred_realism_on_fake) + F.softplus(-pred_realism_on_real)

        log_dict = {
            "pred_realism_on_real": torch.sigmoid(pred_realism_on_real).squeeze(dim=1).detach(),
            "pred_realism_on_fake": torch.sigmoid(pred_realism_on_fake).squeeze(dim=1).detach()
        }

        loss_dict = {
            "guidance_cls_loss": classification_loss.mean()
        }
        return loss_dict, log_dict 

    def generator_forward(
        self,
        image,
        labels
    ):
        loss_dict = {} 
        log_dict = {}

        # image.requires_grad_(True)
        dm_dict, dm_log_dict = self.compute_distribution_matching_loss(image, labels)

        loss_dict.update(dm_dict)
        log_dict.update(dm_log_dict)

        if self.gan_classifier:
            clean_cls_loss_dict = self.compute_generator_clean_cls_loss(image, labels)
            loss_dict.update(clean_cls_loss_dict)

        # loss_dm = loss_dict["loss_dm"]
        # gen_cls_loss = loss_dict["gen_cls_loss"]

        # grad_dm = torch.autograd.grad(loss_dm, image, retain_graph=True)[0]
        # grad_cls = torch.autograd.grad(gen_cls_loss, image, retain_graph=True)[0]

        # print(f"dm {grad_dm.abs().mean()} cls {grad_cls.abs().mean()}")

        return loss_dict, log_dict 

    def guidance_forward(
        self,
        image,
        labels,
        real_train_dict=None
    ):
        fake_dict, fake_log_dict = self.compute_loss_fake(
            image, labels
        )

        loss_dict = fake_dict 
        log_dict = fake_log_dict

        if self.gan_classifier:
            clean_cls_loss_dict, clean_cls_log_dict = self.compute_guidance_clean_cls_loss(
                real_image=real_train_dict['real_image'], 
                fake_image=image,
                real_label=real_train_dict['real_label'],
                fake_label=labels
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
                image=generator_data_dict['image'],
                labels=generator_data_dict['label']
            )
        elif guidance_turn:
            loss_dict, log_dict = self.guidance_forward(
                image=guidance_data_dict['image'],
                labels=guidance_data_dict['label'],
                real_train_dict=guidance_data_dict['real_train_dict']
            ) 
        else:
            raise NotImplementedError 

        return loss_dict, log_dict 