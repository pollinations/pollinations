#!/bin/bash

# IPFS
wget https://dist.ipfs.io/go-ipfs/v0.8.0/go-ipfs_v0.8.0_linux-amd64.tar.gz
tar -xvzf go-ipfs_v0.8.0_linux-amd64.tar.gz
cd go-ipfs
sudo bash install.sh
cd -

sudo apt update

# # NVM
# wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
# export NVM_DIR="$HOME/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
# [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
# nvm install 16
# nvm use 16
# npm install -g yarn

# # Pollinations
# git clone https://github.com/voodoohop/pollinations
# cd pollinations/src/app
# yarn install
# yarn install -g
# cd -


