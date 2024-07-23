CHECKPOINT_PATH=$1

wget https://nvlabs-fi-cdn.nvidia.com/edm/pretrained/edm-imagenet-64x64-cond-adm.pkl -O $CHECKPOINT_PATH/edm-imagenet-64x64-cond-adm.pkl

wget https://api.ngc.nvidia.com/v2/models/nvidia/research/stylegan3/versions/1/files/metrics/inception-2015-12-05.pkl -O $CHECKPOINT_PATH/inception-2015-12-05.pkl

wget https://nvlabs-fi-cdn.nvidia.com/edm/fid-refs/imagenet-64x64.npz -O $CHECKPOINT_PATH/imagenet_fid_refs_edm.npz

# download the imagenet-64x64 lmdb 
wget https://huggingface.co/tianweiy/DMD2/resolve/main/data/imagenet/imagenet-64x64_lmdb.zip?download=true -O $CHECKPOINT_PATH/imagenet-64x64_lmdb.zip
unzip $CHECKPOINT_PATH/imagenet-64x64_lmdb.zip -d $CHECKPOINT_PATH
