"""
Helpers for resizing with multiple CPU cores
"""
import os
import numpy as np
import torch
from PIL import Image
import torch.nn.functional as F


def build_resizer(mode):
    if mode == "clean":
        return make_resizer("PIL", False, "bicubic", (299,299))
    # if using legacy tensorflow, do not manually resize outside the network
    elif mode == "legacy_tensorflow":
        return lambda x: x
    elif mode == "legacy_pytorch":
        return make_resizer("PyTorch", False, "bilinear", (299, 299))
    else:
        raise ValueError(f"Invalid mode {mode} specified")


"""
Construct a function that resizes a numpy image based on the
flags passed in.
"""
def make_resizer(library, quantize_after, filter, output_size):
    if library == "PIL" and quantize_after:
        name_to_filter = {
            "bicubic": Image.BICUBIC,
            "bilinear": Image.BILINEAR,
            "nearest": Image.NEAREST,
            "lanczos": Image.LANCZOS,
            "box": Image.BOX
        }
        def func(x):
            x = Image.fromarray(x)
            x = x.resize(output_size, resample=name_to_filter[filter])
            x = np.asarray(x).clip(0, 255).astype(np.uint8)
            return x
    elif library == "PIL" and not quantize_after:
        name_to_filter = {
            "bicubic": Image.BICUBIC,
            "bilinear": Image.BILINEAR,
            "nearest": Image.NEAREST,
            "lanczos": Image.LANCZOS,
            "box": Image.BOX
        }
        s1, s2 = output_size
        def resize_single_channel(x_np):
            img = Image.fromarray(x_np.astype(np.float32), mode='F')
            img = img.resize(output_size, resample=name_to_filter[filter])
            return np.asarray(img).clip(0, 255).reshape(s2, s1, 1)
        def func(x):
            x = [resize_single_channel(x[:, :, idx]) for idx in range(3)]
            x = np.concatenate(x, axis=2).astype(np.float32)
            return x
    elif library == "PyTorch":
        import warnings
        # ignore the numpy warnings
        warnings.filterwarnings("ignore")
        def func(x):
            x = torch.Tensor(x.transpose((2, 0, 1)))[None, ...]
            x = F.interpolate(x, size=output_size, mode=filter, align_corners=False)
            x = x[0, ...].cpu().data.numpy().transpose((1, 2, 0)).clip(0, 255)
            if quantize_after:
                x = x.astype(np.uint8)
            return x
    elif library == "TensorFlow":
        import warnings
        # ignore the numpy warnings
        warnings.filterwarnings("ignore")
        import tensorflow as tf
        def func(x):
            x = tf.constant(x)[tf.newaxis, ...]
            x = tf.image.resize(x, output_size, method=filter)
            x = x[0, ...].numpy().clip(0, 255)
            if quantize_after:
                x = x.astype(np.uint8)
            return x
    elif library == "OpenCV":
        import cv2
        name_to_filter = {
            "bilinear": cv2.INTER_LINEAR,
            "bicubic": cv2.INTER_CUBIC,
            "lanczos": cv2.INTER_LANCZOS4,
            "nearest": cv2.INTER_NEAREST,
            "area": cv2.INTER_AREA
        }
        def func(x):
            x = cv2.resize(x, output_size, interpolation=name_to_filter[filter])
            x = x.clip(0, 255)
            if quantize_after:
                x = x.astype(np.uint8)
            return x
    else:
        raise NotImplementedError('library [%s] is not include' % library)
    return func


class FolderResizer(torch.utils.data.Dataset):
    def __init__(self, files, outpath, fn_resize, output_ext=".png"):
        self.files = files
        self.outpath = outpath
        self.output_ext = output_ext
        self.fn_resize = fn_resize

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        path = str(self.files[i])
        img_np = np.asarray(Image.open(path))
        img_resize_np = self.fn_resize(img_np)
        # swap the output extension
        basename = os.path.basename(path).split(".")[0] + self.output_ext
        outname = os.path.join(self.outpath, basename)
        if self.output_ext == ".npy":
            np.save(outname, img_resize_np)
        elif self.output_ext == ".png":
            img_resized_pil = Image.fromarray(img_resize_np)
            img_resized_pil.save(outname)
        else:
            raise ValueError("invalid output extension")
        return 0
