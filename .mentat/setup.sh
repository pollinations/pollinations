apt update
apt install -y python3-venv build-essential python3-dev node-gyp
python3 -m venv venv
. venv/bin/activate
pip3 install -r image.pollinations.ai/image_gen_dmd2/requirements.txt
pip3 install -e .

cd text.pollinations.ai && npm ci && cd ..
cd image.pollinations.ai && npm ci && cd ..
cd pollinations.ai && npm ci && npm run build && cd ..
cd pollinations-react && npm ci && cd ..