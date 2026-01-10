# Not to be run automatically - manual setup script for installing CUDA drivers on Ubuntu 24.04
sudo apt update
sudo apt upgrade -y

sudo apt install -y build-essential dkms linux-headers-$(uname -r)

uname -r

sudo apt --purge remove '*nvidia*' '*cuda*'
sudo apt autoremove -y
sudo apt clean
sudo reboot

sudo ubuntu-drivers list --gpgpu

sudo apt install -y nvidia-driver-535-server nvidia-utils-535-server

sudo apt-get update
sudo apt-get install ffmpeg libsndfile1

sudo reboot

wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb

nvidia-smi
