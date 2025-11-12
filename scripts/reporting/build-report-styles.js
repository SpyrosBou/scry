#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sass = require('sass');

// Compiles the SCSS report theme so docs/mocks stay in sync with the reporter styles.

const rootDir = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(rootDir, 'styles', 'report', 'report-styles.scss');
const targetPath = path.join(rootDir, 'docs', 'mocks', 'report-styles.css');

function compileStyles() {
  try {
    const result = sass.compile(sourcePath, { style: 'expanded' });
    const css = `${result.css.trim()}\n`;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, css, 'utf8');
    console.log(`✔ Compiled report styles to ${path.relative(rootDir, targetPath)}`);
  } catch (error) {
    console.error(`✖ Unable to compile report styles from ${sourcePath}: ${error.message}`);
    process.exitCode = 1;
  }
}

compileStyles();
