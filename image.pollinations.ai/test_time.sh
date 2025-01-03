#!/bin/bash

# This script fetches a URL with a randomly generated 6-character alphanumeric string appended, using the 'time' command to measure duration. It repeats every 30 seconds.

while true; do
    # Generate a 6-character alphanumeric string using only lowercase letters and numbers
    RAND_STR=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 6)

    # URL construction
    URL="http://image.pollinations.ai/prompt/random_prompt_$RAND_STR"

    echo "Fetching $URL"
    # Time the fetch operation and suppress wget output
    time wget -qO- "$URL" > /dev/null

    echo "Checking image.pollinations.ai/register time"
    time wget -qO- "https://image.pollinations.ai/register" > /dev/null

    # Wait for 30 seconds
    sleep 30
done
