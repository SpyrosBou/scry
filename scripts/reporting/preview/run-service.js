'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Watches the reports directory and notifies the dev server when runs or templates change.

const RUN_FOLDER_PATTERN = /^run-\d{8}-\d{6}$/;

class ReportRunService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.reportsDir = options.reportsDir;
    this.latestRunFile = options.latestRunFile;
    this.templateWatchPatterns = options.templateWatchPatterns || [];
    this.templateWatcherOptions = options.templateWatcherOptions || {};
    this.fixedRunId = options.fixedRunId || null;
    this.logger = options.logger || console;

    this.dynamicRunInfo = null;
    this.runWatcher = null;
    this.reportsWatcher = null;
    this.templateWatcher = null;
    this.refreshTimer = null;
  }

  start() {
    const current = this.getRunInfo();
    if (current) {
      this._rebuildRunWatcher(current);
    }
    this._ensureReportsWatcher();
    this._ensureTemplateWatcher();
  }

  stop() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    const closers = [];
    if (this.runWatcher) {
      closers.push(this.runWatcher.close().catch(() => {}));
      this.runWatcher = null;
    }
    if (this.reportsWatcher) {
      closers.push(this.reportsWatcher.close().catch(() => {}));
      this.reportsWatcher = null;
    }
    if (this.templateWatcher) {
      closers.push(this.templateWatcher.close().catch(() => {}));
      this.templateWatcher = null;
    }
    return Promise.allSettled(closers);
  }

  getRunInfo() {
    if (this.fixedRunId) {
      if (!this.dynamicRunInfo) {
        this.dynamicRunInfo = this._buildRunInfo(this.fixedRunId);
        if (!this.dynamicRunInfo) {
          throw new Error(`Unable to find run "${this.fixedRunId}".`);
        }
      }
      return this.dynamicRunInfo;
    }

    if (this.dynamicRunInfo && !fs.existsSync(this.dynamicRunInfo.dataPath)) {
      this.dynamicRunInfo = null;
    }

    if (!this.dynamicRunInfo) {
      this.dynamicRunInfo = this._discoverLatestRun();
    }

    return this.dynamicRunInfo;
  }

  requestRefresh(reason) {
    if (this.fixedRunId) return;
    this._scheduleRefresh(reason || 'manual');
  }

  _discoverLatestRun() {
    if (!fs.existsSync(this.reportsDir)) {
      return null;
    }

    const latestRecord = this._safeJsonParse(this.latestRunFile);
    if (latestRecord?.runFolder) {
      const info = this._buildRunInfo(latestRecord.runFolder);
      if (info) return info;
    }

    try {
      const folders = fs
        .readdirSync(this.reportsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && RUN_FOLDER_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort();
      if (!folders.length) {
        return null;
      }
      return this._buildRunInfo(folders[folders.length - 1]);
    } catch (_error) {
      return null;
    }
  }

  _buildRunInfo(runId) {
    if (!runId) return null;
    const runDir = path.join(this.reportsDir, runId);
    const dataPath = path.join(runDir, 'data', 'run.json');
    if (!fs.existsSync(runDir) || !fs.existsSync(dataPath)) {
      return null;
    }
    return { id: runId, dir: runDir, dataPath };
  }

  _safeJsonParse(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  _ensureReportsWatcher() {
    if (this.fixedRunId || this.reportsWatcher) return;
    const watchTargets = [this.reportsDir];
    if (this.latestRunFile) {
      watchTargets.push(this.latestRunFile);
    }

    this.reportsWatcher = chokidar.watch(watchTargets, {
      ignoreInitial: true,
      depth: 1,
    });

    const queueRefresh = (event) => this._scheduleRefresh(event || 'run-detected');

    ['add', 'addDir', 'change', 'unlink', 'unlinkDir'].forEach((eventName) => {
      this.reportsWatcher.on(eventName, queueRefresh);
    });

    this.reportsWatcher.on('error', (error) => {
      this.logger.error(`[report-dev] Reports watcher error: ${error.message}`);
    });
  }

  _ensureTemplateWatcher() {
    if (this.templateWatcher || !this.templateWatchPatterns.length) return;
    this.templateWatcher = chokidar.watch(this.templateWatchPatterns, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 75,
      },
      ...this.templateWatcherOptions,
    });

    this.templateWatcher.on('all', (event, changedPath) => {
      const relativePath = path.relative(process.cwd(), changedPath);
      this.logger.log(`[report-dev] Template asset ${event}: ${relativePath}`);
      this.emit('template-changed', {
        event,
        path: changedPath,
      });
    });

    this.templateWatcher.on('error', (error) => {
      this.logger.error(`[report-dev] Template watcher error: ${error.message}`);
    });
  }

  _scheduleRefresh(reason) {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this._refreshRun(reason);
    }, 120);

    if (typeof this.refreshTimer.unref === 'function') {
      this.refreshTimer.unref();
    }
  }

  _refreshRun(reason) {
    const latest = this._discoverLatestRun();
    if (!latest) {
      if (this.dynamicRunInfo) {
        const removedId = this.dynamicRunInfo.id;
        this.dynamicRunInfo = null;
        this._rebuildRunWatcher(null);
        this.emit('run-changed', { runId: null, reason: reason || 'removed' });
        this.logger.log(`[report-dev] Run ${removedId} no longer available.`);
      }
      return;
    }

    if (!this.dynamicRunInfo || latest.id !== this.dynamicRunInfo.id) {
      const previous = this.dynamicRunInfo;
      this.dynamicRunInfo = latest;
      this._rebuildRunWatcher(latest);
      if (previous) {
        this.logger.log(`[report-dev] Detected new run: ${latest.id}`);
      }
      this.emit('run-changed', { runId: latest.id, reason: reason || 'updated' });
    }
  }

  _rebuildRunWatcher(runInfo) {
    if (this.runWatcher) {
      this.runWatcher.close().catch((error) => {
        this.logger.error(`[report-dev] Run watcher close error: ${error.message}`);
      });
      this.runWatcher = null;
    }

    if (!runInfo) return;

    this.runWatcher = chokidar.watch(runInfo.dir, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 100,
      },
    });

    const notifyChange = (event, filePath) => {
      this.emit('content-changed', {
        runId: runInfo.id,
        event,
        path: filePath ? path.relative(runInfo.dir, filePath) : null,
      });
    };

    this.runWatcher.on('add', (filePath) => notifyChange('add', filePath));
    this.runWatcher.on('change', (filePath) => notifyChange('change', filePath));
    this.runWatcher.on('unlink', (filePath) => notifyChange('unlink', filePath));
    this.runWatcher.on('error', (error) => {
      this.logger.error(`[report-dev] Run watcher error: ${error.message}`);
    });
  }
}

module.exports = ReportRunService;
