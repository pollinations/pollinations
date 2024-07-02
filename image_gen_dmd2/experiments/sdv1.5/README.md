## Getting Started with DMD2 on SDv1.5

### Model Zoo

| Config Name | FID | Link | Iters | Hours |
| ----------- | --- | ---- | ----- | ----- |
| [laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch](./laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch.sh) | 9.28 | [link](https://huggingface.co/tianweiy/DMD2/tree/main/model/sdv1.5/laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch_fid9.28_checkpoint_model_039000) | 39k | 25 |
| [laion6.25_sd_baseline_8node_guidance1.75_lr5e-7_seed10_dfake10_diffusion1000_gan1e-3_resume*](./laion6.25_sd_baseline_8node_guidance1.75_lr5e-7_seed10_dfake10_diffusion1000_gan1e-3_resume.sh) | 8.35 | [link](https://huggingface.co/tianweiy/DMD2/tree/main/model/sdv1.5/laion6.25_sd_baseline_8node_guidance1.75_lr5e-7_seed10_dfake10_diffusion1000_gan1e-3_resume_fid8.35_checkpoint_model_041000/) | 2k | 2 |

*The final model was resumed from the best checkpoint of the **laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch** run and trained for an additional 2,000 iterations. 

For inference with our models, you only need to download the pytorch_model.bin file from the provided link. For fine-tuning, you will need to download the entire folder.
You can use the following script for that:

```bash 
export CHECKPOINT_NAME="sdv1.5/laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch_fid9.28_checkpoint_model_039000"  # note that the sdv1.5/ is necessary
export OUTPUT_PATH="path/to/your/output/folder"

bash scripts/download_hf_checkpoint.sh $CHECKPOINT_NAME $OUTPUT_PATH
```

Note: We only experimented with a small guidance scale of 1.75 for our SDv1.5 experiments. While this setting generally produces diverse images with good FID scores, the image quality is low. For higher quality visual results, we recommend using our [SDXL training configurations](../sdxl/README.md) or adjusting the real_guidance_scale to a larger value.


### Download Base Diffusion Models and Training Data
```bash
export CHECKPOINT_PATH="" # change this to your own checkpoint folder 
export WANDB_ENTITY="" # change this to your own wandb entity
export WANDB_PROJECT="" # change this to your own wandb project
export MASTER_IP=""  # change this to your own master ip

# Not sure why but we found the following line necessary to work with the accelerate package in our system. 
# Change YOUR_MASTER_IP/YOUR_MASTER_NODE_NAME to the correct value 
echo "YOUR_MASTER_IP 	YOUR_MASTER_NODE_NAME" | sudo tee -a /etc/hosts

mkdir $CHECKPOINT_PATH

bash scripts/download_sdv15.sh $CHECKPOINT_PATH
```

You can also add these few export to the bashrc file so that you don't need to run them every time you open a new terminal.

### Sample Training/Testing Commands

```bash
# start a training with 64 gpu. we need to run this script on all 8 nodes. 
bash experiments/laion/laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch.sh $CHECKPOINT_PATH  $WANDB_ENTITY $WANDB_PROJECT $MASTER_IP

# on some other machine, start a testing process that continually reads from the checkpoint folder and evaluate the FID 
# Change TIMESTAMP_TBD to the real one
python main/test_folder_sd.py   --folder $CHECKPOINT_PATH/laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch/TIMESTAMP_TBD \
    --wandb_name test_laion6.25_sd_baseline_8node_guidance1.75_lr1e-5_seed10_dfake10_from_scratch \
    --wandb_entity $WANDB_ENTITY \
    --wandb_project $WANDB_PROJECT \
    --image_resolution 512 \
    --latent_resolution 64 \
    --num_train_timesteps 1000 \
    --test_visual_batch_size 64 \
    --per_image_object 16 \
    --seed 10 \
    --anno_path $CHECKPOINT_PATH/captions_coco14_test.pkl \
    --eval_res 256 \
    --ref_dir $CHECKPOINT_PATH/val2014 \
    --total_eval_samples 30000 \
    --model_id "runwayml/stable-diffusion-v1-5" \
    --pred_eps 
```

Please refer to [train_sd.py](../../main/train_sd.py) for various training options. Notably, if the `--delete_ckpts` flag is set to `True`, all checkpoints except the latest one will be deleted during training. Additionally, you can use the `--cache_dir` flag to specify a location with larger storage capacity. The number of checkpoints stored in `cache_dir` is controlled by the `max_checkpoint` argument.
