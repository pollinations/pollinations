#!/usr/bin/env bash
set -euo pipefail

# Use an RTX 3060 with a CUDA 12.4 development image and Node.js 22 or newer.
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)'
nvcc --version
export DEBIAN_FRONTEND=noninteractive
apt-get -qq update
apt-get -yqq install git cmake g++ ninja-build curl ca-certificates pkg-config espeak-ng ffmpeg

root="${ZONOS_WORKSPACE:-/workspace/zonos3-mini}"
source_revision=96d9e0ec1e39083ed336ac78f24e3dbc93721c0f
weight_revision=2921b8821772b0bd10a04456863d21abf9d2f283
mkdir -p "$root/models"
if [[ ! -d "$root/source/.git" ]]; then
    git clone https://github.com/Zyphra/ZONOS3-Mini.git "$root/source"
fi
git -C "$root/source" checkout --detach "$source_revision"
git -C "$root/source" submodule update --init --depth 1 servers/ggml/ggml third_party/zyphra-textnorm
if ! command -v cargo >/dev/null; then
    curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
    export PATH="$HOME/.cargo/bin:$PATH"
fi
# The pinned text normalizer uses Rust 2024 and requires Rust 1.88.
node -e 'const [,major,minor]=process.argv[1].match(/cargo (\d+)\.(\d+)/); if (+major < 1 || (+major === 1 && +minor < 88)) process.exit(1)' "$(cargo --version)"

for weight in backbone-ptq.gguf zac-keep2.gguf; do
    path="$root/models/$weight"
    if [[ ! -s "$path" ]]; then
        curl -fLsS --retry 3 "https://huggingface.co/Zyphra/ZONOS3-Mini/resolve/$weight_revision/gguf/$weight" -o "$path.part"
        mv "$path.part" "$path"
    fi
done

cmake -S "$root/source/servers/ggml" -B "$root/build" -G Ninja -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86 -DGGML_NATIVE=OFF
cmake --build "$root/build" --target zonos3-server -j 8
install -m 0644 "$(dirname "${BASH_SOURCE[0]}")/speech.mjs" "$root/speech.mjs"
