#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const ReportRunService = require('./preview/run-service');
const { renderReportFromDataPath } = require('./run-utils');

// Serves the latest HTML report with live reload for rapid UI iteration.

// Environment Variables:
// - REPORT_PORT: override the default preview port (defaults to 4173).
// - REPORT_BROWSER / REPORT_BROWSER_ARGS: forwarded to the `open` package when auto-opening the preview.

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
const TEMPLATE_ENTRY = path.join(__dirname, '..', '..', 'utils', 'report-templates.js');
const TEMPLATE_CACHE_ROOTS = [
  TEMPLATE_ENTRY,
  path.join(__dirname, '..', '..', 'utils', 'report-templates'),
  path.join(__dirname, '..', '..', 'utils', 'reporting-utils.js'),
  path.join(__dirname, '..', '..', 'utils', 'reporting-utils'),
];
const TEMPLATE_WATCH_PATTERNS = [
  TEMPLATE_ENTRY,
  path.join(__dirname, '..', '..', 'utils', 'report-templates', '**', '*.js'),
  path.join(__dirname, '..', '..', 'utils', 'reporting-utils.js'),
  path.join(__dirname, '..', '..', 'styles', 'report', '**', '*.scss'),
];
const TEMPLATE_WATCHER_OPTIONS = {
  ignored: (watchPath) => /report-styles\.css$/i.test(watchPath),
};

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
let announcedRunId = null;
let shuttingDown = false;
let browserOpened = false;
let currentPort = PORT;
let runService;

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

function renderReportHtmlFromData(runInfo) {
  invalidateTemplateCache();
  return renderReportFromDataPath(runInfo.dataPath);
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

  const runInfo = runService.getRunInfo();
  if (runInfo) {
    res.write('event: hydrate\n');
    res.write(`data: ${JSON.stringify({ runId: runInfo.id })}\n\n`);
  }

  runService.requestRefresh('sse-connect');

  const heartbeat = setInterval(() => {
    try {
      res.write('event: ping\ndata: {}\n\n');
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

  const runInfo = runService.getRunInfo();
  if (!runInfo) {
    respondWithError(
      res,
      500,
      'No reports found under ./reports/. Run a test to generate a report first.'
    );
    return;
  }

  runService.requestRefresh('request-sync');

  if (runInfo.id !== announcedRunId) {
    announcedRunId = runInfo.id;
    console.log(`[report-dev] Serving run: ${runInfo.id}`);
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

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[report-dev] Shutting down preview server...');

  closeAllClients();
  runService
    .stop()
    .catch(() => {})
    .finally(() => {
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

let portRetryCount = 0;

const handleListening = () => {
  const address = server.address();
  if (address && typeof address === 'object' && address.port) {
    currentPort = address.port;
  }
  portRetryCount = 0;

  const runInfo = runService.getRunInfo();
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
    setTimeout(() => server.listen(nextPort), PORT_RETRY_DELAY);
    return;
  }

  console.error(`[report-dev] Server error: ${error.message}`);
});

runService = new ReportRunService({
  reportsDir: REPORTS_DIR,
  latestRunFile: LATEST_RUN_FILE,
  templateWatchPatterns: TEMPLATE_WATCH_PATTERNS,
  templateWatcherOptions: TEMPLATE_WATCHER_OPTIONS,
  fixedRunId: args.run,
  logger: console,
});

runService.on('run-changed', (payload) => {
  if (payload.runId && payload.runId !== announcedRunId) {
    announcedRunId = payload.runId;
    console.log(`[report-dev] Serving run: ${payload.runId}`);
  }
  broadcast('run-changed', payload);
});
runService.on('content-changed', (payload) => broadcast('content-changed', payload));
runService.on('template-changed', (payload) => {
  invalidateTemplateCache();
  broadcast('template-changed', payload);
});

try {
  runService.start();
} catch (error) {
  console.error(`[report-dev] ${error.message}`);
  process.exit(1);
}

const initialRun = runService.getRunInfo();
if (initialRun) {
  announcedRunId = initialRun.id;
}

server.listen(PORT);
