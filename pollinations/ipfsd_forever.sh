#!/bin/bash
while :
do
    ipfs daemon --enable-namesys-pubsub --enable-pubsub-experiment
    sleep 2
done
