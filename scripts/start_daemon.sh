#!/bin/bash
while   true
do
  ipfs daemon --enable-namesys-pubsub --enable-pubsub-experiment  &
  PID=$!
  echo "Pid of Daemon:" $PID
  sleep 4800
  kill $PID
  sleep 2
  kill -9 $PID
done
