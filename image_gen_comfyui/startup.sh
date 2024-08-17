#!/bin/bash
cd $HOME/ComfyUI
source comfyenv/bin/activate

# Function to kill python3 processes on exit
cleanup() {
    kill -9 $PYTHON_PID
    kill -9 $SERVER_PID
}

# Trap any exit signal (including interrupts) to call the cleanup function
trap cleanup EXIT INT TERM

# Start python3 main.py in the background
python3 main.py &
PYTHON_PID=$!

sleep 30

cd pollinationsServer
python3 -m server &
SERVER_PID=$!

sleep 5

wait $PYTHON_PID
wait $SERVER_PID
