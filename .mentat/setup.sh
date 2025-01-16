# Install Python dependencies
pip3 install -r image.pollinations.ai/image_gen_dmd2/requirements.txt
pip3 install -e .

# Install Node.js dependencies for each service
cd text.pollinations.ai && npm ci
cd ../image.pollinations.ai && npm ci
cd ../pollinations.ai && npm ci
cd ../pollinations-react && npm ci

# Build React components
cd ../pollinations-react && npm run build
cd ../pollinations.ai && npm run build