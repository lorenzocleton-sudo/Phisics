// Builds dist/artifact.html: the page body for hosting inside a page wrapper
// (no doctype/html/head/body of its own; the host supplies those).
const fs = require('fs');
const html = fs.readFileSync('dist/tetherfall.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const links = (html.match(/<link [^>]*>/g) || []).join('\n');
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
fs.writeFileSync('dist/artifact.html', `${title}\n${links}\n${style}\n${body}`);
console.log('wrote dist/artifact.html');
