#!/bin/bash

# IPFS
wget https://dist.ipfs.io/go-ipfs/v0.9.1/go-ipfs_v0.9.1_linux-amd64.tar.gz
tar -xvzf go-ipfs_v0.9.1_linux-amd64.tar.gz
cd go-ipfs
sudo bash install.sh
cd -

ipfs bootstrap rm --all
ipfs config Addresses.Swarm /ip4/0.0.0.0/tcp/4001
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
# ipfs config Pubsub.Router floodsub
ipfs config --json Pubsub.DisableSigning true
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
# sudo apt update

# # NVM
# wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
# export NVM_DIR="$HOME/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
# [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
# nvm install 16
# nvm use 16
# npm install -g yarn

# # Pollinations
# git clone https://github.com/pollinations/pollinations
# cd pollinations/src/app
# yarn install
# yarn install -g
# cd -


