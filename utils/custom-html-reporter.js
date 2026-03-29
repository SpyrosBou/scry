const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash } = require('node:crypto');
const {
  renderReportHtml,
  formatBytes,
  renderSchemaSummariesMarkdown,
  renderRunSummariesMarkdown,
} = require('./report-templates');
const { SCHEMA_ID: SUMMARY_SCHEMA_ID } = require('./report-schema');

const ATTACHMENT_DIR = path.posix.join('data', 'attachments');
const CONTENT_TYPE_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
};
const DEFAULT_IMAGE_ATTACHMENT_LIMIT = 20;

const inferAttachmentExtension = (contentType, fallbackName = '') => {
  if (CONTENT_TYPE_EXTENSIONS[contentType]) {
    return CONTENT_TYPE_EXTENSIONS[contentType];
  }
  if (fallbackName) {
    const fromName = path.extname(fallbackName);
    if (fromName) return fromName;
  }
  if (contentType && contentType.includes('/')) {
    const subtype = contentType.split('/')[1]?.split('+')[0];
    if (subtype) return `.${subtype}`;
  }
  return '';
};

const normaliseImageAttachmentLimit = (value) => {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_IMAGE_ATTACHMENT_LIMIT;
  }
  if (value === false) return Infinity;
  const raw = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isFinite(raw)) {
    if (raw <= 0) return Infinity;
    return Math.max(1, Math.floor(raw));
  }
  const normalised = String(value).trim().toLowerCase();
  if (['infinite', 'infinity', 'all', 'unlimited'].includes(normalised)) {
    return Infinity;
  }
  const parsed = Number(normalised);
  if (Number.isFinite(parsed)) {
    if (parsed <= 0) return Infinity;
    return Math.max(1, Math.floor(parsed));
  }
  return DEFAULT_IMAGE_ATTACHMENT_LIMIT;
};

const DEFAULT_INLINE_LIMIT = 8 * 1024 * 1024; // 8 MB
const DEFAULT_MAX_TEXT_LENGTH = 200_000; // characters

const STATUS_KEYS = ['passed', 'failed', 'skipped', 'timedOut', 'interrupted', 'unknown'];

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

const formatDuration = (ms) => {
  if (!Number.isFinite(ms)) return null;
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
};

const formatDateTime = (value) => {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date?.getTime?.())) return value;
  return date.toLocaleString();
};

class CustomHtmlReporter {
  constructor(options = {}) {
    this.options = {
      outputFolder: options.outputFolder || 'reports',
      reportFileName: options.reportFileName || 'report.html',
      inlineLimitBytes: options.inlineLimitBytes ?? DEFAULT_INLINE_LIMIT,
      maxTextLength: options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
      includeAttachments: options.includeAttachments !== false,
    };

    this.runId = options.runId || this.generateRunId();
    this.testEntries = new Map();
    this.projectSet = new Set();
    this.orderCounter = 0;
    this.pendingAssets = [];
    this.assetCounter = 0;
    this.imageAttachmentLimit = normaliseImageAttachmentLimit(
      options.imageAttachmentLimit ?? process.env.REPORT_IMAGE_LIMIT
    );
  }

  scheduleAttachmentAsset({ name, contentType, sourcePath, buffer }) {
    const extension = inferAttachmentExtension(contentType, name);
    const safeBase = slugify(name).slice(0, 40) || 'attachment';
    const fileName = `${safeBase}-${this.assetCounter++}${extension}`.replace(/\.+$/, '');
    const relativePath = path.posix.join(ATTACHMENT_DIR, fileName);
    this.pendingAssets.push({
      relativePath,
      sourcePath: sourcePath || null,
      buffer: buffer || null,
    });
    return relativePath;
  }

  generateRunId() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    return `run-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
      now.getMinutes()
    )}${pad(now.getSeconds())}`;
  }

  onBegin(config, suite) {
    this.startTime = new Date();
    this.config = config;
    this.suite = suite;
    this.totalTestsPlanned = suite.allTests().length;
  }

  onTestEnd(test, result) {
    const key = test.id;
    let entry = this.testEntries.get(key);
    if (!entry) {
      entry = {
        testId: key,
        title: test.title,
        titlePath: test.titlePath(),
        location: test.location,
        projectName: test.parent?.project()?.name || result.projectName || 'default',
        annotations: test.annotations || [],
        tags: test.tags || [],
        attempts: [],
        order: this.orderCounter++,
        durationMs: 0,
      };
      this.testEntries.set(key, entry);
    }

    entry.expectedStatus = test.expectedStatus;
    entry.timeout = test.timeout;
    entry.durationMs += result.duration || 0;
    entry.retries = Math.max(entry.retries || 0, result.retry || 0);
    entry.outcome = result.status;

    const processedAttachments = this.processAttachments(result.attachments || []);

    const attempt = {
      status: result.status || 'unknown',
      startTime: result.startTime ? new Date(result.startTime).toISOString() : null,
      startTimeFriendly: result.startTime ? formatDateTime(result.startTime) : null,
      durationMs: result.duration || 0,
      durationFriendly: formatDuration(result.duration || 0),
      attachments: processedAttachments.attachments,
      summaries: processedAttachments.summaries,
      schemaSummaries: processedAttachments.schemaSummaries,
      stdout: (result.stdout || []).map((entry) => this.normaliseStd(entry)),
      stderr: (result.stderr || []).map((entry) => this.normaliseStd(entry)),
      errors: this.normaliseErrors(
        Array.isArray(result.errors) && result.errors.length > 0
          ? result.errors
          : result.error
            ? [result.error]
            : []
      ),
      workerIndex: result.workerIndex,
    };

    entry.attempts.push(attempt);

    if (processedAttachments.summaries.length > 0) {
      entry.summaryBlocks = processedAttachments.summaries;
    }

    if (processedAttachments.schemaSummaries.length > 0) {
      entry.schemaSummaries = (entry.schemaSummaries || []).concat(
        processedAttachments.schemaSummaries
      );
    }

    entry.stdout = (entry.stdout || []).concat(attempt.stdout);
    entry.stderr = (entry.stderr || []).concat(attempt.stderr);
    entry.errors = (entry.errors || []).concat(attempt.errors);

    this.projectSet.add(entry.projectName);
  }

  onEnd() {
    this.endTime = new Date();
    try {
      const runData = this.buildRunData();
      this.writeOutputs(runData);
    } catch (error) {
      console.error('❌ Failed to generate custom HTML report:', error);
      throw error;
    }
  }

  normaliseStd(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry;
    if (Buffer.isBuffer(entry)) return entry.toString('utf8');
    if (typeof entry === 'object') {
      if (entry.text) return entry.text;
      if (entry.buffer) {
        try {
          return Buffer.from(entry.buffer).toString('utf8');
        } catch (_error) {
          return String(entry.buffer);
        }
      }
    }
    return String(entry);
  }

  normaliseErrors(errors) {
    return (errors || []).map((error) => ({
      message: error?.message || error?.value || 'Error',
      stack: error?.stack || error?.stackTrace || '',
    }));
  }

  processAttachments(attachments) {
    if (!this.options.includeAttachments) {
      return { attachments: [], summaries: [], schemaSummaries: [] };
    }

    const processed = [];
    const summaries = [];
    const schemaSummaries = [];
    const limit = this.imageAttachmentLimit;
    const enforceLimit = Number.isFinite(limit);
    let imageCount = 0;

    for (const attachment of attachments) {
      const name = attachment?.name || 'attachment';
      const contentType = attachment?.contentType || 'application/octet-stream';
      const attachmentPath = attachment?.path;
      let sourcePath = attachmentPath && fs.existsSync(attachmentPath) ? attachmentPath : null;
      let buffer = null;
      let size = 0;
      let errorMessage = null;

      const isSummaryArtifact =
        typeof name === 'string' && /\.summary(?:-truncated)?\.(html|md|txt)$/i.test(name);
      if (isSummaryArtifact) {
        continue;
      }

      if (attachment?.body) {
        buffer = Buffer.isBuffer(attachment.body) ? attachment.body : Buffer.from(attachment.body);
        size = buffer.length;
      } else if (sourcePath) {
        try {
          const stats = fs.statSync(sourcePath);
          size = stats.size;
        } catch (error) {
          errorMessage = `Unable to stat attachment ${name}: ${error.message}`;
          sourcePath = null;
        }
      }

      const ensureBuffer = () => {
        if (buffer) return buffer;
        if (!sourcePath) return null;
        try {
          buffer = fs.readFileSync(sourcePath);
          size = buffer.length;
        } catch (error) {
          errorMessage = `Unable to read attachment ${name}: ${error.message}`;
          buffer = null;
        }
        return buffer;
      };

      if (contentType === 'application/json') {
        const jsonBuffer = ensureBuffer();
        if (jsonBuffer) {
          try {
            const parsed = JSON.parse(jsonBuffer.toString('utf8'));
            if (parsed?.schema === SUMMARY_SCHEMA_ID) {
              schemaSummaries.push(parsed);
              continue;
            }
            if (parsed?.type === 'custom-report-summary') {
              summaries.push({
                baseName: parsed.baseName || name.replace(/\.summary\.json$/, ''),
                title: parsed.title || parsed.baseName || name,
                html: parsed.htmlBody || null,
                markdown: parsed.markdown || null,
                setDescription: Boolean(parsed.setDescription),
                createdAt: parsed.createdAt || null,
              });
              continue;
            }
          } catch (_error) {
            // fall through and treat as regular attachment
          }
        }
      }

      const attachmentEntry = {
        name,
        contentType,
        size,
        error: errorMessage,
      };

      if (!buffer && !sourcePath) {
        attachmentEntry.omitted = true;
        attachmentEntry.reason = errorMessage || 'Attachment data unavailable.';
        processed.push(attachmentEntry);
        continue;
      }

      if (contentType.startsWith('image/')) {
        if (enforceLimit && imageCount >= limit) {
          attachmentEntry.omitted = true;
          attachmentEntry.reason = `Screenshot omitted; reached per-test cap of ${limit}.`;
        } else {
          imageCount += 1;
          const relativePath = this.scheduleAttachmentAsset({
            name,
            contentType,
            sourcePath,
            buffer: sourcePath ? null : ensureBuffer(),
          });
          attachmentEntry.assetPath = relativePath;
        }
      } else if (contentType.startsWith('text/')) {
        const textBuffer = ensureBuffer();
        if (!textBuffer) {
          attachmentEntry.omitted = true;
          attachmentEntry.reason = errorMessage || 'Attachment data unavailable.';
          processed.push(attachmentEntry);
          continue;
        }
        let text = textBuffer.toString('utf8');
        let truncated = false;
        if (text.length > this.options.maxTextLength) {
          text = `${text.slice(0, this.options.maxTextLength)}\n… (truncated)`;
          truncated = true;
        }
        attachmentEntry.text = text;
        attachmentEntry.truncated = truncated;
        if (contentType === 'text/html') {
          attachmentEntry.html = text;
        }
      } else if (contentType === 'application/json') {
        const jsonBuffer = ensureBuffer();
        if (!jsonBuffer) {
          attachmentEntry.omitted = true;
          attachmentEntry.reason = errorMessage || 'Attachment data unavailable.';
          processed.push(attachmentEntry);
          continue;
        }
        let text = jsonBuffer.toString('utf8');
        let truncated = false;
        if (text.length > this.options.maxTextLength) {
          text = `${text.slice(0, this.options.maxTextLength)}\n… (truncated)`;
          truncated = true;
        }
        attachmentEntry.text = text;
        attachmentEntry.truncated = truncated;
      } else if (/zip|tar/.test(contentType) || contentType === 'video/webm') {
        attachmentEntry.omitted = true;
        attachmentEntry.reason = `Attachment (${formatBytes(size)}) not embedded (type ${contentType}).`;
      } else {
        const relativePath = this.scheduleAttachmentAsset({
          name,
          contentType,
          sourcePath,
          buffer: sourcePath ? null : ensureBuffer(),
        });
        attachmentEntry.assetPath = relativePath;
      }

      processed.push(attachmentEntry);
    }

    return { attachments: processed, summaries, schemaSummaries };
  }

  buildRunData() {
    const startedAt = this.startTime?.toISOString?.();
    const completedAt = this.endTime?.toISOString?.();
    const durationMs = this.endTime && this.startTime ? this.endTime - this.startTime : null;

    const serialisedTests = Array.from(this.testEntries.values())
      .sort((a, b) => a.order - b.order)
      .map((entry) => this.serialiseTest(entry));

    const summaryByKey = new Map();
    for (const test of serialisedTests) {
      if (!Array.isArray(test.summaryBlocks) || test.summaryBlocks.length === 0) continue;
      test.summaryBlocks.forEach((block, index) => {
        if (!block) return;
        const key = block.baseName || `${test.anchorId}-${index}`;
        const record = {
          baseName: block.baseName || key,
          title: block.title || block.baseName || 'Summary',
          html: block.html || null,
          markdown: block.markdown || null,
          createdAt: block.createdAt || null,
          source: {
            anchorId: test.anchorId,
            testTitle: test.title,
            projectName: test.projectName,
          },
        };

        if (block.setDescription) {
          summaryByKey.set(key, { ...record, setDescription: true });
        } else if (!summaryByKey.has(key)) {
          summaryByKey.set(key, { ...record, setDescription: false });
        }
      });
    }

    const runSummaries = Array.from(summaryByKey.values())
      .filter((summary) => summary.setDescription)
      .sort((a, b) => {
        const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return right - left;
      });

    const statusCounts = STATUS_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    let flakyCount = 0;

    for (const test of serialisedTests) {
      if (!statusCounts[test.status]) {
        statusCounts[test.status] = 0;
      }
      statusCounts[test.status] += 1;
      if (test.flaky) flakyCount += 1;
    }
    statusCounts.flaky = flakyCount;

    const projects = Array.from(this.projectSet).sort();

    const siteName = process.env.SITE_NAME || process.env.SITE;
    let siteBaseUrl = process.env.SITE_BASE_URL || process.env.BASE_URL || null;
    if (!siteBaseUrl && siteName) {
      const siteConfigPath = path.join(process.cwd(), 'sites', `${siteName}.json`);
      if (fs.existsSync(siteConfigPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(siteConfigPath, 'utf8'));
          if (parsed?.baseUrl) siteBaseUrl = parsed.baseUrl;
        } catch (error) {
          console.warn(`⚠️  Unable to read baseUrl from ${siteConfigPath}: ${error.message}`);
        }
      }
    }
    let profile =
      process.env.PROFILE ||
      process.env.TEST_PROFILE ||
      process.env.PLAYWRIGHT_PROFILE ||
      (process.env.SMOKE ? 'smoke' : null) ||
      (process.env.NIGHTLY ? 'nightly' : null);

    const runData = {
      title: siteName ? `${siteName} – Playwright Test Run` : 'Playwright Test Run',
      runId: this.runId,
      startedAt,
      startedAtFriendly: formatDateTime(startedAt),
      completedAt,
      completedAtFriendly: formatDateTime(completedAt),
      durationMs,
      durationFriendly: formatDuration(durationMs || 0),
      statusCounts,
      totalTests: serialisedTests.length,
      totalTestsPlanned: this.totalTestsPlanned,
      site: siteName ? { name: siteName, baseUrl: siteBaseUrl } : null,
      profile,
      projects,
      environment: {
        platform: os.platform(),
        release: os.release(),
        arch: process.arch,
        node: process.version,
      },
      tests: serialisedTests,
      schemaSummaries: serialisedTests.reduce((acc, test) => {
        if (Array.isArray(test.schemaSummaries) && test.schemaSummaries.length > 0) {
          acc.push({
            testAnchorId: test.anchorId,
            projectName: test.projectName,
            summaries: test.schemaSummaries,
          });
        }
        return acc;
      }, []),
      runSummaries,
    };

    return runData;
  }

  serialiseTest(entry) {
    const attempts = entry.attempts || [];
    const finalAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    const finalStatus = finalAttempt?.status || entry.outcome || 'unknown';
    const previousStatuses = attempts.map((attempt) => attempt.status).filter(Boolean);
    const flaky =
      finalStatus === 'passed' && previousStatuses.some((status) => status !== 'passed');

    const hash = createHash('md5').update(entry.testId).digest('hex').slice(0, 6);
    const anchorId = `${slugify(entry.projectName)}-${slugify(entry.title)}-${hash}`;
    const displayTitle =
      Array.isArray(entry.titlePath) && entry.titlePath.length > 0
        ? entry.titlePath.slice(3).filter(Boolean).join(' › ') || entry.title
        : entry.title;

    return {
      anchorId,
      testId: entry.testId,
      title: entry.title,
      displayTitle,
      titlePath: entry.titlePath,
      location: entry.location,
      projectName: entry.projectName,
      status: finalStatus,
      expectedStatus: entry.expectedStatus,
      flaky,
      durationMs: entry.durationMs,
      durationFriendly: formatDuration(entry.durationMs || 0),
      annotations: entry.annotations,
      tags: entry.tags,
      attempts: attempts.map((attempt) => ({
        ...attempt,
        startTimeFriendly: attempt.startTimeFriendly,
        durationFriendly: attempt.durationFriendly,
      })),
      summaryBlocks: entry.summaryBlocks || [],
      schemaSummaries: entry.schemaSummaries || [],
      stdout: entry.stdout || [],
      stderr: entry.stderr || [],
      errors: entry.errors || [],
    };
  }

  ensureRunDirectory(baseDir) {
    let candidate = this.runId;
    let counter = 1;
    while (fs.existsSync(path.join(baseDir, candidate))) {
      counter += 1;
      candidate = `${this.runId}-${counter}`;
    }
    if (candidate !== this.runId) {
      this.runId = candidate;
    }
    return path.join(baseDir, candidate);
  }

  writeOutputs(runData) {
    const rootDir = path.resolve(process.cwd(), this.options.outputFolder);
    fs.mkdirSync(rootDir, { recursive: true });

    const runDir = this.ensureRunDirectory(rootDir);
    fs.mkdirSync(runDir, { recursive: true });

    const dataDir = path.join(runDir, 'data');
    const testsDir = path.join(dataDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    if (this.pendingAssets.length > 0) {
      for (const asset of this.pendingAssets) {
        const assetFsPath = path.join(runDir, asset.relativePath.split('/').join(path.sep));
        fs.mkdirSync(path.dirname(assetFsPath), { recursive: true });
        try {
          if (asset.sourcePath) {
            fs.copyFileSync(asset.sourcePath, assetFsPath);
          } else if (asset.buffer) {
            fs.writeFileSync(assetFsPath, asset.buffer);
          } else {
            fs.writeFileSync(assetFsPath, '');
          }
        } catch (error) {
          console.warn(`⚠️  Failed to persist attachment "${assetFsPath}": ${error.message}`);
        } finally {
          asset.buffer = null;
        }
      }
      this.pendingAssets = [];
    }

    const reportHtml = renderReportHtml(runData);
    const reportPath = path.join(runDir, this.options.reportFileName);
    fs.writeFileSync(reportPath, reportHtml, 'utf8');

    fs.writeFileSync(path.join(dataDir, 'run.json'), JSON.stringify(runData, null, 2));

    for (const test of runData.tests) {
      fs.writeFileSync(path.join(testsDir, `${test.anchorId}.json`), JSON.stringify(test, null, 2));
    }

    const schemaMarkdownRender = renderSchemaSummariesMarkdown(runData.schemaSummaries || []);
    const schemaMarkdown = schemaMarkdownRender.markdown || '';
    const schemaPromotedBaseNames = schemaMarkdownRender.promotedBaseNames || new Set();
    const filteredMarkdownSummaries = (runData.runSummaries || []).filter((summary) =>
      summary?.baseName ? !schemaPromotedBaseNames.has(summary.baseName) : true
    );
    const runSummariesMarkdown = renderRunSummariesMarkdown(filteredMarkdownSummaries);
    const markdownSections = [schemaMarkdown, runSummariesMarkdown]
      .map((section) => (section || '').trim())
      .filter((section) => section.length > 0);

    if (markdownSections.length > 0) {
      const headerLines = [
        `# ${runData.title || 'Playwright Test Report'}`,
        '',
        `- Run ID: ${runData.runId}`,
      ];
      if (runData.durationFriendly) headerLines.push(`- Duration: ${runData.durationFriendly}`);
      headerLines.push(`- Total Tests: ${runData.totalTests}`);
      if (runData.site) headerLines.push(`- Site: ${runData.site}`);
      if (runData.profile) headerLines.push(`- Profile: ${runData.profile}`);

      const markdownContent = `${headerLines.join('\n')}\n\n${markdownSections.join('\n\n')}\n`;
      fs.writeFileSync(path.join(runDir, 'report.md'), markdownContent, 'utf8');
    }

    const relativeReportPath = path.relative(rootDir, reportPath).split(path.sep).join('/');
    const latestSummary = {
      runId: runData.runId,
      runFolder: path.relative(rootDir, runDir).split(path.sep).join('/'),
      reportRelativePath: relativeReportPath,
      startedAt: runData.startedAt,
      completedAt: runData.completedAt,
      durationMs: runData.durationMs,
      statusCounts: runData.statusCounts,
      totalTests: runData.totalTests,
      site: runData.site,
      profile: runData.profile,
    };

    fs.writeFileSync(path.join(rootDir, 'latest-run.json'), JSON.stringify(latestSummary, null, 2));

    const manifestPath = path.join(rootDir, 'manifest.json');
    let manifest = { runs: [] };
    if (fs.existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (Array.isArray(existing.runs)) {
          manifest.runs = existing.runs.filter((run) => run.runId !== latestSummary.runId);
        }
      } catch (_) {
        manifest = { runs: [] };
      }
    }

    manifest.runs.push({
      ...latestSummary,
      createdAt: new Date().toISOString(),
    });

    manifest.runs.sort((a, b) => {
      const left = new Date(a.startedAt || 0).getTime();
      const right = new Date(b.startedAt || 0).getTime();
      return right - left;
    });

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

module.exports = CustomHtmlReporter;
