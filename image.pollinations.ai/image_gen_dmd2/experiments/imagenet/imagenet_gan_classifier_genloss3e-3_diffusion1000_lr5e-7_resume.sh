export CHECKPOINT_PATH=$1
export WANDB_ENTITY=$2
export WANDB_PROJECT=$3

CUDA_VISIBLE_DEVICES=1,2,3,4,5,6,7 torchrun --nproc_per_node 7 --nnodes 1 main/edm/train_edm.py \
    --generator_lr 5e-7  \
    --guidance_lr 5e-7  \
    --train_iters 10000000 \
    --output_path  $CHECKPOINT_PATH/imagenet_gan_classifier_genloss3e-3_diffusion1000_lr5e-7_resume \
    --batch_size 40 \
    --initialie_generator --log_iters 500 \
    --resolution 64 \
    --label_dim 1000 \
    --dataset_name "imagenet" \
    --seed 10 \
    --model_id $CHECKPOINT_PATH/edm-imagenet-64x64-cond-adm.pkl \
    --wandb_iters 100 \
    --wandb_entity $WANDB_ENTITY \
    --wandb_project $WANDB_PROJECT \
    --use_fp16 \
    --wandb_name "imagenet_gan_classifier_genloss3e-3_diffusion1000_lr5e-7_resume"   \
    --real_image_path $CHECKPOINT_PATH/imagenet-64x64_lmdb \
    --dfake_gen_update_ratio 5 \
    --cls_loss_weight 1e-2 \
    --gan_classifier \
    --gen_cls_loss_weight 3e-3 \
    --diffusion_gan \
    --diffusion_gan_max_timestep 1000 \
    --delete_ckpts \
    --max_checkpoint 200 \
    --ckpt_only_path $CHECKPOINT_PATH/imagenet_lr2e-6_scratch_fid2.61_checkpoint_model_405500/

