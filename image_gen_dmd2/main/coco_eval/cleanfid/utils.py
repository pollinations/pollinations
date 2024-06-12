import numpy as np
import torch
import torchvision
from PIL import Image
from cleanfid.resize import build_resizer
import zipfile


class ResizeDataset(torch.utils.data.Dataset):
    """
    A placeholder Dataset that enables parallelizing the resize operation
    using multiple CPU cores

    files: list of all files in the folder
    fn_resize: function that takes an np_array as input [0,255]
    """

    def __init__(self, files, mode, size=(299, 299), fdir=None):
        self.files = files
        self.fdir = fdir
        self.transforms = torchvision.transforms.ToTensor()
        self.size = size
        self.fn_resize = build_resizer(mode)
        self.custom_image_tranform = lambda x: x
        self._zipfile = None

    def _get_zipfile(self):
        assert self.fdir is not None and '.zip' in self.fdir
        if self._zipfile is None:
            self._zipfile = zipfile.ZipFile(self.fdir)
        return self._zipfile

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        path = str(self.files[i])
        if self.fdir is not None and '.zip' in self.fdir:
            with self._get_zipfile().open(path, 'r') as f:
                img_np = np.array(Image.open(f).convert('RGB'))
        elif ".npy" in path:
            img_np = np.load(path)
        else:
            img_pil = Image.open(path).convert('RGB')
            img_np = np.array(img_pil)

        # apply a custom image transform before resizing the image to 299x299
        img_np = self.custom_image_tranform(img_np)
        # fn_resize expects a np array and returns a np array
        img_resized = self.fn_resize(img_np)

        # ToTensor() converts to [0,1] only if input in uint8
        if img_resized.dtype == "uint8":
            img_t = self.transforms(np.array(img_resized))*255
        elif img_resized.dtype == "float32":
            img_t = self.transforms(img_resized)

        return img_t


EXTENSIONS = {'bmp', 'jpg', 'jpeg', 'pgm', 'png', 'ppm',
              'tif', 'tiff', 'webp', 'npy', 'JPEG', 'JPG', 'PNG'}

class ResizeArrayDataset(torch.utils.data.Dataset):
    """
    A placeholder Dataset that enables parallelizing the resize operation
    using multiple CPU cores

    files: list of all files in the folder
    fn_resize: function that takes an np_array as input [0,255]
    """

    def __init__(self, array, mode, size=(299, 299)):
        self.array = array
        self.transforms = torchvision.transforms.ToTensor()
        self.size = size
        self.fn_resize = build_resizer(mode)
        self.custom_image_tranform = lambda x: x

    def __len__(self):
        return len(self.array)

    def __getitem__(self, i):
        img_np = self.array[i]

        # apply a custom image transform before resizing the image to 299x299
        img_np = self.custom_image_tranform(img_np)
        # fn_resize expects a np array and returns a np array
        img_resized = self.fn_resize(img_np)

        # ToTensor() converts to [0,1] only if input in uint8
        if img_resized.dtype == "uint8":
            img_t = self.transforms(np.array(img_resized))*255
        elif img_resized.dtype == "float32":
            img_t = self.transforms(img_resized)

        return img_t
