// Builds:
//   dist/tetherfall.html  one self-contained file (assets embedded) that runs straight from disk
//   dist/web/             index.html + game.js + assets/ for hosting
//   dist/web/page.html    the page body for hosts that supply their own <html>/<head>/<body>
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('dist/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
// GLB -> self-contained glTF JSON (some hosts only serve common web types)
{
  const glb = fs.readFileSync('assets/xbot.glb');
  const jsonLen = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));
  gltf.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
  fs.writeFileSync('assets/xbot.json', JSON.stringify(gltf));
}
const files = fs.readdirSync('assets').filter((f) => /\.(jpg|png|json)$/.test(f));
const mime = { jpg: 'image/jpeg', png: 'image/png', json: 'application/json' };
const embedded = {};
for (const f of files) embedded[f] = `data:${mime[f.split('.').pop()]};base64,` + fs.readFileSync(path.join('assets', f)).toString('base64');
const standalone = html.replace('<script src="dist/game.js"></script>',
  () => `<script>window.__TF_ASSETS=${JSON.stringify(embedded)};</script>\n<script>${js}</script>`);
fs.writeFileSync('dist/tetherfall.html', standalone);
console.log('wrote dist/tetherfall.html', (standalone.length / 1e6).toFixed(1) + ' MB');
{
  const t = standalone.match(/<title>[\s\S]*?<\/title>/)[0];
  const l = (standalone.match(/<link [^>]*>/g) || []).join('\n');
  const st = standalone.match(/<style>[\s\S]*?<\/style>/)[0];
  const bd = standalone.slice(standalone.indexOf('<body>') + 6, standalone.lastIndexOf('</body>'));
  fs.writeFileSync('dist/play.html', `${t}\n${l}\n${st}\n${bd}`);
  console.log('wrote dist/play.html (page body, assets embedded)');
}

fs.mkdirSync('dist/web/assets', { recursive: true });
for (const f of files) fs.copyFileSync(path.join('assets', f), path.join('dist/web/assets', f));
fs.copyFileSync('dist/game.js', 'dist/web/game.js');
const web = html.replace('<script src="dist/game.js"></script>', '<script src="game.js"></script>');
fs.writeFileSync('dist/web/index.html', web);
const title = web.match(/<title>[\s\S]*?<\/title>/)[0];
const links = (web.match(/<link [^>]*>/g) || []).join('\n');
const style = web.match(/<style>[\s\S]*?<\/style>/)[0];
const body = web.match(/<body>([\s\S]*)<\/body>/)[1];
fs.writeFileSync('dist/web/page.html', `${title}\n${links}\n${style}\n${body}`);
console.log('wrote dist/web/ (' + files.length + ' assets)');
