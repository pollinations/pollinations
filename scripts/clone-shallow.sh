#!/usr/bin/env bash
set -euo pipefail

# Use this for consumers that need the current source tree, not Git history.
git clone --depth 1 --filter=blob:none --single-branch \
  https://github.com/pollinations/pollinations.git
