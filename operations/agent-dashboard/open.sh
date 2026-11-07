#!/bin/sh
# Reopens the agent dashboard window (the server keeps running when it's closed).
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app=http://127.0.0.1:7320/ --user-data-dir="/Users/thomash/.config/herdr/dashboard/chrome-profile" --no-first-run --window-size=1300,950
