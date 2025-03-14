apt update
apt install -y python3-venv build-essential python3-dev node-gyp \
    libvips-dev libvips libjpeg-dev libpng-dev gcc g++ make python2

python3 -m venv venv
. venv/bin/activate
pip3 install -r image.pollinations.ai/image_gen_dmd2/requirements.txt
pip3 install -e .

npm install -g node-pre-gyp node-gyp

export NODE_GYP_FORCE_PYTHON=/usr/bin/python2
export npm_config_python=/usr/bin/python2

if [ -d "text.pollinations.ai" ]; then
    (cd text.pollinations.ai && npm ci)
fi

if [ -d "image.pollinations.ai" ]; then
    (cd image.pollinations.ai && npm ci)
fi

if [ -d "pollinations.ai" ]; then
    (cd pollinations.ai && npm ci && npm run build)
fi

if [ -d "pollinations-react" ]; then
    (cd pollinations-react && npm ci)
fi