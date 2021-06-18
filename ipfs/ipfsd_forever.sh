#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
bash $SCRIPT_DIR/regular_swarm_connect.sh &
set -m
while :
do
    ipfs daemon --enable-namesys-pubsub --enable-pubsub-experiment &
    sleep 15
    fg
    sleep 2
done
