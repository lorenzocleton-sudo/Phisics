// Produces dist/tetherfall.html: one self-contained file that runs from disk (no server needed).
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('dist/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const out = html.replace('<script src="dist/game.js"></script>', () => `<script>${js}</script>`);
fs.writeFileSync('dist/tetherfall.html', out);
console.log('wrote dist/tetherfall.html', (out.length / 1024).toFixed(0) + ' KB');
