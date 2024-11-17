# pip install git+https://github.com/openai/CLIP.git
import pdb
from PIL import Image
import numpy as np
import torch
import torchvision.transforms as transforms
import clip
from cleanfid.fid import compute_fid


def img_preprocess_clip(img_np):
    x = Image.fromarray(img_np.astype(np.uint8)).convert("RGB")
    T = transforms.Compose([
            transforms.Resize(224, interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.CenterCrop(224),
    ])
    return np.asarray(T(x)).clip(0, 255).astype(np.uint8)


class CLIP_fx():
    def __init__(self, name="ViT-B/32", device="cuda"):
        self.model, _ = clip.load(name, device=device)
        self.model.eval()
        self.name = "clip_"+name.lower().replace("-","_").replace("/","_")
    
    def __call__(self, img_t):
        img_x = img_t/255.0
        T_norm = transforms.Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711))
        img_x = T_norm(img_x)
        assert torch.is_tensor(img_x)
        if len(img_x.shape)==3:
            img_x = img_x.unsqueeze(0)
        B,C,H,W = img_x.shape
        with torch.no_grad():
            z = self.model.encode_image(img_x)
        return z
