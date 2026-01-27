#!/bin/bash
# Load secrets from sops-encrypted env.json into .dev.vars for wrangler

cd "$(dirname "$0")/.."

sops decrypt secrets/env.json --output-type dotenv > .dev.vars

echo "Secrets loaded to .dev.vars"
