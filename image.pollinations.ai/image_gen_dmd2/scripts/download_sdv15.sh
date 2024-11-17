$CHECKPOINT_PATH=$1

# training prompts 
wget  https://huggingface.co/tianweiy/DMD2/resolve/main/data/laion/captions_laion_score6.25.pkl?download=true -O $CHECKPOINT_PATH/captions_laion_score6.25.pkl

# evaluation prompts
wget  https://huggingface.co/tianweiy/DMD2/resolve/main/data/coco/captions_coco14_test.pkl?download=true -O $CHECKPOINT_PATH/captions_coco14_test.pkl

# real dataset 
wget https://huggingface.co/tianweiy/DMD2/resolve/main/data/laion_vae_latents/sd_vae_latents_laion_500k_lmdb.zip?download=true -O $CHECKPOINT_PATH/sd_vae_latents_laion_500k_lmdb.zip
unzip $CHECKPOINT_PATH/sd_vae_latents_laion_500k_lmdb.zip -d $CHECKPOINT_PATH

# evaluation images 
wget https://huggingface.co/tianweiy/DMD2/resolve/main/data/coco/val2014.zip?download=true -O $CHECKPOINT_PATH/val2014.zip
unzip $CHECKPOINT_PATH/val2014.zip -d $CHECKPOINT_PATH