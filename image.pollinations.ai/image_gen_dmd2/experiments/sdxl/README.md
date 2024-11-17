## Getting Started with DMD2 on SDXL

### Model Zoo

| Config Name | FID | Link | Iters | Hours |
| ----------- | --- | ---- | ----- | ----- |
| [sdxl_cond999_8node_lr5e-7_denoising4step_diffusion1000_gan5e-3_guidance8_noinit_noode_backsim_scratch](./sdxl_cond999_8node_lr5e-7_denoising4step_diffusion1000_gan5e-3_guidance8_noinit_noode_backsim_scratch.sh) | 19.32 | [link](https://huggingface.co/tianweiy/DMD2/tree/main/model/sdxl/sdxl_cond999_8node_lr5e-7_denoising4step_diffusion1000_gan5e-3_guidance8_noinit_noode_backsim_scratch_checkpoint_model_019000) | 19k | 57 |
| [sdxl_cond399_8node_lr5e-7_1step_diffusion1000_gan5e-3_guidance8_noinit_noode](./laion6.25_sd_baseline_8node_guidance1.75_lr5e-7_seed10_dfake10_diffusion1000_gan1e-3_resume.sh) | 19.01 | [link](https://huggingface.co/tianweiy/DMD2/tree/main/model/sdxl/sdxl_cond399_8node_lr5e-7_1step_diffusion1000_gan5e-3_guidance8_noinit_noode_checkpoint_model_024000) | TBD | TBD |

1-step model training needs some special handling, we will support it soon. 

For inference with our models, you only need to download the pytorch_model.bin file from the provided link. For fine-tuning, you will need to download the entire folder.
You can use the following script for that:

```bash 
export CHECKPOINT_NAME="sdxl/sdxl_cond999_8node_lr5e-7_denoising4step_diffusion1000_gan5e-3_guidance8_noinit_noode_backsim_scratch_checkpoint_model_019000"  # note that the sdxl/ is necessary
export OUTPUT_PATH="path/to/your/output/folder"

bash scripts/download_hf_checkpoint.sh $CHECKPOINT_NAME $OUTPUT_PATH
```


### Download Base Diffusion Models and Training Data
```bash
export CHECKPOINT_PATH="" # change this to your own checkpoint folder 
export WANDB_ENTITY="" # change this to your own wandb entity
export WANDB_PROJECT="" # change this to your own wandb project
export MASTER_IP=""  # change this to your own master ip

# Not sure why but we found the following line necessary to work with the accelerate package in our system. 
# Change YOUR_MASTER_IP/YOUR_MASTER_NODE_NAME to the correct value 
echo "YOUR_MASTER_IP 	YOUR_MASTER_NODE_NAME" | sudo tee -a /etc/hosts

# create a fsdp configs for accelerate launch. change the EXP_NAME to your own experiment name 
python main/sdxl/create_sdxl_fsdp_configs.py --folder fsdp_configs/EXP_NAME  --master_ip $MASTER_IP --num_machines 8  --sharding_strategy 4
mkdir $CHECKPOINT_PATH

bash scripts/download_sdxl.sh $CHECKPOINT_PATH
```

You can also add these few export to the bashrc file so that you don't need to run them every time you open a new terminal.

### Sample Training/Testing Commands 

```bash
# start a training with 64 gpu. we need to run this script on all 8 nodes. Please change the EXP_NAME and NODE_RANK_ID accordingly.  
bash experiments/sdxl/sdxl_cond999_8node_lr5e-7_denoising4step_diffusion1000_gan5e-3_guidance8_noinit_noode_backsim_scratch.sh $CHECKPOINT_PATH $WANDB_ENTITY $WANDB_PROJECT fsdp_configs/EXP_NAME NODE_RANK_ID 

# on some other machine, start a testing process that continually reads from the checkpoint folder and evaluate the FID 
# Change TIMESTAMP_TBD to the real one
python main/sdxl/test_folder_sdxl.py \
    --folder $CHECKPOINT_PATH/sdxl_cond999_8node_lr5e-7_denoising4step_diffusion1000_gan5e-3_guidance8_noinit_noode_backsim_scratch/TIMESTAMP_TBD/ \
    --conditioning_timestep 999 --num_step 4 --wandb_entity $WANDB_ENTITY \
    --wandb_project $WANDB_PROJECT --num_train_timesteps 1000 \
    --seed 10 --eval_res 512 --ref_dir $CHECKPOINT_PATH/coco10k/subset \
    --anno_path  $CHECKPOINT_PATH/coco10k/all_prompts.pkl \
    --total_eval_samples 10000 --clip_score \
    --wandb_name test_sdxl_cond999_8node_lr5e-7_denoising4step_diffusion1000_gan5e-3_guidance8_noinit_noode_backsim_scratch
```

Please refer to [train_sd.py](../../main/train_sd.py) for various training options. Notably, if the `--delete_ckpts` flag is set to `True`, all checkpoints except the latest one will be deleted during training. Additionally, you can use the `--cache_dir` flag to specify a location with larger storage capacity. The number of checkpoints stored in `cache_dir` is controlled by the `max_checkpoint` argument.
