#!/bin/bash
cd "$(dirname "$0")"
npm install
wrangler dev worker.js --local
