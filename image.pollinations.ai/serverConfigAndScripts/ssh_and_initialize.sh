#! /bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <ip_address_or_host_name>"
  exit 1
fi

HOST=$1

# Automatically accept adding the key if ssh asks
ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/thomashkey ubuntu@$HOST << EOF
  sudo rm -r /home/ubuntu/ComfyUI
  cd /home/ubuntu/pollinations
  git fetch origin
  git pull
  git reset --hard origin/master
  git pull
  git clean -fd
  git checkout master
  git pull
  cd /home/ubuntu/pollinations/image.pollinations.ai/serverConfigAndScripts
  bash "install-services.sh"
  sudo reboot
EOF
