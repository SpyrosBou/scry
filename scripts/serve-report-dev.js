#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
let openModule;
async function openInBrowser(url) {
  if (!openModule) {
    const mod = await import('open');
    openModule = mod.default || mod;
  }
  return openModule(url);
}

const args = minimist(process.argv.slice(2), {
  alias: {
    p: 'port',
    o: 'open',
    r: 'run',
  },
  boolean: ['open'],
  default: {
    port: process.env.REPORT_PORT || 4173,
  },
});

const PORT = Number(args.port) || 4173;
const REPORTS_DIR = path.join(process.cwd(), 'reports');
const LATEST_RUN_FILE = path.join(REPORTS_DIR, 'latest-run.json');
const WATCH_TARGETS = [
  path.join(__dirname, '..', 'utils', 'report-templates.js'),
  path.join(__dirname, '..', 'docs', 'mocks', 'report-styles.scss'),
  LATEST_RUN_FILE,
];

const clients = new Set();
let reloadTimer = null;
let keepAliveTimer = null;
let currentRunInfo = null;
let runWatchers = [];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function safeJsonParse(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function resolveLatestRun() {
  if (args.run) {
    return buildRunInfo(args.run);
  }

  const latestRecord = safeJsonParse(LATEST_RUN_FILE);
  if (latestRecord && latestRecord.runFolder) {
    const info = buildRunInfo(latestRecord.runFolder);
    if (info) return info;
  }

  // Fallback: pick the newest run-* directory lexicographically
  const candidates =
    fs
      .readdirSync(REPORTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^run-\d{8}-\d{6}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort() || [];

  if (candidates.length === 0) {
    return null;
  }

  return buildRunInfo(candidates[candidates.length - 1]);
}

function buildRunInfo(runId) {
  const runDir = path.join(REPORTS_DIR, runId);
  const dataPath = path.join(runDir, 'data', 'run.json');
  if (!fs.existsSync(runDir) || !fs.existsSync(dataPath)) return null;
  return {
    id: runId,
    dir: runDir,
    dataPath,
  };
}

function injectLiveReload(html) {
  const snippet = `
<script>
(function () {
  const source = new EventSource('/__livereload');
  source.addEventListener('reload', function () {
    console.debug('[report-dev] reload event received');
    window.location.reload();
  });
})();
</script>`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${snippet}\n</body>`);
  }
  return `${html}\n${snippet}`;
}

function renderReportHtmlFromData(runInfo) {
  const templatesPath = path.join(__dirname, '..', 'utils', 'report-templates.js');
  delete require.cache[templatesPath];
  const { renderReportHtml } = require(templatesPath);
  const runData = safeJsonParse(runInfo.dataPath);
  if (!runData) {
    throw new Error(`Unable to load run data from ${runInfo.dataPath}`);
  }
  const html = renderReportHtml(runData);
  return injectLiveReload(html);
}

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, buffer) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(buffer);
  });
}

function broadcastReload(reason = 'file change') {
  if (reloadTimer) return;
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    console.log(`[report-dev] Reload triggered (${reason}).`);
    const payload = JSON.stringify({ reason, ts: Date.now() });
    for (const res of clients) {
      try {
        res.write(`event: reload\ndata: ${payload}\n\n`);
      } catch (_error) {
        // Connection might already be closed.
      }
    }
  }, 60);
}

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    for (const res of clients) {
      try {
        res.write('event: heartbeat\ndata: ping\n\n');
      } catch (_error) {
        // ignore
      }
    }
  }, 15000);
}

function clearRunWatchers() {
  runWatchers.forEach((watcher) => watcher.close());
  runWatchers = [];
}

function watchRunFiles(runInfo) {
  clearRunWatchers();
  if (!runInfo) return;
  const targets = [runInfo.dataPath, path.join(runInfo.dir, 'report.html')];

  targets.forEach((target) => {
    try {
      const watcher = fs.watch(target, { persistent: true }, () => {
        broadcastReload(path.basename(target));
      });
      runWatchers.push(watcher);
    } catch (_error) {
      console.warn(`[report-dev] Unable to watch ${target}: ${_error.message}`);
    }
  });
}

function configureWatchers() {
  WATCH_TARGETS.forEach((target) => {
    try {
      fs.watch(target, { persistent: true }, () => {
        // If latest-run.json changed, refresh run info.
        if (target === LATEST_RUN_FILE) {
          const latest = resolveLatestRun();
          if (latest && (!currentRunInfo || latest.id !== currentRunInfo.id)) {
            currentRunInfo = latest;
            watchRunFiles(currentRunInfo);
          }
        }
        broadcastReload(path.basename(target));
      });
    } catch (_error) {
      console.warn(`[report-dev] Unable to watch ${target}: ${_error.message}`);
    }
  });
}

const server = http.createServer((req, res) => {
  if (!currentRunInfo) {
    currentRunInfo = resolveLatestRun();
    if (currentRunInfo) {
      watchRunFiles(currentRunInfo);
    }
  }

  if (!currentRunInfo) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('No reports found under ./reports/. Run a test to generate a report first.');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
    });
    startKeepAlive();
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = renderReportHtmlFromData(currentRunInfo);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (_error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Failed to render report: ${_error.message}`);
    }
    return;
  }

  // Serve static assets relative to the current run directory
  const assetPath = path.normalize(path.join(currentRunInfo.dir, url.pathname.replace(/^\/+/, '')));

  if (!assetPath.startsWith(currentRunInfo.dir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  serveStaticFile(res, assetPath);
});

server.listen(PORT, () => {
  currentRunInfo = resolveLatestRun();
  watchRunFiles(currentRunInfo);
  configureWatchers();
  console.log('[report-dev] Live report server ready.');
  if (currentRunInfo) {
    console.log(`[report-dev] Serving run: ${currentRunInfo.id}`);
  } else {
    console.log('[report-dev] No report detected yet. Waiting for a run to complete...');
  }
  console.log(`[report-dev] Visit http://127.0.0.1:${PORT}/`);
  if (args.open) {
    openInBrowser(`http://127.0.0.1:${PORT}/`).catch(() => {});
  }
});
