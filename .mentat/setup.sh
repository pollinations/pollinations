apt update
apt install -y python3-venv build-essential python3-dev node-gyp \
    libvips-dev libvips libjpeg-dev libpng-dev gcc g++ make

python3 -m venv venv
. venv/bin/activate
pip3 install -r image.pollinations.ai/image_gen_dmd2/requirements.txt
pip3 install -e .

npm install -g gyp

if [ -d "text.pollinations.ai" ]; then
    (cd text.pollinations.ai && npm ci)
fi

npm config set python /usr/bin/python3
if [ -d "image.pollinations.ai" ]; then
    (cd image.pollinations.ai && npm ci)
fi

if [ -d "pollinations.ai" ]; then
    (cd pollinations.ai && npm ci && npm run build)
fi

if [ -d "pollinations-react" ]; then
    (cd pollinations-react && npm ci)
fi