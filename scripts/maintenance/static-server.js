#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

// Lightweight HTTP server used in CI smoke tests to serve fixtures/static-site.

const root = path.join(process.cwd(), 'fixtures', 'static-site');
const port = process.env.PORT || 8080;

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.html' ? 'text/html' : 'text/plain';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let file = 'index.html';
  if (url.pathname === '/about') file = 'about.html';
  if (url.pathname === '/contact') file = 'contact.html';
  const filePath = path.join(root, file);
  serveFile(res, filePath);
});

server.listen(port, () => {
  console.log(`Static smoke server listening on http://127.0.0.1:${port}`);
});
