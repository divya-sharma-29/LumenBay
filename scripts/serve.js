// Tiny static server for the page (no dependencies). Run with:  npm run dev
// Optional port:  PORT=8080 npm run dev
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'src');
const port = +process.env.PORT || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

function createServer() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const page = url === '/' ? 'intro.html' : url === '/simulator.html' ? 'index.html' : url;
    const file = path.normalize(path.join(root, page));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
}

if (require.main === module) {
  createServer().listen(port, () => console.log('Lumen Bay is running at http://localhost:' + port + '  (Ctrl+C to stop)'));
}

module.exports = createServer;
