#!/usr/bin/env bash
# Downloads the free source assets into assets/raw (run before tools/gen_assets.py).
set -euo pipefail
mkdir -p assets/raw && cd assets/raw
T=https://raw.githubusercontent.com/mrdoob/three.js/r160/examples
D=https://raw.githubusercontent.com/pmndrs/drei-assets/master/hdri
for f in models/gltf/Xbot.glb textures/brick_diffuse.jpg textures/brick_bump.jpg textures/terrain/grasslight-big.jpg \
         textures/waternormals.jpg textures/equirectangular/blouberg_sunrise_2_1k.hdr; do curl -fsSLO "$T/$f"; done
for f in forest_slope_1k.hdr kiara_1_dawn_1k.hdr venice_sunset_1k.hdr; do curl -fsSLO "$D/$f"; done
cp Xbot.glb ../xbot.glb
echo "fetched $(ls | wc -l) files"
