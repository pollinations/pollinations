from main.utils import retrieve_row_from_lmdb, get_array_shape_from_lmdb
from torch.utils.data import Dataset
import numpy as np 
import torch
import lmdb 


class SDXLODEDatasetLMDB(Dataset):
    def __init__(self, ode_pair_path, num_ode_pairs=0, return_first=True):
        self.KEY_TO_TYPE = {
            'latents': np.float16,
            'images': np.float16,
            'prompt_embeds_list': np.float16,
            'pooled_prompt_embeds': np.float16
        }

        self.ode_pair_path = ode_pair_path

        self.env = lmdb.open(ode_pair_path, readonly=True, lock=False, readahead=False, meminit=False)
        self.image_shape = get_array_shape_from_lmdb(self.env, "images")
        self.latent_shape = get_array_shape_from_lmdb(self.env, "latents")
        self.prompt_embeds_list_shape = get_array_shape_from_lmdb(self.env, "prompt_embeds_list")
        self.pooled_prompt_embeds_shape = get_array_shape_from_lmdb(self.env, "pooled_prompt_embeds")

        self.length = self.image_shape[0]

        if num_ode_pairs > 0:
            self.length = min(num_ode_pairs, self.length)

        print(f"Dataset length: {self.length}")

        # if we store the whole trajectory, by default we only output the starting point (initial noise)
        self.return_first = return_first 
        
    def __len__(self):
        return self.length

    def __getitem__(self, idx):
        image = retrieve_row_from_lmdb(
            self.env, 
            "images", self.KEY_TO_TYPE['images'], self.image_shape[1:], idx
        )

        noise = retrieve_row_from_lmdb(
            self.env, 
            "latents", self.KEY_TO_TYPE['latents'], self.latent_shape[1:], idx
        )

        if noise.ndim == 5 and self.return_first:
            # select the starting point (initial noise)
            noise = noise[:, 0]

        prompt_embed = retrieve_row_from_lmdb(
            self.env, 
            "prompt_embeds_list", self.KEY_TO_TYPE['prompt_embeds_list'], self.prompt_embeds_list_shape[1:], idx
        )

        pooled_prompt_embed = retrieve_row_from_lmdb(
            self.env, 
            "pooled_prompt_embeds", self.KEY_TO_TYPE['pooled_prompt_embeds'], self.pooled_prompt_embeds_shape[1:], idx
        )

        embed_dict = {
            "prompt_embed": torch.tensor(prompt_embed, dtype=torch.float32),
            "pooled_prompt_embed": torch.tensor(pooled_prompt_embed, dtype=torch.float32)
        }

        image = torch.tensor(image, dtype=torch.float32)
        noise = torch.tensor(noise, dtype=torch.float32)

        output_dict = { 
            'images': image,
            'latents': noise,
            'embed_dict': embed_dict,
        }
        return output_dict