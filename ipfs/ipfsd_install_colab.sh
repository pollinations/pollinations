#!/bin/bash

# IPFS

wget https://dist.ipfs.io/go-ipfs/v0.8.0/go-ipfs_v0.8.0_linux-amd64.tar.gz
tar -xvzf go-ipfs_v0.8.0_linux-amd64.tar.gz
cd go-ipfs
sudo bash install.sh
cd -
rm -r go-ipfs

ipfs init --profile test
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'

# # Pollinations
# git clone https://github.com/voodoohop/pollinations
# cd pollinations/src/app
# yarn install
# yarn install -g
# cd -


