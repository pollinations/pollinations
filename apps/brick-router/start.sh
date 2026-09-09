#!/bin/sh
set -eu

python3 /app/classifier.py &
exec /app/brick --config /app/config/config.yaml
