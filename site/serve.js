#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const sass = require('sass');

let openModule;
async function openInBrowser(url) {
  if (!openModule) {
    const mod = await import('open');
    openModule = mod.default || mod;
  }
  return openModule(url);
}

const args = minimist(process.argv.slice(2), {
  alias: { p: 'port', o: 'open' },
  boolean: ['open'],
  default: { port: process.env.SITE_PORT || 4400 },
});

const PORT = Number(args.port) || 4400;
const SITE_DIR = __dirname;
const STYLES_DIR = path.join(SITE_DIR, 'styles');
const SCSS_SOURCE = path.join(STYLES_DIR, 'landing.scss');
const CSS_TARGET = path.join(STYLES_DIR, 'landing.css');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

/* -- SSE clients for live reload -- */
const sseClients = new Set();

function broadcastReload() {
  for (const res of sseClients) {
    res.write('data: reload\n\n');
  }
}

/* -- SCSS compilation -- */
function compileStyles() {
  try {
    const result = sass.compile(SCSS_SOURCE, { style: 'expanded' });
    fs.writeFileSync(CSS_TARGET, `${result.css.trim()}\n`, 'utf8');
    console.log('\u2714 Styles recompiled');
    return true;
  } catch (error) {
    console.error(`\u2716 SCSS error: ${error.message}`);
    return false;
  }
}

/* -- HTTP server -- */
const server = http.createServer((req, res) => {
  /* SSE endpoint for live reload */
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(':\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(SITE_DIR, filePath);

  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    /* Inject live-reload script into HTML */
    if (ext === '.html') {
      const reloadScript = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;
      data = Buffer.from(data.toString().replace('</body>', `${reloadScript}\n</body>`));
    }

    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

/* -- File watcher -- */
async function startWatcher() {
  const { watch } = await import('chokidar');
  const watcher = watch(
    [
      path.join(SITE_DIR, '**', '*.html'),
      path.join(SITE_DIR, '**', '*.js'),
      path.join(STYLES_DIR, '**', '*.scss'),
    ],
    {
      ignoreInitial: true,
      ignored: (watchPath) => /landing\.css$/.test(watchPath),
    }
  );

  watcher.on('change', (changedPath) => {
    if (changedPath.endsWith('.scss')) {
      compileStyles();
    }
    broadcastReload();
  });
}

/* -- Start -- */
compileStyles();

server.listen(PORT, () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  Scry landing page preview\n  ${url}\n`);
  if (args.open) openInBrowser(url);
});

startWatcher();
