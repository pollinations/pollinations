#!/bin/bash

set -e

echo "Cleaning up any stale processes on ports..."
fuser -k 9000/tcp 2>/dev/null || true
fuser -k 7002/tcp 2>/dev/null || true
sleep 2
source venv/bin/activate
sleep 2
echo "Starting Model Server..."
python api/model_server.py 2>&1 | tee model_server.log &
MODEL_SERVER_PID=$!

echo "Waiting for Model Server to be ready..."
timeout 300 bash -c 'while ! grep -q "\[SERVER_READY\]" model_server.log; do sleep 0.5; done' || {
    echo "Model Server failed to start!"
    cat model_server.log
    exit 1
}

echo "Model Server is ready! Starting FastAPI App..."
python api/app.py

wait $MODEL_SERVER_PID