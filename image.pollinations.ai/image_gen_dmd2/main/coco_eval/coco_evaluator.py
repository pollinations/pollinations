# Part of this code is modified from GigaGAN: https://github.com/mingukkang/GigaGAN
# The MIT License (MIT)
from torchvision.transforms import InterpolationMode
import torchvision.transforms as transforms
from torch.utils.data import DataLoader
from torch.utils.data import Dataset
from PIL import Image
import numpy as np 
import shutil
import torch 
import time 
import os 

resizer_collection = {"nearest": InterpolationMode.NEAREST,
                      "box": InterpolationMode.BOX,
                      "bilinear": InterpolationMode.BILINEAR,
                      "hamming": InterpolationMode.HAMMING,
                      "bicubic": InterpolationMode.BICUBIC,
                      "lanczos": InterpolationMode.LANCZOS}


class CenterCropLongEdge(object):
    """
    this code is borrowed from https://github.com/ajbrock/BigGAN-PyTorch
    MIT License
    Copyright (c) 2019 Andy Brock
    """ 
    def __call__(self, img):
        return transforms.functional.center_crop(img, min(img.size))

    def __repr__(self):
        return self.__class__.__name__


@torch.no_grad()
def compute_fid(fake_arr, gt_dir, device,
    resize_size=None, feature_extractor="inception", 
    patch_fid=False):
    from main.coco_eval.cleanfid import fid
    center_crop_trsf = CenterCropLongEdge()
    def resize_and_center_crop(image_np):
        image_pil = Image.fromarray(image_np) 
        if patch_fid:
            # if image_pil.size[0] != 1024 and image_pil.size[1] != 1024:
            #     image_pil = image_pil.resize([1024, 1024])

            # directly crop to the 299 x 299 patch expected by the inception network
            if image_pil.size[0] >= 299 and image_pil.size[1] >= 299:
                image_pil = transforms.functional.center_crop(image_pil, 299)
            # else:
            #     raise ValueError("Image is too small to crop to 299 x 299")
        else:
            image_pil = center_crop_trsf(image_pil)

            if resize_size is not None:
                image_pil = image_pil.resize((resize_size, resize_size),
                                            Image.LANCZOS)
        return np.array(image_pil)

    if feature_extractor == "inception":
        model_name = "inception_v3"
    elif feature_extractor == "clip":
        model_name = "clip_vit_b_32"
    else:
        raise ValueError(
            "Unrecognized feature extractor [%s]" % feature_extractor)
    # fid, fake_feats, real_feats = fid.compute_fid(
    fid = fid.compute_fid(
        None,
        gt_dir,
        model_name=model_name,
        custom_image_tranform=resize_and_center_crop,
        use_dataparallel=False,
        device=device,
        pred_arr=fake_arr
    )
    # return fid, fake_feats, real_feats 
    return fid 

def evaluate_model(args, device, all_images, patch_fid=False):
    fid = compute_fid(
        fake_arr=all_images,
        gt_dir=args.ref_dir,
        device=device,
        resize_size=args.eval_res,
        feature_extractor="inception",
        patch_fid=patch_fid
    )

    return fid 


def tensor2pil(image: torch.Tensor):
    ''' output image : tensor to PIL
    '''
    if isinstance(image, list) or image.ndim == 4:
        return [tensor2pil(im) for im in image]

    assert image.ndim == 3
    output_image = Image.fromarray(((image + 1.0) * 127.5).clamp(
        0.0, 255.0).to(torch.uint8).permute(1, 2, 0).detach().cpu().numpy())
    return output_image

class CLIPScoreDataset(Dataset):
    def __init__(self, images, captions, transform, preprocessor) -> None:
        super().__init__()
        self.images = images 
        self.captions = captions 
        self.transform = transform
        self.preprocessor = preprocessor

    def __len__(self):
        return len(self.images)
    
    def __getitem__(self, index):
        image = self.images[index]
        image_pil = self.transform(image)
        image_pil = self.preprocessor(image_pil)
        caption = self.captions[index]
        return image_pil, caption 


@torch.no_grad()
def compute_clip_score(
    images, captions, clip_model="ViT-B/32", device="cuda", how_many=30000):
    print("Computing CLIP score")
    import clip as openai_clip 
    if clip_model == "ViT-B/32":
        clip, clip_preprocessor = openai_clip.load("ViT-B/32", device=device)
        clip = clip.eval()
    elif clip_model == "ViT-G/14":
        import open_clip
        clip, _, clip_preprocessor = open_clip.create_model_and_transforms("ViT-g-14", pretrained="laion2b_s12b_b42k")
        clip = clip.to(device)
        clip = clip.eval()
        clip = clip.float()
    else:
        raise NotImplementedError

    def resize_and_center_crop(image_np, resize_size=256):
        image_pil = Image.fromarray(image_np) 
        image_pil = CenterCropLongEdge()(image_pil)

        if resize_size is not None:
            image_pil = image_pil.resize((resize_size, resize_size),
                                         Image.LANCZOS)
        return image_pil

    def simple_collate(batch):
        images, captions = [], []
        for img, cap in batch:
            images.append(img)
            captions.append(cap)
        return images, captions


    dataset = CLIPScoreDataset(
        images, captions, transform=resize_and_center_crop, 
        preprocessor=clip_preprocessor
    )
    dataloader = DataLoader(
        dataset, batch_size=64, 
        shuffle=False, num_workers=8,
        collate_fn=simple_collate
        
    )

    cos_sims = []
    count = 0
    # for imgs, txts in zip(images, captions):
    for index, (imgs_pil, txts) in enumerate(dataloader):
        # imgs_pil = [resize_and_center_crop(imgs)]
        # txts = [txts]
        # imgs_pil = [clip_preprocessor(img) for img in imgs]
        imgs = torch.stack(imgs_pil, dim=0).to(device)
        tokens = openai_clip.tokenize(txts, truncate=True).to(device)
        # Prepending text prompts with "A photo depicts "
        # https://arxiv.org/abs/2104.08718
        prepend_text = "A photo depicts "
        prepend_text_token = openai_clip.tokenize(prepend_text)[:, 1:4].to(device)
        prepend_text_tokens = prepend_text_token.expand(tokens.shape[0], -1)
        
        start_tokens = tokens[:, :1]
        new_text_tokens = torch.cat(
            [start_tokens, prepend_text_tokens, tokens[:, 1:]], dim=1)[:, :77]
        last_cols = new_text_tokens[:, 77 - 1:77]
        last_cols[last_cols > 0] = 49407  # eot token
        new_text_tokens = torch.cat([new_text_tokens[:, :76], last_cols], dim=1)
        
        img_embs = clip.encode_image(imgs)
        text_embs = clip.encode_text(new_text_tokens)

        similarities = torch.nn.functional.cosine_similarity(img_embs, text_embs, dim=1)
        cos_sims.append(similarities)
        count += similarities.shape[0]
        if count >= how_many:
            break
    
    clip_score = torch.cat(cos_sims, dim=0)[:how_many].mean()
    clip_score = clip_score.detach().cpu().numpy()
    return clip_score

@torch.no_grad()
def compute_image_reward(
    images, captions, device
):
    import ImageReward as RM
    from tqdm import tqdm 
    model = RM.load("ImageReward-v1.0", device=device)
    rewards = [] 
    for image, prompt in tqdm(zip(images, captions)):
        reward = model.score(prompt, Image.fromarray(image))
        rewards.append(reward)
    return np.mean(np.array(rewards))

@torch.no_grad()
def compute_diversity_score(
    lpips_loss_func, images, device
):
    # resize all image to 512 and convert to tensor 
    images = [Image.fromarray(image) for image in images]
    images = [image.resize((512, 512), Image.LANCZOS) for image in images]
    images = np.stack([np.array(image) for image in images], axis=0)
    images = torch.tensor(images).to(device).float() / 255.0
    images = images.permute(0, 3, 1, 2) 

    num_images = images.shape[0] 
    loss_list = []

    for i in range(num_images):
        for j in range(i+1, num_images):
            image1 = images[i].unsqueeze(0)
            image2 = images[j].unsqueeze(0)
            loss = lpips_loss_func(image1, image2)

            loss_list.append(loss.item())
    return np.mean(loss_list)
