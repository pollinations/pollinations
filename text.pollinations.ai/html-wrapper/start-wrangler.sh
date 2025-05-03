#!/bin/bash
cd "$(dirname "$0")"
npm install
npx wrangler dev worker.js --local
