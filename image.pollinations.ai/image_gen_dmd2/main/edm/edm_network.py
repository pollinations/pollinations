from third_party.edm.training.networks import EDMPrecond

def get_imagenet_edm_config():
    return dict(
        augment_dim=0,
        model_channels=192,
        channel_mult=[1, 2, 3, 4],
        channel_mult_emb=4,
        num_blocks=3,
        attn_resolutions=[32,16,8],
        dropout=0.0,
        label_dropout=0
    )

def get_edm_network(args):
    if args.dataset_name == "imagenet":
        unet = EDMPrecond(
            img_resolution=args.resolution,
            img_channels=3,
            label_dim=args.label_dim,
            use_fp16=args.use_fp16,
            sigma_min=0,
            sigma_max=float("inf"),
            sigma_data=args.sigma_data,
            model_type="DhariwalUNet",
            **get_imagenet_edm_config()
        )
    else:
        raise NotImplementedError

    return unet 