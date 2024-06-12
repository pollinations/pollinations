# A single unified model that wraps both the generator and discriminator
from main.edm.edm_guidance import EDMGuidance
from torch import nn
import torch 
import copy

class EDMUniModel(nn.Module):
    def __init__(self, args, accelerator):
        super().__init__()

        self.guidance_model = EDMGuidance(args, accelerator) 

        self.guidance_min_step = self.guidance_model.min_step
        self.guidance_max_step = self.guidance_model.max_step

        if args.initialie_generator:
            self.feedforward_model = copy.deepcopy(self.guidance_model.fake_unet)
        else:
            raise NotImplementedError("Only support initializing generator from guidance model.")

        self.feedforward_model.requires_grad_(True)

        self.accelerator = accelerator 
        self.num_train_timesteps = args.num_train_timesteps

    def forward(self, scaled_noisy_image,
        timestep_sigma, labels,  
        real_train_dict=None,
        compute_generator_gradient=False,
        generator_turn=False,
        guidance_turn=False,
        guidance_data_dict=None
    ):        
        assert (generator_turn and not guidance_turn) or (guidance_turn and not generator_turn) 

        if generator_turn:
            if not compute_generator_gradient:
                with torch.no_grad():
                    generated_image = self.feedforward_model(scaled_noisy_image, timestep_sigma, labels)
            else:            
                generated_image = self.feedforward_model(scaled_noisy_image, timestep_sigma, labels)

            if compute_generator_gradient:
                generator_data_dict = {
                    "image": generated_image,
                    "label": labels,
                    "real_train_dict": real_train_dict
                }

                # as we don't need to compute gradient for guidance model
                # we disable gradient to avoid side effects (in GAN Loss computation)
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

            log_dict['generated_image'] = generated_image.detach() 

            log_dict['guidance_data_dict'] = {
                "image": generated_image.detach(),
                "label": labels.detach(),
                "real_train_dict": real_train_dict
            }

        elif guidance_turn:
            assert guidance_data_dict is not None 
            loss_dict, log_dict = self.guidance_model(
                generator_turn=False,
                guidance_turn=True,
                guidance_data_dict=guidance_data_dict
            )

        return loss_dict, log_dict




