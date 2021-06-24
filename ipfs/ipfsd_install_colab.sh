#!/bin/bash

# IPFS

wget https://ipfs.io/ipns/dist.ipfs.io/go-ipfs/v0.9.0/go-ipfs_v0.9.0_linux-arm64.tar.gz
tar -xvzf go-ipfs_v0.9.0_linux-amd64.tar.gz
cd go-ipfs
sudo bash install.sh
cd -
rm -r go-ipfs

ipfs init --profile test
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
#ipfs config Pubsub.Router floodsub
#ipfs config Pubsub.DisableSigning true
ipfs config --json Peering.Peers '[{"ID":"12D3KooWDwQ1R9ZmDRv8aWL4dJ4svS9AYvwfJicQ1F45W5aHAVmy", "Addrs": ["/ip4/18.157.205.205/tcp/4001"]}]' 


# # Pollinations
# git clone https://github.com/voodoohop/pollinations
# cd pollinations/src/app
# yarn install
# yarn install -g
# cd -


