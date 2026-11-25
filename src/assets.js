import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Asset files live in assets/. The standalone build embeds them as data URLs in window.__TF_ASSETS.
const TEX = ['plaster', 'plaster_n', 'stone', 'stone_n', 'roof', 'roof_n', 'cobble', 'cobble_n', 'dirt', 'dirt_n',
  'bark', 'bark_n', 'wood', 'wood_n', 'leaf', 'leaf_n', 'skin', 'skin_n', 'brick', 'brick_n', 'grass', 'water_n'];
const ENV = ['env_wilds', 'env_lowmarch', 'env_ironvale', 'env_solspire'];

export const A = { tex: {}, env: {}, splat: null, xbot: null, ready: false };

function url(file) {
  const e = window.__TF_ASSETS;
  return (e && e[file]) || 'assets/' + file;
}

export async function loadAssets(renderer, onProgress) {
  const tl = new THREE.TextureLoader();
  const total = TEX.length + ENV.length + 2;
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done / total); };
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loadTex = (file, srgb) => new Promise((res, rej) => tl.load(url(file), (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    tick(); res(t);
  }, undefined, () => rej(new Error('Could not load ' + file))));
  const jobs = [];
  for (const n of TEX) jobs.push(loadTex(n + '.jpg', !n.endsWith('_n')).then((t) => { A.tex[n] = t; }));
  for (const n of ENV) jobs.push(loadTex(n + '.jpg', true).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; A.env[n] = t; }));
  jobs.push(loadTex('splat.png', false).then((t) => { A.splat = t; }));
  jobs.push(new Promise((res, rej) => new GLTFLoader().load(url('xbot.json'), (g) => { A.xbot = g; tick(); res(); }, undefined, rej)));
  await Promise.all(jobs);
  A.ready = true;
  return A;
}
