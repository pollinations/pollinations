#!/bin/bash

# This script fetches a URL with a randomly generated 6-character alphanumeric string appended, using the 'time' command to measure duration. It repeats every 30 seconds.

export LC_CTYPE=C  # Set the locale to C to avoid illegal byte sequence error

while true; do
    # Generate a 6-character alphanumeric string
    RAND_STR=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 6 | head -n 1)

    # URL construction
    URL="http://image.pollinations.ai/prompt/random_prompt_$RAND_STR"

    echo "Fetching $URL"
    # Time the fetch operation and suppress wget output
    time wget -qO- $URL > /dev/null

    # Wait for 30 seconds
    sleep 30
done
