"""Builds game textures into assets/.

Procedural textures are generated here (tileable, with normal maps).
Downloaded free assets in assets/raw are resized/converted:
  - Poly Haven CC0 HDRIs -> tone-mapped equirect JPGs for image-based lighting
  - three.js example textures (brick, grass, water normals) -> 1024px JPGs
Run: python3 tools/gen_assets.py
"""
import os
import numpy as np
from PIL import Image

OUT = 'assets'
RAW = 'assets/raw'
N = 1024
rng = np.random.default_rng(1234)


def save(name, arr, q=86, size=None):
    a = np.clip(arr, 0, 1)
    if a.ndim == 2:
        a = np.stack([a] * 3, -1)
    im = Image.fromarray((a * 255).astype(np.uint8))
    if size: im = im.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(OUT, name), quality=q, optimize=True)
    print('wrote', name)


def tnoise(n, freq):
    """Tileable smooth noise: white noise low-pass filtered in frequency space."""
    w = rng.standard_normal((n, n))
    f = np.fft.fft2(w)
    ky = np.fft.fftfreq(n)[:, None] * n
    kx = np.fft.fftfreq(n)[None, :] * n
    k = np.sqrt(kx * kx + ky * ky)
    f *= np.exp(-(k / freq) ** 2)
    r = np.real(np.fft.ifft2(f))
    r -= r.min(); r /= r.max() + 1e-9
    return r


def fbm(n, base, octaves=5, gain=0.5):
    out = np.zeros((n, n)); amp = 1; tot = 0
    for o in range(octaves):
        out += tnoise(n, base * 2 ** o) * amp; tot += amp; amp *= gain
    return out / tot


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + 1)
    return np.stack([(-dx / l) * 0.5 + 0.5, (dy / l) * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


yy, xx = np.mgrid[0:N, 0:N] / N

# ---------------------------------------------------------------- plaster (pale, tinted per building)
n1 = fbm(N, 4); n2 = fbm(N, 40, 3); grain = tnoise(N, 300)
h = n2 * 0.6 + grain * 0.4
stain = smooth(0.55, 0.85, fbm(N, 3))
v = 0.86 + n1 * 0.12 - stain * 0.14 + (grain - 0.5) * 0.05
col = np.stack([v * 1.0, v * 0.97, v * 0.92], -1)
save('plaster.jpg', col)
save('plaster_n.jpg', size=512, arr=normal_from_height(h, 3.0))

# ---------------------------------------------------------------- ashlar stone blocks (walls, ruins)
rows, cols = 6, 3
ry = yy * rows; row = np.floor(ry)
rx = xx * cols + (row % 2) * 0.5
cx = np.floor(rx) % cols
fy, fx = ry - row, rx - np.floor(rx)
edge = np.minimum(np.minimum(fx, 1 - fx) * 1.0 / rows * cols, np.minimum(fy, 1 - fy))
blockh = smooth(0.0, 0.035, edge)
idv = (row * 7 + cx * 13) % 17 / 17.0
rough = fbm(N, 16, 4)
chips = smooth(0.62, 0.7, fbm(N, 30, 3)) * 0.4
hst = blockh * (0.8 + rough * 0.2) - chips * blockh
v = (0.62 + idv * 0.22 + (rough - 0.5) * 0.2) * (0.45 + 0.55 * blockh) - chips * 0.1
save('stone.jpg', np.stack([v, v * 0.97, v * 0.92], -1))
save('stone_n.jpg', normal_from_height(hst, 9.0))

# ---------------------------------------------------------------- clay roof tiles (grayscale-ish; tinted)
rows, cols = 14, 10
ry = yy * rows; row = np.floor(ry); fy = ry - row
rx = xx * cols + (row % 2) * 0.5; fx = rx - np.floor(rx)
barrel = 1 - (2 * fx - 1) ** 2
lap = fy  # each tile rises toward its lower edge, overlapping the next row
ht = barrel * 0.6 + lap * 0.5
shadow = smooth(0.0, 0.12, fy)
tid = ((row * 5 + np.floor(rx) * 11) % 13) / 13.0
noi = fbm(N, 24, 3)
v = (0.62 + tid * 0.25 + (noi - 0.5) * 0.25) * (0.35 + 0.65 * shadow) * (0.75 + 0.25 * barrel)
save('roof.jpg', np.stack([v, v * 0.95, v * 0.9], -1))
save('roof_n.jpg', normal_from_height(ht + noi * 0.1, 7.0))

# ---------------------------------------------------------------- cobblestone (Voronoi)
pts = rng.random((260, 2))
best1 = np.full((N, N), 9.0); best2 = np.full((N, N), 9.0); idx = np.zeros((N, N), int)
for i, (px, py) in enumerate(pts):
    dx = np.abs(xx - px); dx = np.minimum(dx, 1 - dx)
    dy = np.abs(yy - py); dy = np.minimum(dy, 1 - dy)
    d = np.sqrt(dx * dx + dy * dy)
    m = d < best1
    best2 = np.where(m, best1, np.minimum(best2, d))
    idx = np.where(m, i, idx); best1 = np.where(m, d, best1)
gap = best2 - best1
stoneh = smooth(0.0, 0.025, gap)
tone = (idx * 37 % 23) / 23.0
noi = fbm(N, 30, 3)
hc = stoneh * (1 - best1 * 6).clip(0.3, 1) + noi * 0.1
v = (0.42 + tone * 0.28 + (noi - 0.5) * 0.15) * (0.3 + 0.7 * stoneh)
save('cobble.jpg', np.stack([v * 1.02, v * 0.98, v * 0.92], -1))
save('cobble_n.jpg', normal_from_height(hc, 8.0))

# ---------------------------------------------------------------- dirt
d1 = fbm(N, 6); d2 = tnoise(N, 200)
peb = smooth(0.7, 0.75, tnoise(N, 120))
v = 0.38 + d1 * 0.2 + (d2 - 0.5) * 0.1 + peb * 0.12
save('dirt.jpg', np.stack([v * 1.05, v * 0.88, v * 0.68], -1))
save('dirt_n.jpg', size=512, arr=normal_from_height(d2 * 0.5 + peb * 0.6, 4.0))

# ---------------------------------------------------------------- bark (vertical fibres)
w = rng.standard_normal((N, N)); f = np.fft.fft2(w)
ky = np.fft.fftfreq(N)[:, None] * N; kx = np.fft.fftfreq(N)[None, :] * N
f *= np.exp(-((kx / 60) ** 2 + (ky / 6) ** 2))
b = np.real(np.fft.ifft2(f)); b -= b.min(); b /= b.max()
ridges = 1 - np.abs(b * 2 - 1)
v = 0.22 + ridges * 0.22 + fbm(N, 20, 3) * 0.08
save('bark.jpg', np.stack([v * 1.1, v * 0.9, v * 0.72], -1))
save('bark_n.jpg', normal_from_height(ridges, 10.0))

# ---------------------------------------------------------------- wood planks
rows = 8
row = np.floor(yy * rows); fy = yy * rows - row
grain = tnoise(N, 50)
w2 = np.sin((xx * 40 + grain * 6 + row * 3.1) * 6.283) * 0.5 + 0.5
seam = smooth(0.0, 0.04, np.minimum(fy, 1 - fy))
v = (0.35 + w2 * 0.12 + ((row * 7) % 5) * 0.03) * (0.4 + 0.6 * seam)
save('wood.jpg', np.stack([v * 1.15, v * 0.88, v * 0.62], -1))
save('wood_n.jpg', size=512, arr=normal_from_height(seam + w2 * 0.1, 6.0))

# ---------------------------------------------------------------- foliage clumps
leaf = fbm(N, 40, 3)
clump = smooth(0.4, 0.65, leaf)
v = 0.18 + clump * 0.32 + tnoise(N, 200) * 0.06
save('leaf.jpg', np.stack([v * 0.75, v * 1.15, v * 0.55], -1))
save('leaf_n.jpg', size=512, arr=normal_from_height(clump, 8.0))

# ---------------------------------------------------------------- hollow skin: pale flesh, blotches, veins
base = fbm(N, 5)
veins = 1 - np.abs(fbm(N, 14, 4) * 2 - 1)
veins = smooth(0.95, 0.995, veins) * 0.6
pores = tnoise(N, 350)
r = 0.93 + (base - 0.5) * 0.10 - veins * 0.08
g = 0.84 + (base - 0.5) * 0.10 - veins * 0.14
bl = 0.79 + (base - 0.5) * 0.08 - veins * 0.08
save('skin.jpg', np.stack([r, g, bl], -1) * (0.95 + pores[..., None] * 0.08))
save('skin_n.jpg', size=512, arr=normal_from_height(pores * 0.3 + veins * 0.8 + base * 0.2, 5.0))

# ---------------------------------------------------------------- blood splat atlas (2x2, alpha in luminance)
S = 512
atlas = np.zeros((S * 2, S * 2))
for k in range(4):
    a = np.zeros((S, S))
    yy2, xx2 = np.mgrid[0:S, 0:S] / S - 0.5
    rr = np.sqrt(xx2 ** 2 + yy2 ** 2)
    ang = np.arctan2(yy2, xx2)
    wob = 0.18 + 0.06 * np.sin(ang * (5 + k)) + 0.04 * np.sin(ang * 13 + k)
    a = np.maximum(a, smooth(wob + 0.02, wob - 0.02, rr))
    for _ in range(40 + k * 10):
        ang0 = rng.random() * 6.283; dist = 0.18 + rng.random() * 0.3
        px, py = np.cos(ang0) * dist, np.sin(ang0) * dist
        rad = 0.005 + rng.random() ** 2 * 0.04
        a = np.maximum(a, smooth(rad + 0.004, rad - 0.004, np.sqrt((xx2 - px) ** 2 + (yy2 - py) ** 2)))
    for _ in range(6):  # streaks
        ang0 = rng.random() * 6.283
        t = np.clip(xx2 * np.cos(ang0) + yy2 * np.sin(ang0), 0, 0.45)
        px, py = t * np.cos(ang0), t * np.sin(ang0)
        d = np.sqrt((xx2 - px) ** 2 + (yy2 - py) ** 2)
        a = np.maximum(a, smooth(0.02 * (1 - t * 2), 0.0, d) * (t > 0))
    a *= smooth(0.5, 0.42, rr)
    atlas[(k // 2) * S:(k // 2 + 1) * S, (k % 2) * S:(k % 2 + 1) * S] = a
Image.fromarray((atlas * 255).astype(np.uint8)).save(os.path.join(OUT, 'splat.png'), optimize=True)
print('wrote splat.png')

# ---------------------------------------------------------------- downloaded textures
def resize(src, dst, size=1024, q=86):
    im = Image.open(os.path.join(RAW, src)).convert('RGB').resize((size, size), Image.LANCZOS)
    im.save(os.path.join(OUT, dst), quality=q, optimize=True); print('wrote', dst)

resize('brick_diffuse.jpg', 'brick.jpg')
bump = np.asarray(Image.open(os.path.join(RAW, 'brick_bump.jpg')).convert('L').resize((N, N), Image.LANCZOS)) / 255.0
save('brick_n.jpg', normal_from_height(bump, 6.0))
resize('grasslight-big.jpg', 'grass.jpg')
resize('waternormals.jpg', 'water_n.jpg', 512)


# ---------------------------------------------------------------- HDR (Radiance RGBE) -> LDR equirect for IBL
def read_hdr(path):
    data = open(path, 'rb').read()
    i = data.index(b'\n\n') + 2
    j = data.index(b'\n', i)
    dims = data[i:j].split()
    h, w = int(dims[1]), int(dims[3])
    p = j + 1
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        if data[p] == 2 and data[p + 1] == 2:
            p += 4
            for c in range(4):
                x = 0
                while x < w:
                    cnt = data[p]; p += 1
                    if cnt > 128:
                        cnt -= 128; img[y, x:x + cnt, c] = data[p]; p += 1
                    else:
                        img[y, x:x + cnt, c] = np.frombuffer(data[p:p + cnt], np.uint8); p += cnt
                    x += cnt
        else:
            img[y] = np.frombuffer(data[p:p + w * 4], np.uint8).reshape(w, 4); p += w * 4
    e = img[..., 3].astype(np.float32)
    scale = np.where(e > 0, np.ldexp(1.0, (e - 136).astype(np.int32)), 0)
    return img[..., :3].astype(np.float32) * scale[..., None]


for src, dst, exp in [('forest_slope_1k.hdr', 'env_wilds.jpg', 1.0), ('kiara_1_dawn_1k.hdr', 'env_lowmarch.jpg', 1.2),
                      ('blouberg_sunrise_2_1k.hdr', 'env_ironvale.jpg', 0.9), ('venice_sunset_1k.hdr', 'env_solspire.jpg', 1.0)]:
    hdr = read_hdr(os.path.join(RAW, src)) * exp
    ldr = hdr / (1 + hdr)  # Reinhard
    ldr = np.power(np.clip(ldr, 0, 1), 1 / 2.2)
    Image.fromarray((ldr * 255).astype(np.uint8)).save(os.path.join(OUT, dst), quality=88)
    print('wrote', dst)
