#!/bin/bash

# This script fetches a URL with a randomly generated 6-character alphanumeric string appended, using the 'time' command to measure duration. It repeats every 30 seconds.

while true; do
    # Generate a 6-character alphanumeric string
    RAND_STR=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 6 | head -n 1)


    # URL construction
    URL="http://image.pollinations.ai/prompt/$RAND_STR"

    echo "Fetching $URL"
    # Time the fetch operation
    time curl -o /dev/null -s $URL

    # Wait for 30 seconds
    sleep 60
done
