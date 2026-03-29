#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const IGNORE_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'reports',
  'test-results',
  'playwright-report',
  '.idea',
  '.vscode',
]);

const ALLOWED_FILES = new Set([
  path.join('utils', 'test-helpers.js'),
  path.join('scripts', 'maintenance', 'check-browser-teardown.js'),
]);

// Ensures no spec manually calls page/context.close(), leaving teardown to fixtures.

const TARGET_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORE_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!TARGET_EXTENSIONS.has(ext)) {
      continue;
    }

    const relativePath = path.relative(repoRoot, fullPath);
    if (ALLOWED_FILES.has(relativePath)) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function findManualCloses(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = [];

  const patterns = [
    { regex: /page\.close\s*\(/g, label: 'page.close()' },
    { regex: /context\.close\s*\(/g, label: 'context.close()' },
  ];

  for (const { regex, label } of patterns) {
    let match;
    while ((match = regex.exec(content))) {
      const before = content.slice(0, match.index);
      const line = before.split(/\r?\n/).length;
      matches.push({ label, line });
    }
  }

  return matches;
}

const violations = [];
for (const filePath of walk(repoRoot)) {
  const matches = findManualCloses(filePath);
  if (matches.length === 0) {
    continue;
  }

  const relativePath = path.relative(repoRoot, filePath);
  matches.forEach((match) => {
    violations.push(`${relativePath}:${match.line} contains forbidden ${match.label}`);
  });
}

if (violations.length > 0) {
  console.error('❌ Forbidden browser teardown calls found:');
  violations.forEach((violation) => console.error(`  - ${violation}`));
  process.exit(1);
}

console.log('✅ No forbidden manual page/context close calls detected.');
