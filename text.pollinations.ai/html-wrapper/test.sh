#!/bin/bash

# Make sure the server is running first
echo "Testing HTML wrapper service..."
echo "Sending a test request to the service..."

# Use curl to make a request and save the response to a file
curl -s "http://localhost:3001/Create a simple hello world page with a blue background" > test_response.html

echo "Response saved to test_response.html"
echo "Opening the response in the default browser..."

# Open the response in the default browser (works on macOS, Linux with xdg-open, or Windows with start)
if [[ "$OSTYPE" == "darwin"* ]]; then
  open test_response.html
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  xdg-open test_response.html
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  start test_response.html
else
  echo "Could not open the browser automatically. Please open test_response.html manually."
fi
