#!/usr/bin/env bash
# Sandbox wrapper. Runs anything under macOS Seatbelt with a minimal profile.
#   ./sandbox.sh ./agent.sh "your goal"
#   ./sandbox.sh bash -c 'rm -rf /'    # harmless: denied
exec /usr/bin/sandbox-exec \
  -f "$(dirname "$0")/sandbox.sb" \
  -D "HOME=$HOME" \
  -D "WORK=${WORK:-$PWD}" \
  "$@"
