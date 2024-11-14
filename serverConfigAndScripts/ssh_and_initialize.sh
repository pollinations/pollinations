#! /bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <ip_address_or_host_name>"
  exit 1
fi

HOST=$1

# Automatically accept adding the key if ssh asks
ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/thomashkey ubuntu@$HOST << EOF
  cd /home/ubuntu/pollinations/serverConfigAndScripts
  git fetch origin
  git pull
  git checkout master
  bash install-services.sh
  sudo reboot
EOF
