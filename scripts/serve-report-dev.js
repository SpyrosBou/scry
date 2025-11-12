#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
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
const TEMPLATE_ENTRY = path.join(__dirname, '..', 'utils', 'report-templates.js');
const TEMPLATE_CACHE_ROOTS = [
  TEMPLATE_ENTRY,
  path.join(__dirname, '..', 'utils', 'report-templates'),
  path.join(__dirname, '..', 'utils', 'reporting-utils.js'),
  path.join(__dirname, '..', 'utils', 'reporting-utils'),
];
const TEMPLATE_WATCH_PATTERNS = [
  TEMPLATE_ENTRY,
  path.join(__dirname, '..', 'utils', 'report-templates', '**', '*.js'),
  path.join(__dirname, '..', 'utils', 'reporting-utils.js'),
  path.join(__dirname, '..', 'styles', 'report', '**', '*.scss'),
];

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

const SSE_PATH = '/__report-dev/events';
const HEARTBEAT_INTERVAL = 25000;
const MAX_PORT_RETRIES = 10;
const PORT_RETRY_DELAY = 150;

const sseClients = new Set();
let runDirWatcher = null;
let reportsDirWatcher = null;
let runRefreshTimer = null;
let templateWatcher = null;

const fixedRunInfo = resolveFixedRun(args.run);
let dynamicRunInfo = fixedRunInfo || null;
let announcedRunId = fixedRunInfo ? fixedRunInfo.id : null;

function safeJsonParse(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function buildRunInfo(runId) {
  if (!runId) return null;
  const normalized = String(runId).trim();
  if (!normalized) return null;

  const runDir = path.join(REPORTS_DIR, normalized);
  const dataPath = path.join(runDir, 'data', 'run.json');
  if (!fs.existsSync(runDir) || !fs.existsSync(dataPath)) return null;
  return {
    id: normalized,
    dir: runDir,
    dataPath,
  };
}

function resolveFixedRun(runArgument) {
  if (!runArgument) return null;
  const info = buildRunInfo(runArgument);
  if (!info) {
    console.error(`[report-dev] Unable to find run "${runArgument}".`);
    process.exit(1);
  }
  return info;
}

function discoverLatestRun() {
  const latestRecord = safeJsonParse(LATEST_RUN_FILE);
  if (latestRecord && latestRecord.runFolder) {
    const info = buildRunInfo(latestRecord.runFolder);
    if (info) return info;
  }

  try {
    const entries = fs
      .readdirSync(REPORTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^run-\d{8}-\d{6}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    if (entries.length === 0) {
      return null;
    }

    return buildRunInfo(entries[entries.length - 1]);
  } catch (_error) {
    return null;
  }
}

function resolveRunInfo() {
  if (fixedRunInfo) return fixedRunInfo;

  if (dynamicRunInfo && !fs.existsSync(dynamicRunInfo.dataPath)) {
    dynamicRunInfo = null;
  }

  if (!dynamicRunInfo) {
    dynamicRunInfo = discoverLatestRun();
  }

  return dynamicRunInfo;
}

function scheduleRunRefresh(reason) {
  if (fixedRunInfo) return;
  if (runRefreshTimer) return;

  runRefreshTimer = setTimeout(() => {
    runRefreshTimer = null;
    const latest = discoverLatestRun();

    if (!latest) {
      if (dynamicRunInfo) {
        const removedId = dynamicRunInfo.id;
        dynamicRunInfo = null;
        rebuildRunWatcher(null);
        broadcast('run-changed', { runId: null, reason: reason || 'removed' });
        console.log(`[report-dev] Run ${removedId} no longer available.`);
      }
      return;
    }

    if (!dynamicRunInfo || latest.id !== dynamicRunInfo.id) {
      const hadRun = Boolean(dynamicRunInfo);
      dynamicRunInfo = latest;
      rebuildRunWatcher(latest);
      if (hadRun) {
        console.log(`[report-dev] Detected new run: ${latest.id}`);
      }
      broadcast('run-changed', { runId: latest.id, reason: reason || 'updated' });
    }
  }, 120);

  if (typeof runRefreshTimer.unref === 'function') {
    runRefreshTimer.unref();
  }
}

function rebuildRunWatcher(runInfo) {
  if (runDirWatcher) {
    runDirWatcher
      .close()
      .catch((error) => console.error(`[report-dev] Run watcher close error: ${error.message}`));
    runDirWatcher = null;
  }

  if (!runInfo) return;

  runDirWatcher = chokidar.watch(runInfo.dir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 250,
      pollInterval: 100,
    },
  });

  const notifyChange = (event, filePath) => {
    broadcast('content-changed', {
      runId: runInfo.id,
      event,
      path: filePath ? path.relative(runInfo.dir, filePath) : null,
    });
  };

  runDirWatcher.on('add', (filePath) => notifyChange('add', filePath));
  runDirWatcher.on('change', (filePath) => notifyChange('change', filePath));
  runDirWatcher.on('unlink', (filePath) => notifyChange('unlink', filePath));
  runDirWatcher.on('error', (error) => {
    console.error(`[report-dev] Run watcher error: ${error.message}`);
  });
}

function ensureReportsWatcher() {
  if (fixedRunInfo || reportsDirWatcher) return;

  reportsDirWatcher = chokidar.watch([REPORTS_DIR, LATEST_RUN_FILE], {
    ignoreInitial: true,
    depth: 1,
  });

  const queueRefresh = () => scheduleRunRefresh('run-detected');

  ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].forEach((eventName) => {
    reportsDirWatcher.on(eventName, queueRefresh);
  });

  reportsDirWatcher.on('error', (error) => {
    console.error(`[report-dev] Reports watcher error: ${error.message}`);
  });
}

function ensureTemplateWatcher() {
  if (templateWatcher) return;

  templateWatcher = chokidar.watch(TEMPLATE_WATCH_PATTERNS, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 75,
    },
    ignored: (watchPath) => /report-styles\.css$/i.test(watchPath),
  });

  templateWatcher.on('all', (event, changedPath) => {
    const relativePath = path.relative(process.cwd(), changedPath);
    console.log(`[report-dev] Template asset ${event}: ${relativePath}`);
    invalidateTemplateCache();
    broadcast('template-changed', {
      event,
      path: relativePath,
    });
  });

  templateWatcher.on('error', (error) => {
    console.error(`[report-dev] Template watcher error: ${error.message}`);
  });
}

function renderReportHtmlFromData(runInfo) {
  invalidateTemplateCache();
  const { renderReportHtml } = require(TEMPLATE_ENTRY);
  const runData = safeJsonParse(runInfo.dataPath);
  if (!runData) {
    throw new Error(`Unable to load run data from ${runInfo.dataPath}`);
  }
  return renderReportHtml(runData);
}

function invalidateTemplateCache() {
  const cachedPaths = Object.keys(require.cache);
  cachedPaths.forEach((modulePath) => {
    const normalizedPath = modulePath.replace(/\\/g, '/');
    const shouldInvalidate = TEMPLATE_CACHE_ROOTS.some((root) => {
      const normalizedRoot = root.replace(/\\/g, '/');
      return (
        normalizedPath === normalizedRoot ||
        normalizedPath.startsWith(`${normalizedRoot.replace(/\.js$/, '')}/`)
      );
    });
    if (shouldInvalidate) {
      delete require.cache[modulePath];
    }
  });
}

function injectLiveReload(html, runInfo) {
  if (!runInfo) return html;

  const snippet = `<script id="report-dev-live-reload">
(() => {
  const RUN_ID = ${JSON.stringify(runInfo.id)};
  let reconnectTimer = null;
  const connect = () => {
    const source = new EventSource('${SSE_PATH}');
    let reloadScheduled = false;

    const scheduleReload = () => {
      if (reloadScheduled) return;
      reloadScheduled = true;
      setTimeout(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('__refresh', Date.now().toString(36));
          window.location.replace(url.toString());
        } catch (_error) {
          window.location.reload();
        }
      }, 60);
    };

    const readPayload = (event) => {
      if (!event || !event.data) return {};
      try {
        return JSON.parse(event.data);
      } catch (_error) {
        return {};
      }
    };

    source.addEventListener('hydrate', (event) => {
      const payload = readPayload(event);
      if (payload.runId && payload.runId !== RUN_ID) {
        scheduleReload();
      }
    });
    source.addEventListener('run-changed', () => scheduleReload());
    source.addEventListener('content-changed', () => scheduleReload());
    source.addEventListener('template-changed', () => scheduleReload());
    source.onerror = () => {
      source.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 1500);
    };
  };

  connect();
})();
</script>`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${snippet}\n</body>`);
  }

  return `${html}\n${snippet}`;
}

function respondWithError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function serveStaticAsset(res, runInfo, urlPath) {
  const sanitized = urlPath.replace(/^\/+/, '');
  if (!sanitized) {
    respondWithError(res, 404, 'Not Found');
    return;
  }

  const filePath = path.normalize(path.join(runInfo.dir, sanitized));
  if (!filePath.startsWith(runInfo.dir)) {
    respondWithError(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      respondWithError(res, 404, 'Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readError, buffer) => {
      if (readError) {
        respondWithError(res, readError.code === 'ENOENT' ? 404 : 500, 'Server Error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
      });
      res.end(buffer);
    });
  });
}

function broadcast(eventName, payload) {
  if (sseClients.size === 0) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(message);
      continue;
    } catch (_error) {
      if (typeof client.res.destroy === 'function') {
        client.res.destroy();
      }
    }
    sseClients.delete(client);
  }
}

function handleEventStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  const client = { res };
  sseClients.add(client);

  const runInfo = resolveRunInfo();
  if (runInfo) {
    res.write(`event: hydrate\n`);
    res.write(`data: ${JSON.stringify({ runId: runInfo.id })}\n\n`);
  }

  if (!fixedRunInfo) {
    scheduleRunRefresh('sse-connect');
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: ping\ndata: {}\n\n`);
    } catch (_error) {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_INTERVAL);
  heartbeat.unref();

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && requestUrl.pathname === SSE_PATH) {
    handleEventStream(req, res);
    return;
  }

  const runInfo = resolveRunInfo();
  if (!runInfo) {
    respondWithError(
      res,
      500,
      'No reports found under ./reports/. Run a test to generate a report first.'
    );
    return;
  }

  if (!fixedRunInfo) {
    scheduleRunRefresh('request-sync');
  }

  if (runInfo.id !== announcedRunId) {
    announcedRunId = runInfo.id;
    console.log(`[report-dev] Now serving run: ${runInfo.id}`);
  }

  if (
    requestUrl.pathname === '/' ||
    requestUrl.pathname === '/index.html' ||
    requestUrl.pathname === '/report.html'
  ) {
    try {
      const html = renderReportHtmlFromData(runInfo);
      const withRuntime = injectLiveReload(html, runInfo);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(withRuntime);
    } catch (error) {
      respondWithError(res, 500, `Failed to render report: ${error.message}`);
    }
    return;
  }

  serveStaticAsset(res, runInfo, requestUrl.pathname);
});

function closeAllWatchers() {
  const closers = [];
  if (runDirWatcher) {
    closers.push(runDirWatcher.close());
    runDirWatcher = null;
  }
  if (reportsDirWatcher) {
    closers.push(reportsDirWatcher.close());
    reportsDirWatcher = null;
  }
  if (templateWatcher) {
    closers.push(templateWatcher.close());
    templateWatcher = null;
  }
  return Promise.allSettled(closers);
}

function closeAllClients() {
  for (const client of sseClients) {
    try {
      client.res.end();
    } catch (_error) {
      if (typeof client.res.destroy === 'function') {
        client.res.destroy();
      }
    }
  }
  sseClients.clear();
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[report-dev] Shutting down preview server...');

  closeAllClients();
  closeAllWatchers().finally(() => {
    server.close(() => {
      process.exit(code);
    });
  });

  const forcedExit = setTimeout(() => {
    process.exit(code);
  }, 1500);
  forcedExit.unref();
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(0));
});

let currentPort = PORT;
let portRetryCount = 0;
let browserOpened = false;

const handleListening = () => {
  const address = server.address();
  if (address && typeof address === 'object' && address.port) {
    currentPort = address.port;
  }
  portRetryCount = 0;

  const runInfo = resolveRunInfo();
  console.log('[report-dev] Report preview ready.');
  if (runInfo) {
    announcedRunId = runInfo.id;
    console.log(`[report-dev] Serving run: ${runInfo.id}`);
  } else {
    console.log(
      '[report-dev] No report detected yet. Generate a run and refresh when it finishes.'
    );
  }
  console.log(`[report-dev] Visit http://127.0.0.1:${currentPort}/`);
  if (args.open && !browserOpened) {
    browserOpened = true;
    openInBrowser(`http://127.0.0.1:${currentPort}/`).catch(() => {});
  }
};

const startListening = (port) => {
  currentPort = port;
  server.listen(port);
};

server.on('listening', handleListening);

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    if (portRetryCount >= MAX_PORT_RETRIES) {
      console.error(
        `[report-dev] Port ${currentPort} is unavailable and no alternative ports were free after ${MAX_PORT_RETRIES} retries.`
      );
      shutdown(1);
      return;
    }
    const nextPort = currentPort + 1;
    portRetryCount += 1;
    console.warn(
      `[report-dev] Port ${currentPort} unavailable, attempting to listen on ${nextPort}...`
    );
    setTimeout(() => startListening(nextPort), PORT_RETRY_DELAY);
    return;
  }

  console.error(`[report-dev] Server error: ${error.message}`);
});

const initialRun = resolveRunInfo();
if (initialRun) {
  rebuildRunWatcher(initialRun);
}
ensureReportsWatcher();
ensureTemplateWatcher();

startListening(PORT);
