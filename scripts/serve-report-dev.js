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

const fixedRunInfo = resolveFixedRun(args.run);
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
  return fixedRunInfo || discoverLatestRun();
}

function renderReportHtmlFromData(runInfo) {
  const templatesPath = path.join(__dirname, '..', 'utils', 'report-templates.js');
  delete require.cache[templatesPath];
  const { renderReportHtml } = require(templatesPath);
  const runData = safeJsonParse(runInfo.dataPath);
  if (!runData) {
    throw new Error(`Unable to load run data from ${runInfo.dataPath}`);
  }
  return renderReportHtml(runData);
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
      res.writeHead(200, { 'Content-Type': type });
      res.end(buffer);
    });
  });
}

const server = http.createServer((req, res) => {
  const runInfo = resolveRunInfo();
  if (!runInfo) {
    respondWithError(
      res,
      500,
      'No reports found under ./reports/. Run a test to generate a report first.'
    );
    return;
  }

  if (!fixedRunInfo && runInfo.id !== announcedRunId) {
    announcedRunId = runInfo.id;
    console.log(`[report-dev] Now serving run: ${runInfo.id}`);
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/report.html') {
    try {
      const html = renderReportHtmlFromData(runInfo);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      respondWithError(res, 500, `Failed to render report: ${error.message}`);
    }
    return;
  }

  serveStaticAsset(res, runInfo, url.pathname);
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[report-dev] Shutting down preview server...');
  server.close(() => {
    process.exit(code);
  });

  const forcedExit = setTimeout(() => {
    process.exit(code);
  }, 1500);
  forcedExit.unref();
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(0));
});

server.on('error', (error) => {
  console.error(`[report-dev] Server error: ${error.message}`);
});

server.listen(PORT, () => {
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
  console.log(`[report-dev] Visit http://127.0.0.1:${PORT}/`);
  if (args.open) {
    openInBrowser(`http://127.0.0.1:${PORT}/`).catch(() => {});
  }
});
