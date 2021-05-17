#!/bin/bash
while   true
do
  PID=(ipfs daemon --enable-namesys-pubsub --enable-pubsub-experiment --debug &)
  echo "Pid of Daemon:" $PID
  sleep 240
  kill $PID
  sleep 2
  kill -9 $PID
done
