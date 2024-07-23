## Getting Started with DMD2 on ImageNet-64x64

We trained ImageNet using mixed-precision in BF16 format, adapting the EDM's code to accommodate BF16 training (see [LINK](../../third_party/edm/training/networks.py)). We noticed that the training diverges if we use FP16. FP16 might work with some fancy loss scaling; help is greatly appreciated. 

### Model Zoo

| Config Name | FID | Link | Iters | Hours |
| ----------- | --- | ---- | ----- | ----- |
| [imagenet_gan_classifier_genloss3e-3_diffusion1000_lr2e-6_scratch](./imagenet_gan_classifier_genloss3e-3_diffusion1000_lr2e-6_scratch.sh) | 1.51 | [link](https://huggingface.co/tianweiy/DMD2/tree/main/model/imagenet/imagenet_gan_classifier_genloss3e-3_diffusion1000_lr2e-6_scratch_fid1.51_checkpoint_model_193500/) | 200k | 53 |
| [imagenet_lr2e-6_scratch](./imagenet_lr2e-6_scratch.sh) | 2.61 | [link](https://huggingface.co/tianweiy/DMD2/tree/main/model/imagenet/imagenet_lr2e-6_scratch_fid2.61_checkpoint_model_405500/) | 410k | 70 |
| [imagenet_gan_classifier_genloss3e-3_diffusion1000_lr5e-7_resume*](./imagenet_gan_classifier_genloss3e-3_diffusion1000_lr5e-7_resume.sh) | 1.28 | [link](https://huggingface.co/tianweiy/DMD2/tree/main/model/imagenet/imagenet_gan_classifier_genloss3e-3_diffusion1000_lr5e-7_resume_fid1.28_checkpoint_model_548000/) | 140K | 70 |

*The final model was resumed from the best checkpoint of the **imagenet_lr2e-6_scratch** run and trained for an additional 140,000 iterations. 

For inference with our models, you only need to download the pytorch_model.bin file from the provided link. For fine-tuning, you will need to download the entire folder.
You can use the following script for that:

```bash
export CHECKPOINT_NAME="imagenet/imagenet_gan_classifier_genloss3e-3_diffusion1000_lr2e-6_scratch_fid1.51_checkpoint_model_193500"  # note that the imagenet/ is necessary
export OUTPUT_PATH="path/to/your/output/folder"

bash scripts/download_hf_checkpoint.sh $CHECKPOINT_NAME $OUTPUT_PATH
```

### Download Base Diffusion Models and Training Data 

```.bash
export CHECKPOINT_PATH="" # change this to your own checkpoint folder 
export WANDB_ENTITY="" # change this to your own wandb entity
export WANDB_PROJECT="" # change this to your own wandb project

mkdir $CHECKPOINT_PATH

bash scripts/download_imagenet.sh $CHECKPOINT_PATH
```

You can also add these few export to the bashrc file so that you don't need to run them every time you open a new terminal.

### Sample Training/Testing Commands
```.bash
# start a training with 7 gpu
bash experiments/imagenet/imagenet_gan_classifier_genloss3e-3_diffusion1000_lr2e-6_scratch.sh  $CHECKPOINT_PATH $WANDB_ENTITY $WANDB_PROJECT

# on the same node, start a testing process that continually reads from the checkpoint folder and evaluate the FID 
# Change TIMESTAMP_TBD to the real one
python main/test_folder.py \
    --folder $CHECKPOINT_PATH/imagenet_gan_classifier_genloss3e-3_diffusion1000_lr2e-6_scratch/TIMESTAMP_TBD \
    --wandb_name test_imagenet_gan_classifier_genloss3e-3_diffusion1000_lr2e-6_scratch \
    --wandb_entity $WANDB_ENTITY \
    --wandb_project $WANDB_PROJECT \
    --resolution 64 --label_dim 1000  \
    --ref_path $CHECKPOINT_PATH/imagenet_fid_refs_edm.npz \
    --detector_url $CHECKPOINT_PATH/inception-2015-12-05.pkl 
```

Please refer to [train_edm.py](../../main/edm/train_edm.py) for various training options. Notably, if the `--delete_ckpts` flag is set to `True`, all checkpoints except the latest one will be deleted during training. Additionally, you can use the `--cache_dir` flag to specify a location with larger storage capacity. The number of checkpoints stored in `cache_dir` is controlled by the `max_checkpoint` argument.
