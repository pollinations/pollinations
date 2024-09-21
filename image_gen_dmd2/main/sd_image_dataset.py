from main.utils import retrieve_row_from_lmdb, get_array_shape_from_lmdb
from torch.utils.data import Dataset
import numpy as np 
import torch
import lmdb 


class SDImageDatasetLMDB(Dataset):
    def __init__(self, dataset_path, tokenizer_one, is_sdxl=False, tokenizer_two=None):
        self.KEY_TO_TYPE = {
            'latents': np.float16
        }
        self.is_sdxl = is_sdxl # sdxl uses two tokenizers
        self.dataset_path = dataset_path
        self.tokenizer_one = tokenizer_one
        self.tokenizer_two = tokenizer_two

        self.env = lmdb.open(dataset_path, readonly=True, lock=False, readahead=False, meminit=False)
        self.latent_shape = get_array_shape_from_lmdb(self.env, "latents")

        self.length = self.latent_shape[0]

        print(f"Dataset length: {self.length}")
        
    def __len__(self):
        return self.length

    def __getitem__(self, idx):
        image = retrieve_row_from_lmdb(
            self.env, 
            "latents", self.KEY_TO_TYPE['latents'], self.latent_shape[1:], idx
        )
        image = torch.tensor(image, dtype=torch.float32)

        with self.env.begin() as txn:
            prompt = txn.get(f'prompts_{idx}_data'.encode()).decode()

        text_input_ids_one = self.tokenizer_one(
            [prompt],
            padding="max_length",
            max_length=self.tokenizer_one.model_max_length,
            truncation=True,
            return_tensors="pt",
        ).input_ids

        output_dict = { 
            'images': image,
            'text_input_ids_one': text_input_ids_one,
        }

        if self.is_sdxl:
            text_input_ids_two = self.tokenizer_two(
                [prompt],
                padding="max_length",
                max_length=self.tokenizer_two.model_max_length,
                truncation=True,
                return_tensors="pt",
            ).input_ids
            output_dict['text_input_ids_two'] = text_input_ids_two

        return output_dict