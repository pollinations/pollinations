from main.utils import retrieve_row_from_lmdb, get_array_shape_from_lmdb
from torch.utils.data import Dataset
from tqdm import tqdm 
import numpy as np 
import torch
import lmdb 
import glob 
import os



class LMDBDataset(Dataset):
    # LMDB version of an ImageDataset. It is suitable for large datasets.
    def __init__(self, dataset_path):
        # for supporting new datasets, please adapt the data type according to the one used in "main/data/create_imagenet_lmdb.py"
        self.KEY_TO_TYPE = {
            'labels': np.int64,
            'images': np.uint8,
        }

        self.dataset_path = dataset_path
        
        self.env = lmdb.open(dataset_path, readonly=True, lock=False, readahead=False, meminit=False)

        self.image_shape = get_array_shape_from_lmdb(self.env, 'images')
        self.label_shape = get_array_shape_from_lmdb(self.env, 'labels')

    def __len__(self):
        return self.image_shape[0]

    def __getitem__(self, idx):
        # final ground truth rgb image 
        image = retrieve_row_from_lmdb(
            self.env, 
            "images", self.KEY_TO_TYPE['images'], self.image_shape[1:], idx
        )
        image = torch.tensor(image, dtype=torch.float32)

        label =  retrieve_row_from_lmdb(
            self.env, 
            "labels", self.KEY_TO_TYPE['labels'], self.label_shape[1:], idx
        )

        label = torch.tensor(label, dtype=torch.long)
        image = (image / 255.0)


        output_dict = { 
            'images': image,
            'class_labels': label
        }
        
        return output_dict
